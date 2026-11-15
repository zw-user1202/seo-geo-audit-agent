function buildSessionOptions(env = process.env) {
    const isProduction = env.NODE_ENV === 'production';
    const secret = env.SESSION_SECRET || (isProduction ? null : 'dev-only-session-secret-change-me');

    if (!secret) {
        throw new Error('SESSION_SECRET is required in production');
    }

    return {
        name: 'seo.sid',
        secret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: isProduction,
            maxAge: 24 * 60 * 60 * 1000
        }
    };
}

function isAllowedOrigin(value, expectedHost) {
    if (!value || !expectedHost) return false;

    try {
        return new URL(value).host === expectedHost;
    } catch (error) {
        return false;
    }
}

function requireSameOrigin(req, res, next) {
    const method = req.method.toUpperCase();

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        return next();
    }

    const host = req.get('host');
    const origin = req.get('origin');
    const referer = req.get('referer');

    if (origin && !isAllowedOrigin(origin, host)) {
        return res.status(403).json({ error: 'Invalid request origin' });
    }

    if (!origin && referer && !isAllowedOrigin(referer, host)) {
        return res.status(403).json({ error: 'Invalid request referer' });
    }

    next();
}

module.exports = {
    buildSessionOptions,
    isAllowedOrigin,
    requireSameOrigin
};
