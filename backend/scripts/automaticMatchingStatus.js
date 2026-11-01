// Read-only pipeline status, without contractor data or AI requests.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { loadVisibleCatalog } = require('../src/services/torMatchingCatalog');
const { hasAnalysisData } = require('../src/services/automaticMatchingService');
const TorAnalysis = require('../src/models/TorAnalysis');
async function main() {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const catalog = await loadVisibleCatalog();
    const summaries = await TorAnalysis.aggregate([{ $group: { _id: '$pipelineState', count: { $sum: 1 } } }]);
    const coordinator = await mongoose.connection.db.collection('matching_pipeline_state').findOne({ _id: 'coordinator' });
    console.log(JSON.stringify({ visibleTors: catalog.length,
        withAnalysisData: catalog.filter(({ tor, source }) => hasAnalysisData(tor, source)).length,
        waitingForData: catalog.filter(({ tor, source }) => !hasAnalysisData(tor, source)).length,
        analysisStates: summaries.map(item => ({ state: item._id || 'legacy', count: item.count })),
        lastCompletedScan: coordinator?.lastScanAt || null,
        precomputedResults: await mongoose.connection.db.collection('precomputed_matching').countDocuments(),
    }, null, 2));
}
main().catch(() => { console.error('Automatic matching status unavailable'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
