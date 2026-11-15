// 防止EPIPE错误导致进程崩溃
process.on('uncaughtException', (err) => {
    if (err.code === 'EPIPE' || err.message?.includes('EPIPE')) {
        console.error('EPIPE error caught, ignoring:', err.message);
        return;
    }
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

// Import modules
const db = require('./server/db');
const { fetchWebsiteHtml, fetchRobotsAndSitemap } = require('./server/fetcher');
const { performSEOAnalysis } = require('./server/seo_analyzer');
const auth = require('./server/auth');
const logger = require('./server/logger');
const { buildSessionOptions, requireSameOrigin } = require('./server/security');
const { SQLiteSessionStore } = require('./server/session_store');
const { createAgentStore } = require('./server/agent_store');
const { createAgentRunner, fetchWebsiteHtmlAsync, analyzeSEOAsync, saveReportAsync } = require('./server/agent_runner');
const { createAgentRouter } = require('./server/agent_routes');
const { extractPageSignals } = require('./server/page_signals');
const { analyzeGEO } = require('./server/geo_analyzer');
const { composeAgentReport } = require('./server/report_composer');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Middleware Configuration =====

// Body parsers
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session configuration
app.use(session({
    ...buildSessionOptions(process.env),
    store: new SQLiteSessionStore()
}));
app.use(requireSameOrigin);

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`, { ip: req.ip });
    next();
});

const agentStore = createAgentStore(db.rawDb);
const agentRunner = createAgentRunner({
    store: agentStore,
    fetchWebsiteHtmlAsync: (url, userAgent) => fetchWebsiteHtmlAsync(fetchWebsiteHtml, url, userAgent),
    fetchRobotsAndSitemap,
    extractPageSignals,
    analyzeSEO: (html, url, robotsSitemapData) => analyzeSEOAsync(performSEOAnalysis, html, url, robotsSitemapData),
    analyzeGEO,
    composeAgentReport,
    saveReportAsync: (payload) => saveReportAsync(db, payload)
});

// ===== Authentication Routes =====

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password, rememberMe } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        db.getUserByUsername(username, async (err, user) => {
            if (err) {
                logger.error('Database error during login', { error: err.message });
                return res.status(500).json({ error: 'Internal server error' });
            }

            if (!user) {
                logger.warn('Login attempt with invalid username', { username });
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const isValid = await auth.verifyPassword(password, user.password_hash);

            if (!isValid) {
                logger.warn('Login attempt with invalid password', { username });
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Update last login
            db.updateLastLogin(user.id, () => { });

            req.session.regenerate((sessionErr) => {
                if (sessionErr) {
                    logger.error('Session regeneration failed during login', { error: sessionErr.message, username });
                    return res.status(500).json({ error: 'Internal server error' });
                }

                req.session.userId = user.id;
                req.session.username = user.username;
                req.session.userRole = user.role;

                if (rememberMe) {
                    req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000;
                }

                req.session.save((saveErr) => {
                    if (saveErr) {
                        logger.error('Session save failed during login', { error: saveErr.message, username });
                        return res.status(500).json({ error: 'Internal server error' });
                    }

                    logger.info('User logged in successfully', { username, role: user.role });
                    res.json({
                        success: true,
                        user: {
                            id: user.id,
                            username: user.username,
                            role: user.role
                        }
                    });
                });
            });
        });
    } catch (error) {
        logger.error('Login error', { error: error.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Registration
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        // Check if username already exists
        db.getUserByUsername(username, async (err, existingUser) => {
            if (err) {
                logger.error('Database error during registration', { error: err.message });
                return res.status(500).json({ error: 'Internal server error' });
            }

            if (existingUser) {
                return res.status(409).json({ error: 'Username already exists' });
            }

            try {
                // Hash password and create user
                const passwordHash = await auth.hashPassword(password);
                db.createUser(username, passwordHash, 'user', (err, userId) => {
                    if (err) {
                        logger.error('Failed to create user', { error: err.message });
                        return res.status(500).json({ error: 'Failed to create account' });
                    }

                    logger.info('User registered successfully', { username, userId });
                    res.json({
                        success: true,
                        message: 'Registration successful',
                        user: { id: userId, username, role: 'user' }
                    });
                });
            } catch (hashError) {
                logger.error('Password hashing failed', { error: hashError.message });
                return res.status(500).json({ error: 'Internal server error' });
            }
        });
    } catch (error) {
        logger.error('Registration error', { error: error.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    const username = req.session?.username;
    req.session.destroy((err) => {
        if (err) {
            logger.error('Logout error', { error: err.message });
            return res.status(500).json({ error: 'Failed to logout' });
        }
        res.clearCookie('seo.sid');
        logger.info('User logged out', { username });
        res.json({ success: true });
    });
});

// Check session
app.get('/api/check-session', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            authenticated: true,
            user: {
                id: req.session.userId,
                username: req.session.username,
                role: req.session.userRole
            }
        });
    } else {
        res.status(401).json({ authenticated: false });
    }
});

// ===== User Management Routes (Admin Only) =====

// Get all users
app.get('/api/users', auth.requireAdmin, (req, res) => {
    db.getAllUsers((err, users) => {
        if (err) {
            logger.error('Failed to fetch users', { error: err.message });
            return res.status(500).json({ error: 'Failed to fetch users' });
        }
        res.json(users);
    });
});

// Create user
app.post('/api/users', auth.requireAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password || !role) {
            return res.status(400).json({ error: 'Username, password, and role required' });
        }

        if (!['user', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const passwordHash = await auth.hashPassword(password);

        db.createUser(username, passwordHash, role, (err, userId) => {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ error: 'Username already exists' });
                }
                logger.error('Failed to create user', { error: err.message });
                return res.status(500).json({ error: 'Failed to create user' });
            }

            logger.info('User created', { userId, username, role, createdBy: req.session.username });
            res.json({ success: true, userId });
        });
    } catch (error) {
        logger.error('Create user error', { error: error.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user
app.put('/api/users/:id', auth.requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { password, role } = req.body;

        if (password) {
            const passwordHash = await auth.hashPassword(password);
            db.updateUserPassword(userId, passwordHash, (err) => {
                if (err) {
                    logger.error('Failed to update password', { error: err.message, userId });
                    return res.status(500).json({ error: 'Failed to update password' });
                }
                logger.info('User password updated', { userId, updatedBy: req.session.username });
                res.json({ success: true });
            });
        } else if (role) {
            if (!['user', 'admin'].includes(role)) {
                return res.status(400).json({ error: 'Invalid role' });
            }
            db.updateUserRole(userId, role, (err) => {
                if (err) {
                    logger.error('Failed to update role', { error: err.message, userId });
                    return res.status(500).json({ error: 'Failed to update role' });
                }
                logger.info('User role updated', { userId, newRole: role, updatedBy: req.session.username });
                res.json({ success: true });
            });
        } else {
            res.status(400).json({ error: 'No update fields provided' });
        }
    } catch (error) {
        logger.error('Update user error', { error: error.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete user
app.delete('/api/users/:id', auth.requireAdmin, (req, res) => {
    const userId = parseInt(req.params.id);

    // Prevent deleting yourself
    if (userId === req.session.userId) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    db.deleteUser(userId, (err) => {
        if (err) {
            logger.error('Failed to delete user', { error: err.message, userId });
            return res.status(500).json({ error: 'Failed to delete user' });
        }
        logger.info('User deleted', { userId, deletedBy: req.session.username });
        res.json({ success: true });
    });
});

// ===== Report Routes (Protected) =====

// Save report
app.post('/api/save-report', auth.requireAuth, (req, res) => {
    const { url, score, stats, data, userAgent } = req.body;
    const userId = req.session.userId;

    logger.info('Saving report to database', { url, userId, userAgent });

    db.saveReport(url, score, stats, data, userId, userAgent, (err, id) => {
        if (err) {
            logger.error('Failed to save report', { error: err.message, url });
            return res.status(500).json({ error: err.message });
        }
        logger.info('Report saved successfully', { id, url, score, userId, userAgent });
        res.json({ success: true, id });
    });
});

// Get latest report
app.get('/api/get-latest-report', auth.requireAuth, (req, res) => {
    logger.info('Fetching latest report');
    db.getLatestReport(req.session.userId, req.session.userRole === 'admin', (err, row) => {
        if (err) {
            logger.error('Failed to fetch latest report', { error: err.message });
            return res.status(500).json({ error: err.message });
        }
        logger.info('Latest report fetched successfully', { hasData: !!row });
        res.json(row || null);
    });
});

// Get history reports
app.get('/api/get-history', auth.requireAuth, (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    // Admins can see all reports (default) or filter by userId
    let userId = req.session.userRole === 'admin' ? null : req.session.userId;

    // If admin provides a specific userId, use that instead
    if (req.session.userRole === 'admin' && req.query.userId) {
        userId = parseInt(req.query.userId);
    }

    logger.info('Fetching history reports', { limit, offset, userId });

    db.getHistoryReports(limit, offset, userId, (err, rows) => {
        if (err) {
            logger.error('Failed to fetch history', { error: err.message });
            return res.status(500).json({ error: err.message });
        }
        logger.info('History reports fetched successfully', { count: rows?.length || 0 });
        res.json(rows || []);
    });
});

// Get report by ID
app.get('/api/get-report', auth.requireAuth, (req, res) => {
    const id = req.query.id;

    if (!id) {
        logger.warn('Missing id parameter in get-report');
        return res.status(400).json({ error: 'Missing id parameter' });
    }

    logger.info('Fetching report by ID', { id });

    db.getReportById(id, (err, row) => {
        if (err) {
            logger.error('Failed to fetch report', { error: err.message, id });
            return res.status(500).json({ error: err.message });
        }

        if (!row) {
            return res.status(404).json({ error: 'Report not found' });
        }

        // Check ownership (admins can view all)
        if (req.session.userRole !== 'admin' && row.user_id !== req.session.userId) {
            logger.warn('Unauthorized report access attempt', { reportId: id, userId: req.session.userId });
            return res.status(403).json({ error: 'Access denied' });
        }

        logger.info('Report fetched successfully', { id, hasData: !!row });
        res.json(row);
    });
});

// Delete report
app.delete('/api/reports/:id', auth.requireAuth, (req, res) => {
    const reportId = parseInt(req.params.id);
    const userId = req.session.userId;
    const isAdmin = req.session.userRole === 'admin';

    logger.info('Deleting report', { reportId, userId, isAdmin });

    db.deleteReport(reportId, userId, isAdmin, (err, changes) => {
        if (err) {
            logger.error('Failed to delete report', { error: err.message, reportId });
            return res.status(500).json({ error: 'Failed to delete report' });
        }

        if (changes === 0) {
            return res.status(404).json({ error: 'Report not found or no permission' });
        }

        logger.info('Report deleted successfully', { reportId, deletedBy: req.session.username });
        res.json({ success: true });
    });
});

// ===== Analysis Routes (Protected) =====

// Fetch HTML
app.get('/api/fetch-html', auth.requireAuth, (req, res) => {
    const targetUrl = req.query.url;
    const ua = req.query.ua || 'pc';

    if (!targetUrl) {
        logger.warn('Missing url parameter in fetch-html');
        return res.status(400).json({ error: 'Missing url parameter' });
    }

    logger.info('Fetching HTML', { url: targetUrl, ua });

    fetchWebsiteHtml(targetUrl, ua, (err, html) => {
        if (err) {
            logger.error('Failed to fetch HTML', { error: err.message, url: targetUrl });
            return res.status(500).json({ error: err.message });
        }
        logger.info('HTML fetched successfully', { url: targetUrl, size: html?.length || 0 });
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.json({ contents: html });
    });
});

// DeepSeek analysis
app.post('/api/deepseek', auth.requireAuth, async (req, res) => {
    const { htmlContent, url: targetUrl } = req.body;

    logger.info('Performing SEO analysis', { url: targetUrl, contentSize: htmlContent?.length || 0 });

    // Fetch robots.txt + sitemap.xml in parallel (non-blocking)
    let robotsSitemapData = null;
    try {
        robotsSitemapData = await fetchRobotsAndSitemap(targetUrl);
    } catch (e) {
        logger.warn('Robots/sitemap fetch failed', { error: e.message, url: targetUrl });
    }

    performSEOAnalysis(htmlContent, targetUrl, robotsSitemapData, (err, result) => {
        if (err) {
            logger.error('SEO analysis failed', { error: err.message, url: targetUrl });
            return res.status(500).json({ error: err.message });
        }
        // Attach robots/sitemap data to response
        if (robotsSitemapData) {
            result.robots_sitemap = robotsSitemapData;
        }
        logger.info('SEO analysis completed successfully', { url: targetUrl });
        res.json(result);
    });
});

app.use('/api/agent', createAgentRouter({ store: agentStore, runner: agentRunner, logger }));

// ===== Static Files =====

// Serve static files from web directory
app.use(express.static(path.join(__dirname, 'web')));

// Favicon handler
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// ===== Server Initialization =====

// Initialize default admin and start server
(async () => {
    try {
        await auth.initializeDefaultAdmin(db);
        await agentStore.initialize();

        app.listen(PORT, () => {
            logger.info(`SEO工具服务已启动`, { port: PORT, url: `http://localhost:${PORT}` });
        });
    } catch (error) {
        logger.error('Failed to start server', { error: error.message });
        process.exit(1);
    }
})();

// Error handlers
process.on('uncaughtException', (err) => logger.error('Uncaught Exception', { error: err.message, stack: err.stack }));
process.on('unhandledRejection', (reason) => logger.error('Unhandled Rejection', { reason: reason?.message || reason }));
