const Tor = require('../models/Tor');
const GovProject = require('../models/GovProject');
const { collection } = require('./matchingCache');
const { visibleFilter, marketTor } = require('./torMatchingCatalog');

// Small persisted card previews for cold starts. This path never evaluates
// freshness or enqueues AI work; the normal endpoint verifies inputs afterwards.
async function loadMatchingSnapshot(contractorId, { includeDetails = false } = {}) {
    const coll = collection('precomputed_matching');
    if (!coll) throw new Error('Matching database unavailable');
    const filter = { contractorId: String(contractorId), result: { $exists: true },
            $or: [{ failureCode: { $exists: false } }, { failureCode: null }] };
    const projection = {
            torId: 1, torSource: 1, computedAt: 1,
            ...(includeDetails ? {
                'result.relevanceResults.missingGroups': 1, 'result.relevanceResults.skillGroups': 1,
                'result.relevanceResults.semanticMatchingStatus': 1,
                'result.mandatoryResults.text': 1, 'result.mandatoryResults.status': 1,
                'result.mandatoryResults.reason': 1,
                'result.mandatoryResults.conditionDetails.field': 1,
                'result.mandatoryResults.conditionDetails.label': 1,
                'result.mandatoryResults.conditionDetails.status': 1,
            } : {}),
            'result.torId': 1, 'result.torSource': 1, 'result.eligibility': 1,
            'result.mandatorySummary': 1, 'result.matchingPercentage': 1,
            'result.matchingPercentageUpperBound': 1, 'result.scoringStatus': 1,
            'result.weightingMethod': 1, 'result.meetsDisplayThreshold': 1,
    };
    // Return only the latest successful version per TOR before transferring
    // dashboard evidence; historical profile versions are not needed here.
    const storedRead = includeDetails ? coll.aggregate([
        { $match: filter }, { $sort: { computedAt: -1, _id: -1 } },
        { $group: { _id: { torId: { $ifNull: ['$torId', '$result.torId'] },
            torSource: { $ifNull: ['$torSource', '$result.torSource'] } }, doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } }, { $project: projection },
    ]).toArray() : coll.find(filter, { projection }).toArray();
    const [government, internal, stored] = await Promise.all([
        GovProject.find(visibleFilter('government'), '_id project_id project_name dept_name budget_amount contract_status procurementAnalysis.allocatedBudget procurementAnalysis.referencePriceEstimate procurementAnalysis.biddingClosingDate raw_data.submission_deadline raw_data.deadline documents.invitation.status documents.draftEbidding.commentDeadlineAt').lean(),
        Tor.find(visibleFilter('internal'), '_id projectName agencyName budget referencePriceEstimate applicationDeadline status').lean(),
        storedRead,
    ]);
    const byTor = new Map();
    for (const row of stored) {
        const key = `${row.torSource || row.result.torSource}:${row.torId || row.result.torId}`;
        if (!byTor.has(key) || new Date(row.computedAt || 0) > new Date(byTor.get(key).computedAt || 0)) byTor.set(key, row);
    }
    const catalog = [...government.map(tor => ({ tor, source: 'government' })), ...internal.map(tor => ({ tor, source: 'internal' }))];
    const data = catalog.map(({ tor, source }) => {
        const torId = String(tor._id);
        const row = byTor.get(`${source}:${torId}`);
        const result = row?.result;
        const normalized = marketTor(tor, source);
        return {
            ...result, tor: normalized, torId, torSource: source, projectId: normalized.projectId,
            projectName: normalized.projectName, matchingPercentage: result?.matchingPercentage ?? null,
            mandatorySummary: result?.mandatorySummary || { total: 0, passed: 0, failed: 0, unknown: 0 },
            eligibility: result?.eligibility || 'unknown', mandatoryResults: result?.mandatoryResults || [], relevanceResults: result?.relevanceResults || [],
            scoringStatus: result?.scoringStatus || 'not_available', meetsDisplayThreshold: result?.meetsDisplayThreshold || false,
            matchingStatus: result ? 'stale' : 'pending', refreshState: 'idle',
            computedAt: row?.computedAt || null, isCachedSnapshot: true,
        };
    });
    return { success: true, isCachedSnapshot: true, total: data.length, data };
}

module.exports = { loadMatchingSnapshot };
