// Only fixed categories leave this module; raw SDK errors can contain input data.
function describeMatchingFailure(error) {
    const status = Number(error?.status || error?.statusCode || error?.code);
    const message = String(error?.message || '').toLowerCase();
    let code = 'AI_UNAVAILABLE';
    if (error?.code === 'VERTEX_CONFIGURATION_ERROR') code = 'AI_CONFIGURATION';
    else if (status === 401 || status === 403 || /credential|unauthenticated|permission denied/.test(message)) code = 'AI_AUTHENTICATION';
    else if (status === 400) code = 'AI_REQUEST_REJECTED';
    else if (status === 429) code = 'AI_RATE_LIMIT';
    else if (/timeout|timed out|abort|deadline/.test(message)) code = 'AI_TIMEOUT';
    else if (/incomplete/.test(message)) code = 'AI_INCOMPLETE_RESPONSE';
    else if (error instanceof SyntaxError || /invalid.*response|invalid.*index|invalid.*evidence/.test(message)) code = 'AI_INVALID_RESPONSE';
    return { code, retryable: !['AI_CONFIGURATION', 'AI_AUTHENTICATION', 'AI_REQUEST_REJECTED'].includes(code) };
}
// Only a validated, changed runtime configuration may reopen configuration failures.
// Keep this separate from scoring fingerprints so successful results remain reusable.
function configurationRecoveryKey() {
    try {
        const config = require('../config/vertex').getVertexConfig();
        const stat = require('node:fs').statSync(config.credentialsPath);
        return require('./matchingCache').hash({ ...config, credentialModifiedAt: stat.mtimeMs });
    } catch { return null; }
}
function canRecoverConfiguration(code, attemptedKey, currentKey = configurationRecoveryKey()) {
    return code === 'AI_CONFIGURATION' && !!currentKey && attemptedKey !== currentKey;
}
module.exports = { describeMatchingFailure, configurationRecoveryKey, canRecoverConfiguration };
