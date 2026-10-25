const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { verificationDirectory, resolveVerificationDocument } = require('../src/services/verificationStorage');
test('legacy Mac paths resolve by stored filename in current upload directory', async () => {
    const filename = `test-${randomUUID()}.pdf`;
    const file = path.join(verificationDirectory, filename);
    await fs.mkdir(verificationDirectory, { recursive: true });
    await fs.writeFile(file, 'test');
    try {
        assert.equal(await resolveVerificationDocument({ storedFileName: filename, filePath: `/Users/old/backend/uploads/verifications/${filename}` }), await fs.realpath(file));
        assert.equal(await resolveVerificationDocument({ filePath: `uploads/verifications/${filename}` }), await fs.realpath(file));
        assert.equal(await resolveVerificationDocument({ filePath: `C:\\old\\uploads\\verifications\\${filename}` }), await fs.realpath(file));
    } finally { await fs.unlink(file); }
});
test('missing documents and traversal paths are not served', async () => {
    assert.equal(await resolveVerificationDocument({ storedFileName: 'missing-file.pdf' }), null);
    assert.equal(await resolveVerificationDocument({ storedFileName: '../../package.json' }), null);
    assert.equal(await resolveVerificationDocument({ storedFileName: '..' }), null);
});
