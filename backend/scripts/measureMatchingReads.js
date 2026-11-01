// Read-only timings; never prints source documents or profile data.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
async function main() {
    await mongoose.connect(process.env.MONGODB_URI, process.argv.includes('--compressed') ? { compressors: ['zlib'] } : {});
    const { loadVisibleCatalog } = require('../src/services/torMatchingCatalog');
    const Analysis = require('../src/models/TorAnalysis');
    await Promise.all([
        ['catalog', loadVisibleCatalog],
        ['analyses', () => Analysis.find({}, 'torId torSource status relevanceStatus requirements projectRelevance pipelineState sourceFingerprint attemptedFingerprint error nextAttemptAt').lean()],
    ].map(async ([name, read]) => {
        const start = Date.now(); const rows = await read();
        console.log(JSON.stringify({ name, ms: Date.now() - start, rows: rows.length, bytes: Buffer.byteLength(JSON.stringify(rows)) }));
    }));
}
main().catch(() => { console.error('Read diagnostic failed'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
