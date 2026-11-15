/**
 * Authentication Module
 * Handles password hashing, verification, and middleware for protected routes
 */

const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;

/**
 * Hash a plaintext password using bcrypt
 * @param {string} plaintext - The password to hash
 * @returns {Promise<string>} The hashed password
 */
async function hashPassword(plaintext) {
    return await bcrypt.hash(plaintext, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a hash
 * @param {string} plaintext - The password to verify
 * @param {string} hash - The stored hash
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(plaintext, hash) {
    return await bcrypt.compare(plaintext, hash);
}

function getBootstrapAdminCredentials(env = process.env) {
    const username = env.DEFAULT_ADMIN_USERNAME?.trim();
    const password = env.DEFAULT_ADMIN_PASSWORD;

    if (!username || !password) {
        return null;
    }

    if (username === 'admin' && password === 'admin123') {
        throw new Error('Bootstrap admin must not use insecure default credentials');
    }

    if (password.length < 12) {
        throw new Error('Bootstrap admin password must be at least 12 characters');
    }

    return { username, password };
}

/**
 * Middleware: Require authentication
 * Blocks access if user is not logged in
 */
function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Please log in to access this resource'
        });
    }
    next();
}

/**
 * Middleware: Require admin role
 * Blocks access if user is not an admin
 */
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Please log in to access this resource'
        });
    }

    if (req.session.userRole !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Admin privileges required'
        });
    }

    next();
}

/**
 * Initialize default admin account if no users exist
 * @param {Object} db - Database instance with user functions
 */
async function initializeDefaultAdmin(db) {
    try {
        const users = await db.getAllUsersPromise();

        if (users.length === 0) {
            const bootstrapAdmin = getBootstrapAdminCredentials();

            if (!bootstrapAdmin) {
                console.warn('No users exist and no bootstrap admin credentials were provided. Set DEFAULT_ADMIN_USERNAME and DEFAULT_ADMIN_PASSWORD to create the initial admin account.');
                return;
            }

            const passwordHash = await hashPassword(bootstrapAdmin.password);
            await db.createUserPromise(bootstrapAdmin.username, passwordHash, 'admin');

            console.log(`Initial admin account created for username "${bootstrapAdmin.username}" from environment configuration.`);
        }
    } catch (error) {
        console.error('Failed to initialize default admin:', error);
        throw error;
    }
}

module.exports = {
    hashPassword,
    verifyPassword,
    getBootstrapAdminCredentials,
    requireAuth,
    requireAdmin,
    initializeDefaultAdmin
};
