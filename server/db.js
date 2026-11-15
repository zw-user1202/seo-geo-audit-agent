const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { buildLatestReportQuery } = require('./report_queries');

// 数据库初始化
const dbPath = path.join(__dirname, '..', 'reports.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('数据库连接失败:', err.message);
    } else {
        console.log('已连接到 SQLite 数据库');
        // --- 多用户并发优化 ---
        // 1. 开启 WAL 模式 (Write-Ahead Logging)，允许读写并行
        db.run('PRAGMA journal_mode = WAL');
        db.run('PRAGMA foreign_keys = ON');
        // 2. 设置繁忙等待时间，减少 "Database is locked" 错误
        db.configure('busyTimeout', 10000);
    }
});

// 创建用户表和报告表
db.serialize(() => {
    // 用户表
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
    )`);

    // 报告表
    db.run(`CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT,
        score INTEGER,
        stats TEXT,
        data TEXT,
        user_agent TEXT,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // 为已存在的表添加 user_agent 列（如果不存在）
    db.run(`ALTER TABLE reports ADD COLUMN user_agent TEXT`, (err) => {
        // 忽略"列已存在"错误
        if (err && !err.message.includes('duplicate column name')) {
            console.error('添加 user_agent 列失败:', err.message);
        }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id)`);

    db.run(`CREATE TABLE IF NOT EXISTS analysis_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        user_agent TEXT DEFAULT 'pc',
        mode TEXT DEFAULT 'single',
        analysis_types TEXT DEFAULT 'seo,geo',
        status TEXT CHECK(status IN ('queued','running','completed','failed','cancelled')),
        current_step TEXT,
        progress INTEGER DEFAULT 0,
        error TEXT,
        report_id INTEGER,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL
    )`);

    // 为已存在的表添加 analysis_types 列（如果不存在）
    db.run(`ALTER TABLE analysis_jobs ADD COLUMN analysis_types TEXT DEFAULT 'seo,geo'`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('添加 analysis_types 列失败:', err.message);
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS agent_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        step_key TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT CHECK(status IN ('pending','running','completed','failed','skipped')),
        progress INTEGER DEFAULT 0,
        message TEXT,
        details TEXT,
        started_at DATETIME,
        completed_at DATETIME,
        sort_order INTEGER,
        FOREIGN KEY (job_id) REFERENCES analysis_jobs(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user_id ON analysis_jobs(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_analysis_jobs_created_at ON analysis_jobs(created_at DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_agent_steps_job_id ON agent_steps(job_id)`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_steps_job_step ON agent_steps(job_id, step_key)`);
});

function saveReport(url, score, stats, data, userId, userAgent, callback) {
    const stmt = db.prepare(`INSERT INTO reports (url, score, stats, data, user_id, user_agent) VALUES (?, ?, ?, ?, ?, ?)`);
    stmt.run(url, score, JSON.stringify(stats), JSON.stringify(data), userId, userAgent || 'pc', function (err) {
        callback(err, this ? this.lastID : null);
    });
    stmt.finalize();
}

function getLatestReport(userId, isAdmin, callback) {
    const { sql, params } = buildLatestReportQuery({ userId, isAdmin });

    db.get(sql, params, (err, row) => {
        if (row) {
            try {
                row.stats = JSON.parse(row.stats);
                row.data = JSON.parse(row.data);
            } catch (e) {
                console.error('Parse error in getLatestReport:', e);
            }
        }
        callback(err, row);
    });
}

function getHistoryReports(limit = 20, offset = 0, userId = null, callback) {
    let query = `
        SELECT
            reports.id,
            reports.url,
            reports.score,
            reports.created_at,
            reports.user_agent,
            reports.user_id,
            users.username
        FROM reports
        LEFT JOIN users ON reports.user_id = users.id
    `;
    let params = [];

    // If userId is provided and not null, filter by user
    if (userId !== null) {
        query += ` WHERE reports.user_id = ?`;
        params.push(userId);
    }

    query += ` ORDER BY reports.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    db.all(query, params, (err, rows) => {
        callback(err, rows);
    });
}

function getReportById(id, callback) {
    db.get(`SELECT * FROM reports WHERE id = ?`, [id], (err, row) => {
        if (row) {
            try {
                row.stats = JSON.parse(row.stats);
                row.data = JSON.parse(row.data);
            } catch (e) {
                console.error('Parse error in getReportById:', e);
            }
        }
        callback(err, row);
    });
}

function deleteReport(reportId, userId, isAdmin, callback) {
    let query, params;

    if (isAdmin) {
        // Admins can delete any report
        query = `DELETE FROM reports WHERE id = ?`;
        params = [reportId];
    } else {
        // Users can only delete their own reports
        query = `DELETE FROM reports WHERE id = ? AND user_id = ?`;
        params = [reportId, userId];
    }

    db.run(query, params, function(err) {
        callback(err, this ? this.changes : 0);
    });
}

// ===== User Management Functions =====

function createUser(username, passwordHash, role, callback) {
    const stmt = db.prepare(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`);
    stmt.run(username, passwordHash, role, function (err) {
        callback(err, this ? this.lastID : null);
    });
    stmt.finalize();
}

function getUserByUsername(username, callback) {
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
        callback(err, row);
    });
}

function getUserById(id, callback) {
    db.get(`SELECT id, username, role, created_at, last_login FROM users WHERE id = ?`, [id], (err, row) => {
        callback(err, row);
    });
}

function getAllUsers(callback) {
    const query = `
        SELECT 
            users.id, 
            users.username, 
            users.role, 
            users.created_at, 
            users.last_login,
            COUNT(reports.id) as report_count
        FROM users
        LEFT JOIN reports ON users.id = reports.user_id
        GROUP BY users.id
        ORDER BY users.created_at DESC
    `;
    db.all(query, (err, rows) => {
        callback(err, rows || []);
    });
}

function updateUserPassword(userId, newPasswordHash, callback) {
    db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [newPasswordHash, userId], (err) => {
        callback(err);
    });
}

function updateUserRole(userId, newRole, callback) {
    db.run(`UPDATE users SET role = ? WHERE id = ?`, [newRole, userId], (err) => {
        callback(err);
    });
}

function updateLastLogin(userId, callback) {
    db.run(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`, [userId], (err) => {
        callback(err);
    });
}

function deleteUser(userId, callback) {
    // CASCADE will automatically delete user's reports
    db.run(`DELETE FROM users WHERE id = ?`, [userId], (err) => {
        callback(err);
    });
}

// Promisified versions for async/await support
function getAllUsersPromise() {
    return new Promise((resolve, reject) => {
        getAllUsers((err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function createUserPromise(username, passwordHash, role) {
    return new Promise((resolve, reject) => {
        createUser(username, passwordHash, role, (err, id) => {
            if (err) reject(err);
            else resolve(id);
        });
    });
}

module.exports = {
    rawDb: db,
    saveReport,
    getLatestReport,
    getHistoryReports,
    getReportById,
    deleteReport,
    createUser,
    getUserByUsername,
    getUserById,
    getAllUsers,
    updateUserPassword,
    updateUserRole,
    updateLastLogin,
    deleteUser,
    getAllUsersPromise,
    createUserPromise
};
