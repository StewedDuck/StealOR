// Preview all visible in-system TORs; RUN_ANALYSIS=true runs one bounded pipeline tick.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { loadVisibleCatalog } = require('../src/services/torMatchingCatalog');
const { hasAnalysisData, runAutomaticMatching } = require('../src/services/automaticMatchingService');
async function main() {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const catalog = await loadVisibleCatalog();
    console.log(JSON.stringify({ visibleTors: catalog.length,
        withAnalysisData: catalog.filter(({ tor, source }) => hasAnalysisData(tor, source)).length,
        waitingForData: catalog.filter(({ tor, source }) => !hasAnalysisData(tor, source)).length,
        analysisBatchLimit: 2, previewOnly: process.env.RUN_ANALYSIS !== 'true',
    }));
    if (process.env.RUN_ANALYSIS === 'true') await runAutomaticMatching({ scheduleMatching: false });
}
main().catch(() => { console.error('[MATCHING PIPELINE] Manual scan unavailable'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
