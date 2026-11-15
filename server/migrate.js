/**
 * Database Migration Script
 * Adds user_id column to existing reports table
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'reports.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Starting database migration...\n');

db.serialize(() => {
    // Check if user_id column already exists
    db.all("PRAGMA table_info(reports)", (err, columns) => {
        if (err) {
            console.error('❌ Failed to read table info:', err);
            process.exit(1);
        }

        const hasUserId = columns.some(col => col.name === 'user_id');

        if (hasUserId) {
            console.log('✅ Column user_id already exists. No migration needed.');
            db.close();
            return;
        }

        console.log('📝 Adding user_id column to reports table...');

        // Add user_id column (will be NULL for existing rows)
        db.run(`ALTER TABLE reports ADD COLUMN user_id INTEGER`, (err) => {
            if (err) {
                console.error('❌ Failed to add user_id column:', err);
                process.exit(1);
            }

            console.log('✅ user_id column added successfully');

            // Create index
            console.log('📝 Creating index on user_id...');
            db.run(`CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id)`, (err) => {
                if (err) {
                    console.error('❌ Failed to create index:', err);
                    process.exit(1);
                }

                console.log('✅ Index created successfully');
                console.log('\n🎉 Migration completed!\n');
                console.log('ℹ️  Note: Existing reports have user_id = NULL');
                console.log('   They will be accessible to all admins.\n');

                db.close();
            });
        });
    });
});
