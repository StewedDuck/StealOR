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

async function persistVerificationDocument(document, references = {}) {
    const file = await resolveVerificationDocument(document);
    if (!file) return false;
    const data = await fs.readFile(file);
    const filename = path.basename(file);
    await require('../models/VerificationDocument').updateOne(
        { filename }, { $setOnInsert: { data }, $set: documentReferences(document, references) }, { upsert: true }
    );
    return true;
}

async function readVerificationDocument(document = {}) {
    const filename = document.storedFileName || String(document.filePath || '').replace(/\\/g, '/').split('/').pop();
    if (!filename || !/^[a-zA-Z0-9._-]+$/.test(filename) || filename === '.' || filename === '..') return null;
    const Document = require('../models/VerificationDocument');
    let stored = await Document.findOne({ filename }).select('+data').lean();
    if (!stored) {
        if (!await persistVerificationDocument(document)) return null;
        stored = await Document.findOne({ filename }).select('+data').lean();
    }
    return stored ? Buffer.from(Buffer.isBuffer(stored.data) ? stored.data : stored.data.buffer) : null;
}
module.exports.persistVerificationDocument = persistVerificationDocument;
module.exports.readVerificationDocument = readVerificationDocument;

function documentReferences(document, references = {}) {
    return Object.fromEntries(Object.entries({
        verificationId: references.verificationId,
        userId: references.userId,
        originalFileName: document.fileName,
    }).filter(([, value]) => value != null));
}
async function linkVerificationDocument(document, references) {
    const filename = document.storedFileName || String(document.filePath || '').replace(/\\/g, '/').split('/').pop();
    if (!filename) return false;
    const result = await require('../models/VerificationDocument').updateOne(
        { filename }, { $set: documentReferences(document, references) }
    );
    return result.matchedCount > 0;
}
module.exports.linkVerificationDocument = linkVerificationDocument;
