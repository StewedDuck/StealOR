const path = require('node:path');
const fs = require('node:fs/promises');
const verificationDirectory = path.resolve(__dirname, '../../uploads/verifications');
async function resolveVerificationDocument(document = {}) {
    const filename = document.storedFileName || String(document.filePath || '').replace(/\\/g, '/').split('/').pop();
    if (!filename || filename === '.' || filename === '..' || !/^[a-zA-Z0-9._-]+$/.test(filename)) return null;
    try {
        const root = await fs.realpath(verificationDirectory);
        const candidate = await fs.realpath(path.join(root, filename));
        if (path.dirname(candidate) !== root || !(await fs.stat(candidate)).isFile()) return null;
        return candidate;
    } catch { return null; }
}
module.exports = { verificationDirectory, resolveVerificationDocument };
