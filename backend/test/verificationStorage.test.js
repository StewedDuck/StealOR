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

test('shared bytes open without any local file, with exact buffer boundaries', async t => {
    const Document = require('../src/models/VerificationDocument');
    const bytes = Buffer.from('%PDF-shared-document');
    t.mock.method(Document, 'findOne', query => {
        assert.equal(query.filename, 'remote.pdf');
        return { select: field => { assert.equal(field, '+data'); return { lean: async () => ({ data: bytes }) }; } };
    });
    const { readVerificationDocument } = require('../src/services/verificationStorage');
    assert.deepEqual(await readVerificationDocument({ storedFileName: 'remote.pdf' }), bytes);
    assert.equal(await readVerificationDocument({ storedFileName: '../remote.pdf' }), null);
});
test('local originals are copied to shared storage before acceptance', async t => {
    const Document = require('../src/models/VerificationDocument');
    const filename = `test-${randomUUID()}.pdf`;
    const file = path.join(verificationDirectory, filename);
    const bytes = Buffer.from('%PDF-original');
    await fs.mkdir(verificationDirectory, { recursive: true });
    await fs.writeFile(file, bytes);
    t.mock.method(Document, 'updateOne', async (query, update, options) => {
        assert.equal(query.filename, filename);
        assert.deepEqual(update.$setOnInsert.data, bytes);
        assert.equal(options.upsert, true);
        assert.deepEqual(update.$set, { verificationId: 'request-id', userId: 'owner-id', originalFileName: 'original.pdf' });
    });
    try {
        assert.equal(await require('../src/services/verificationStorage').persistVerificationDocument({ storedFileName: filename, fileName: 'original.pdf' }, { verificationId: 'request-id', userId: 'owner-id' }), true);
    } finally { await fs.unlink(file); }
});

test('backfill links existing bytes without a disk copy or overwriting file contents', async t => {
    const Document = require('../src/models/VerificationDocument');
    t.mock.method(Document, 'updateOne', async (query, update, options) => {
        assert.deepEqual(query, { filename: 'existing.pdf' });
        assert.deepEqual(update, { $set: { verificationId: 'request-id', userId: 'owner-id', originalFileName: 'original.pdf' } });
        assert.equal(options, undefined);
        return { matchedCount: 1 };
    });
    assert.equal(await require('../src/services/verificationStorage').linkVerificationDocument(
        { storedFileName: 'existing.pdf', fileName: 'original.pdf' }, { verificationId: 'request-id', userId: 'owner-id' }
    ), true);
});
