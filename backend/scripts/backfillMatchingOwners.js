// Restore ownership metadata on legacy results using their account-scoped IDs.
// Existing scores, fingerprints and computation timestamps are preserved.
const { hash } = require('../src/services/matchingCache');

async function backfillMatchingOwners({ users, analyses, collection }) {
    let repaired = 0;
    for (const user of users) {
        const contractorId = String(user._id);
        const ids = analyses.map(analysis => hash({ contractorId, source: analysis.torSource, torId: String(analysis.torId) }));
        if (!ids.length) continue;
        const result = await collection.updateMany({ _id: { $in: ids }, contractorId: { $exists: false } }, {
            $set: { contractorId },
        });
        repaired += result.modifiedCount;
    }
    return repaired;
}

if (require.main === module) {
    require('dotenv').config();
    const mongoose = require('mongoose');
    (async () => {
        await mongoose.connect(process.env.MONGODB_URI);
        const [users, analyses] = await Promise.all([
            require('../src/models/User').find(require('../src/services/matchingAccess').matchingAccountFilter(), '_id').lean(),
            require('../src/models/TorAnalysis').find({}, 'torId torSource').lean(),
        ]);
        const repaired = await backfillMatchingOwners({ users, analyses, collection: mongoose.connection.db.collection('precomputed_matching') });
        console.log(JSON.stringify({ repaired }));
    })().catch(() => {
        console.error('Matching ownership repair failed');
        process.exitCode = 1;
    }).finally(() => mongoose.disconnect());
}

module.exports = { backfillMatchingOwners };
