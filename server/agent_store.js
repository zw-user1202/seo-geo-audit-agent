const { DEFAULT_AGENT_STEPS } = require('./agent_steps');

function run(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(error) {
            if (error) reject(error);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function get(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) reject(error);
            else resolve(row || null);
        });
    });
}

function all(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) reject(error);
            else resolve(rows || []);
        });
    });
}

function mapJobFields(fields) {
    const entries = [];
    const params = [];
    const mapping = {
        status: 'status',
        currentStep: 'current_step',
        progress: 'progress',
        error: 'error',
        reportId: 'report_id',
        startedAt: 'started_at',
        completedAt: 'completed_at'
    };

    Object.entries(mapping).forEach(([key, column]) => {
        if (Object.prototype.hasOwnProperty.call(fields, key)) {
            entries.push(`${column} = ?`);
            params.push(fields[key]);
        }
    });

    return { entries, params };
}

function mapStepFields(fields) {
    const entries = [];
    const params = [];

    ['status', 'progress', 'message', 'details'].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(fields, key)) {
            entries.push(`${key} = ?`);
            params.push(key === 'details' && typeof fields[key] !== 'string' ? JSON.stringify(fields[key]) : fields[key]);
        }
    });

    if (fields.status === 'running') {
        entries.push('started_at = COALESCE(started_at, CURRENT_TIMESTAMP)');
    }

    if (['completed', 'failed', 'skipped'].includes(fields.status)) {
        entries.push('completed_at = CURRENT_TIMESTAMP');
    }

    return { entries, params };
}

function createAgentStore(db) {
    return {
        async initialize() {
            await run(db, `CREATE TABLE IF NOT EXISTS analysis_jobs (
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
            await run(db, `ALTER TABLE analysis_jobs ADD COLUMN analysis_types TEXT DEFAULT 'seo,geo'`).catch((error) => {
                if (!error.message.includes('duplicate column name')) throw error;
            });
            await run(db, `CREATE TABLE IF NOT EXISTS agent_steps (
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
            await run(db, 'CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user_id ON analysis_jobs(user_id)');
            await run(db, 'CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status)');
            await run(db, 'CREATE INDEX IF NOT EXISTS idx_analysis_jobs_created_at ON analysis_jobs(created_at DESC)');
            await run(db, 'CREATE INDEX IF NOT EXISTS idx_agent_steps_job_id ON agent_steps(job_id)');
            await run(db, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_steps_job_step ON agent_steps(job_id, step_key)');
        },

        async createJob({ url, userAgent = 'pc', userId, mode = 'single', analysisTypes = ['seo', 'geo'], aiProvider = 'deepseek' }) {
            const analysisTypesValue = [...new Set(analysisTypes)].join(',');
            const result = await run(
                db,
                `INSERT INTO analysis_jobs (url, user_agent, mode, analysis_types, status, progress, user_id, ai_provider)
                 VALUES (?, ?, ?, ?, 'queued', 0, ?, ?)`,
                [url, userAgent, mode, analysisTypesValue, userId, aiProvider]
            );
            const jobId = result.lastID;

            for (let index = 0; index < DEFAULT_AGENT_STEPS.length; index += 1) {
                const step = DEFAULT_AGENT_STEPS[index];
                await run(
                    db,
                    `INSERT INTO agent_steps (job_id, step_key, title, status, progress, sort_order)
                     VALUES (?, ?, ?, 'pending', 0, ?)`,
                    [jobId, step.stepKey, step.title, index]
                );
            }

            return jobId;
        },

        async startJob(jobId) {
            await run(
                db,
                `UPDATE analysis_jobs
                 SET status = 'running', started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
                 WHERE id = ?`,
                [jobId]
            );
        },

        async updateJob(jobId, fields) {
            const { entries, params } = mapJobFields(fields);
            if (entries.length === 0) return;

            params.push(jobId);
            await run(db, `UPDATE analysis_jobs SET ${entries.join(', ')} WHERE id = ?`, params);
        },

        async updateStep(jobId, stepKey, fields) {
            const { entries, params } = mapStepFields(fields);
            if (entries.length === 0) return;

            params.push(jobId, stepKey);
            await run(db, `UPDATE agent_steps SET ${entries.join(', ')} WHERE job_id = ? AND step_key = ?`, params);
        },

        async cancelJob(jobId) {
            await run(db, `UPDATE analysis_jobs SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE id = ?`, [jobId]);
            await run(db, `UPDATE agent_steps SET status = 'skipped', message = '' WHERE job_id = ? AND status IN ('pending', 'running')`, [jobId]);
        },

        async getJobWithSteps({ jobId, userId, isAdmin = false }) {
            const job = isAdmin
                ? await get(db, 'SELECT * FROM analysis_jobs WHERE id = ?', [jobId])
                : await get(db, 'SELECT * FROM analysis_jobs WHERE id = ? AND user_id = ?', [jobId, userId]);
            if (!job) return null;

            job.steps = await all(db, 'SELECT * FROM agent_steps WHERE job_id = ? ORDER BY sort_order ASC', [jobId]);
            return job;
        }
    };
}

module.exports = {
    createAgentStore
};
