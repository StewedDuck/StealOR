// Copies existing local documents into shared MongoDB storage without deleting originals.
require('dotenv').config();
const mongoose = require('mongoose');
const Verification = require('../src/models/IdentityVerification');
const { persistVerificationDocument, linkVerificationDocument } = require('../src/services/verificationStorage');
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    let copied = 0, linked = 0, missing = 0;
    for await (const row of Verification.find().select('document userId').lean().cursor()) {
        const references = { verificationId: row._id, userId: row.userId };
        if (await linkVerificationDocument(row.document, references)) linked++;
        else if (await persistVerificationDocument(row.document, references)) copied++;
        else missing++;
    }
    console.log(JSON.stringify({ copied, linked, missingLocalOriginals: missing }));
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
