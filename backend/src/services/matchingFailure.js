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
module.exports = { describeMatchingFailure };
