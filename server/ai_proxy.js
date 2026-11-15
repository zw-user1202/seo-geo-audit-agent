const { getActiveProvider } = require('./ai_config');
const https = require('https');

// Re-export for backward compatibility
module.exports = { getActiveProvider };
