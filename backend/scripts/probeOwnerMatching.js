// Inspect actual published owner TORs through the same API used by the UI.
// Never prints profile values or credentials; --analyze repairs missing/stale analyses.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const assert = require('node:assert/strict');
const Tor = require('../src/models/Tor');
const User = require('../src/models/User');
const TorAnalysis = require('../src/models/TorAnalysis');
const { visibleFilter } = require('../src/services/torMatchingCatalog');
const { ensureAnalysis, sourceFingerprint } = require('../src/services/automaticMatchingService');
async function main() {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const tors = await Tor.find(visibleFilter('internal')).sort({ createdAt: -1 }).lean();
    const profiles = await User.find({ accountRole: 'contractor', skills: 'React' }).select('email').lean();
    assert.equal(profiles.length, 1, 'Need one unambiguous contractor profile');
    if (process.argv.includes('--retry-analysis')) await TorAnalysis.updateMany({ torSource: 'internal', torId: { $in: tors.map(tor => tor._id) }, pipelineState: 'retry_wait' }, { $set: { nextAttemptAt: null } });
    if (process.argv.includes('--analyze')) {
        for (const tor of tors) console.log(JSON.stringify({ torId: String(tor._id), analysis: await ensureAnalysis(tor, 'internal') }));
    }
    if (process.argv.includes('--compute')) {
        const precomputed = require('../src/services/precomputedMatchingService');
        const contractor = await User.findOne({ email: profiles[0].email }).lean();
        const analyses = await TorAnalysis.find({ torSource: 'internal', torId: { $in: tors.map(tor => tor._id) } }).lean();
        await precomputed.getAvailableMatching(contractor, analyses);
        precomputed.startRefresh();
        const started = Date.now();
        while (Date.now() - started < 150000) {
            const available = await precomputed.getAvailableMatching(contractor, analyses, { refresh: false });
            if (available.every(row => ['ready', 'unavailable'].includes(row.matchingStatus))) break;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    const response = await fetch(`http://localhost:5000/api/matching?refresh=${process.argv.includes('--refresh') ? 'true' : 'false'}`, {
        headers: { 'x-profile-email': profiles[0].email, 'x-profile-proxy-secret': process.env.TOR_PROXY_SECRET }, signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    for (const tor of tors) {
        const row = payload.data.find(item => item.torSource === 'internal' && item.torId === String(tor._id));
        assert.ok(row, 'Published owner TOR must appear in matching API');
        const analysis = await TorAnalysis.findOne({ torSource: 'internal', torId: tor._id }).lean();
        const criteria = tor.requirements.filter(item => item.description.trim());
        const scoreSum = row.relevanceResults.reduce((sum, item) => sum + (item.earnedWeight || 0), 0);
        console.log(JSON.stringify({ torId: String(tor._id), projectName: tor.projectName,
            ownerCriteria: criteria.map(item => ({ description: item.description, weight: item.weight, mandatory: item.mandatory })),
            extractedGroups: analysis?.projectRelevance.map(item => ({ text: item.text, skillGroups: item.skillGroups, profileFields: item.profileFields })),
            currentAnalysis: analysis?.sourceFingerprint === sourceFingerprint(tor, 'internal'),
            analysisState: row.analysisPipelineStatus, matchingState: row.matchingStatus, refreshState: row.refreshState,
            score: row.matchingPercentage, eligibility: row.eligibility, mandatorySummary: row.mandatorySummary,
            weightingMethod: row.weightingMethod, inMatchingPage: typeof row.matchingPercentage === 'number' && row.matchingPercentage > 39 && row.analysisPipelineStatus !== 'waiting_data',
            criteria: row.relevanceResults.map(item => ({ text: item.text, weight: item.appliedWeight, earned: item.earnedWeight, coverage: item.coveragePercentage, semanticStatus: item.semanticMatchingStatus })),
            mandatoryResults: row.mandatoryResults.map(item => ({ text: item.text, status: item.status, reason: item.reason })),
            scoreSum: Math.round(scoreSum * 100) / 100,
        }));
        if (row.matchingStatus === 'ready' && criteria.length) {
            assert.equal(row.mandatorySummary.total, criteria.filter(item => item.mandatory).length);
            assert.equal(row.relevanceResults.length, criteria.length);
            assert.ok(Math.abs(scoreSum - row.matchingPercentage) < 0.1);
            const totalWeight = criteria.reduce((sum, item) => sum + item.weight, 0);
            row.relevanceResults.forEach((item, index) => {
                const expected = totalWeight ? criteria[index].weight / totalWeight * 100 : 100 / criteria.length;
                assert.ok(Math.abs(item.appliedWeight - expected) < 0.02, 'Owner weight must match normalized API weight');
            });
        }
    }
    const verified = payload.data.filter(row => row.torSource === 'internal' && row.matchingStatus === 'ready').length;
    console.log(JSON.stringify({ inspected: tors.length, apiVerified: true, matchingReady: verified }));
    if (process.argv.includes('--require-ready')) assert.equal(verified, tors.length, 'Some owner TORs are still being evaluated');
}
main().catch(error => { console.error(error.name === 'AssertionError' ? error.message : 'Owner matching probe unavailable'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
