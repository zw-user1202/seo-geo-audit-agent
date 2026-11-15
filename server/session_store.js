const path = require('path');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();

class SQLiteSessionStore extends session.Store {
    constructor({ dbPath = path.join(__dirname, '..', 'reports.db') } = {}) {
        super();

        this.db = new sqlite3.Database(dbPath);
        this.db.serialize(() => {
            this.db.run('PRAGMA journal_mode = WAL');
            this.db.run(`CREATE TABLE IF NOT EXISTS sessions (
                sid TEXT PRIMARY KEY,
                sess TEXT NOT NULL,
                expires_at INTEGER NOT NULL
            )`);
            this.db.run('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)');
        });
    }

    get(sid, callback) {
        this.db.get(
            'SELECT sess, expires_at FROM sessions WHERE sid = ?',
            [sid],
            (error, row) => {
                if (error) return callback(error);
                if (!row) return callback(null, null);

                if (row.expires_at <= Date.now()) {
                    return this.destroy(sid, (destroyError) => callback(destroyError, null));
                }

                try {
                    return callback(null, JSON.parse(row.sess));
                } catch (parseError) {
                    return callback(parseError);
                }
            }
        );
    }

    set(sid, sess, callback = () => {}) {
        const expiresAt = this.getExpiresAt(sess);
        const serialized = JSON.stringify(sess);

        this.db.run(
            `INSERT INTO sessions (sid, sess, expires_at)
             VALUES (?, ?, ?)
             ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at`,
            [sid, serialized, expiresAt],
            callback
        );
    }

    destroy(sid, callback = () => {}) {
        this.db.run('DELETE FROM sessions WHERE sid = ?', [sid], callback);
    }

    touch(sid, sess, callback = () => {}) {
        this.set(sid, sess, callback);
    }

    close(callback = () => {}) {
        this.db.close(callback);
    }

    getExpiresAt(sess) {
        if (sess?.cookie?.expires) {
            return new Date(sess.cookie.expires).getTime();
        }

        const maxAge = typeof sess?.cookie?.maxAge === 'number'
            ? sess.cookie.maxAge
            : 24 * 60 * 60 * 1000;

        return Date.now() + maxAge;
    }
}

module.exports = {
    SQLiteSessionStore
};
