function buildLatestReportQuery({ userId = null, isAdmin = false } = {}) {
    if (!isAdmin) {
        return {
            sql: 'SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
            params: [userId]
        };
    }

    return {
        sql: 'SELECT * FROM reports ORDER BY created_at DESC, id DESC LIMIT 1',
        params: []
    };
}

module.exports = {
    buildLatestReportQuery
};
