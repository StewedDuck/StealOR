// Place at backend/test/semanticBatchMatching.test.js to run this test.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    evaluateProjectRelevanceBatch,
} = require('../src/services/torMatchingService');

test('batch evaluator makes one AI call, preserves exact and missing groups', async () => {
    let calls = 0;
    const data = await evaluateProjectRelevanceBatch([
        { skillGroups: [['react']], profileFields: ['skills'] },
        { skillGroups: [['relational database']], profileFields: ['skills'] },
        { skillGroups: [['kubernetes']], profileFields: ['skills'] },
    ], { skills: ['React', 'PostgreSQL'] }, {
        semanticMatcher: async jobs => {
            calls++;
            assert.equal(jobs.length, 2);
            return [{
                jobIndex: 0,
                groupIndex: 0,
                evidence: 'postgresql',
                reason: 'PostgreSQL เป็นระบบฐานข้อมูลเชิงสัมพันธ์',
            }];
        },
    });
    assert.equal(calls, 1);
    assert.deepEqual(data.map(v => v.status), ['pass', 'pass', 'unknown']);
    assert.equal(data[0].matchDetails[0].matchType, 'exact');
    assert.equal(data[1].matchDetails[0].matchType, 'semantic');
    assert.equal(data[2].missingGroups.length, 1);
});

test('the matcher sees only fields selected for each criterion', async () => {
    const result = await evaluateProjectRelevanceBatch([
        { skillGroups: [['react']], profileFields: ['projectTypes'] },
        { skillGroups: [['react']], profileFields: ['skills'] },
    ], { skills: ['React'], projectTypes: ['ERP'] }, {
        semanticMatcher: async jobs => {
            assert.equal(jobs.length, 1);
            assert.deepEqual(jobs[0].profileValues, ['erp']);
            return [];
        },
    });
    assert.deepEqual(result.map(r => r.status), ['unknown', 'pass']);
});

test('Gemini errors never turn missing evidence into a pass', async () => {
    const result = await evaluateProjectRelevanceBatch([
        { skillGroups: [['kubernetes']], profileFields: ['skills'] },
    ], { skills: ['React'] }, {
        semanticMatcher: async () => { throw Error('vertex down'); },
    });
    assert.equal(result[0].status, 'unknown');
    assert.equal(result[0].semanticMatchingStatus, 'unavailable');
});
const { calculateMatching, calculateRelevanceScore } = require('../src/services/torMatchingService');
const { findSemanticMatchesBatch } = require('../src/services/semanticBatchMatcher');
const { descriptor } = require('../src/services/precomputedMatchingService');
const { selectMatchingPage } = require('../src/controllers/matchingController');

const criterion = (skillGroups, profileFields = ['skills']) => ({ skillGroups, profileFields });
const config = { model: 'test-model' };
function fakeCache() {
    const docs = new Map();
    return {
        docs,
        async findOne({ _id, expiresAt }) {
            const doc = docs.get(_id);
            return doc && (!expiresAt || doc.expiresAt > expiresAt.$gt) ? { ...doc } : null;
        },
        async updateOne(query, update) {
            const existing = docs.get(query._id);
            if (query.$or && existing?.leaseUntil > new Date()) {
                const error = new Error('Duplicate key');
                error.code = 11000;
                throw error;
            }
            if (query.token && existing?.token !== query.token) return { modifiedCount: 0 };
            const doc = docs.get(query._id) || { _id: query._id, ...update.$setOnInsert };
            Object.assign(doc, update.$set);
            for (const key of Object.keys(update.$unset || {})) delete doc[key];
            docs.set(query._id, doc);
            return { modifiedCount: 1 };
        },
    };
}
function fakeAI(matches = []) {
    const state = { calls: 0 };
    state.client = { models: { generateContent: async request => {
        state.calls++;
        await new Promise(resolve => setTimeout(resolve, 5));
        const input = JSON.parse(request.contents);
        const evaluations = input.jobs.flatMap(job => job.skillGroups.map(group => {
            const match = matches.find(item => item.jobIndex === job.jobIndex && item.groupIndex === group.groupIndex);
            return match ? { ...match, matched: true } : {
                jobIndex: job.jobIndex, groupIndex: group.groupIndex, evidenceIndex: -1, matched: false, reason: 'ยังไม่พบหลักฐานยืนยัน',
            };
        }));
        return { text: JSON.stringify({ matches: evaluations }) };
    } } };
    return state;
}

test('all exact OR groups resolve without AI and AND groups remain independent', async () => {
    const results = await evaluateProjectRelevanceBatch([
        criterion([['react', 'vue'], ['postgresql']]),
        criterion([['react'], ['docker']]),
    ], { skills: ['React', 'PostgreSQL'] }, { semanticMatcher: async () => [] });
    assert.deepEqual(results.map(r => r.status), ['pass', 'unknown']);
    await evaluateProjectRelevanceBatch([criterion([['react', 'vue']])], { skills: ['Vue'] }, {
        semanticMatcher: () => assert.fail('Exact matching must not call AI'),
    });
});

test('calculateMatching batches every unresolved criterion once and preserves all details', async () => {
    let calls = 0;
    const result = await calculateMatching({ skills: ['React'] }, {
        status: 'completed', requirements: [],
        projectRelevance: [criterion([['javascript library']]), criterion([['web framework']]), criterion([['react']])],
    }, { semanticMatcher: async jobs => {
        calls++;
        assert.equal(jobs.length, 2);
        return [{ jobIndex: 0, groupIndex: 0, evidence: 'react', reason: 'React เป็น JavaScript Library' }];
    } });
    assert.equal(calls, 1);
    assert.deepEqual(result.relevanceResults.map(r => r.status), ['pass', 'unknown', 'pass']);
    assert.equal(result.relevanceResults[0].matchDetails[0].matchType, 'semantic');
    assert.match(result.relevanceResults[0].reason, /[ก-๙]/);
    assert.equal(result.matchingPercentage, 66.67);
    assert.equal(result.matchingPercentageUpperBound, 100);
    assert.equal(result.meetsDisplayThreshold, true);
});

test('mandatory failure does not change relevance percentages or 45 percent threshold', async () => {
    const base = { status: 'completed', projectRelevance: [criterion([['react']])] };
    const profile = { skills: ['React'], teamSize: 2 };
    const result = await calculateMatching(profile, { ...base, requirements: [
        { category: 'mandatory', profileField: 'teamSize', text: 'at least 10 people' },
    ] });
    assert.equal(result.eligibility, 'ineligible');
    assert.equal(result.matchingPercentage, 100);
    assert.equal(calculateRelevanceScore(Array.from({ length: 20 }, (_, i) => ({ status: i < 9 ? 'pass' : 'unknown' }))).meetsDisplayThreshold, true);
    assert.equal(calculateRelevanceScore(Array.from({ length: 20 }, (_, i) => ({ status: i < 8 ? 'pass' : 'unknown' }))).meetsDisplayThreshold, false);
});

test('Mongo MISS calls AI, HIT reuses it, permitted input and model changes invalidate it', async () => {
    const cache = fakeCache();
    const ai = fakeAI([{ jobIndex: 0, groupIndex: 0, evidenceIndex: 0, reason: 'PostgreSQL เป็นฐานข้อมูลเชิงสัมพันธ์' }]);
    const options = { config, client: ai.client, collection: cache };
    const jobs = [{ skillGroups: [['relational database']], profileValues: ['postgresql'] }];
    const first = await findSemanticMatchesBatch(jobs, options);
    const second = await findSemanticMatchesBatch(jobs, options);
    assert.deepEqual(second, first);
    assert.match(second[0].reason, /[ก-๙]/);
    assert.equal(ai.calls, 1);
    await findSemanticMatchesBatch([{ ...jobs[0], profileValues: ['mysql'] }], options);
    await findSemanticMatchesBatch([{ ...jobs[0], skillGroups: [['database']] }], options);
    await findSemanticMatchesBatch(jobs, { ...options, model: 'other-model' });
    assert.equal(ai.calls, 4);
    for (const doc of cache.docs.values()) assert.ok(doc.expiresAt.getTime() > Date.now() + 6 * 86400000);
});

test('concurrent identical requests share one AI computation', async () => {
    const ai = fakeAI();
    const jobs = [{ skillGroups: [['unique concurrency']], profileValues: ['react'] }];
    const options = { config, client: ai.client, disableCache: true };
    await Promise.all(Array.from({ length: 10 }, () => findSemanticMatchesBatch(jobs, options)));
    assert.equal(ai.calls, 1);
});

test('AI failure and malformed responses are never stored as successful matches', async () => {
    const cache = fakeCache();
    let calls = 0;
    const options = { config, collection: cache, client: { models: { generateContent: async () => {
        calls++;
        if (calls === 1) throw Error('AI unavailable');
        return { text: JSON.stringify({ matches: [{ jobIndex: 99 }] }) };
    } } } };
    const jobs = [{ skillGroups: [['failure']], profileValues: ['react'] }];
    await assert.rejects(findSemanticMatchesBatch(jobs, options));
    await assert.rejects(findSemanticMatchesBatch(jobs, options));
    assert.equal(calls, 2);
    for (const doc of cache.docs.values()) assert.equal(doc.matches, undefined);
});

test('English AI explanations receive a Thai explanation without a second AI request', async () => {
    const ai = fakeAI([{ jobIndex: 0, groupIndex: 0, evidenceIndex: 0, reason: 'React is a library' }]);
    const result = await findSemanticMatchesBatch([{ skillGroups: [['library']], profileValues: ['react'] }], { config, client: ai.client, disableCache: true });
    assert.match(result[0].reason, /[ก-๙]/);
    assert.equal(ai.calls, 1);
});

test('precomputed fingerprints ignore unrelated account fields and change with profile or TOR inputs', () => {
    const profile = { _id: 'user', skills: ['React'], email: 'private@example.com' };
    const analysis = { torId: 'tor', torSource: 'internal', status: 'completed', projectRelevance: [criterion([['react']])] };
    const original = descriptor(profile, analysis);
    assert.equal(descriptor({ ...profile, email: 'different@example.com' }, analysis).fingerprint, original.fingerprint);
    assert.notEqual(descriptor({ ...profile, skills: ['Vue'] }, analysis).fingerprint, original.fingerprint);
    assert.notEqual(descriptor(profile, { ...analysis, projectRelevance: [criterion([['vue']])] }).fingerprint, original.fingerprint);
});

test('pagination filters and sorts the complete dataset before slicing, with nulls last', () => {
    const rows = [20, 90, null, 45, 80].map((score, i) => ({ torId: String(i), torSource: 'internal', projectName: i === 1 ? 'Other' : 'Software', eligibility: 'eligible', matchingPercentage: score }));
    const page = selectMatchingPage(rows, { search: 'Software', source: 'internal', eligibility: 'eligible', limit: '2', page: '1' });
    assert.equal(page.total, 4);
    assert.deepEqual(page.data.map(r => r.matchingPercentage), [80, 45]);
    assert.deepEqual(selectMatchingPage(rows, { search: 'Software', limit: '2', page: '2' }).data.map(r => r.matchingPercentage), [20, null]);
    assert.deepEqual(selectMatchingPage(rows, { sort: 'asc' }).data.map(r => r.matchingPercentage), [20, 45, 80, 90, null]);
});


test('expired semantic entries are recomputed even before Mongo TTL deletes them', async () => {
    const cache = fakeCache();
    const ai = fakeAI();
    const jobs = [{ skillGroups: [['expired entry']], profileValues: ['react'] }];
    const options = { config, client: ai.client, collection: cache };
    await findSemanticMatchesBatch(jobs, options);
    for (const doc of cache.docs.values()) doc.expiresAt = new Date(0);
    await findSemanticMatchesBatch(jobs, options);
    assert.equal(ai.calls, 2);
});

test('Mongo cache outage gracefully falls back to AI', async () => {
    const ai = fakeAI();
    const result = await findSemanticMatchesBatch([{ skillGroups: [['cache outage']], profileValues: ['react'] }], {
        config, client: ai.client,
        collection: { async findOne() { throw Error('offline'); }, async updateOne() { throw Error('offline'); } },
    });
    assert.deepEqual(result, []);
    assert.equal(ai.calls, 1);
});

test('separate matcher instances share Mongo ownership and avoid duplicate AI calls', async () => {
    const modulePath = require.resolve('../src/services/semanticBatchMatcher');
    const existingModule = require.cache[modulePath];
    delete require.cache[modulePath];
    const other = require(modulePath).findSemanticMatchesBatch;
    require.cache[modulePath] = existingModule;
    const cache = fakeCache();
    const ai = fakeAI();
    const options = { config, client: ai.client, collection: cache };
    const jobs = [{ skillGroups: [['shared lease']], profileValues: ['react'] }];
    await Promise.all([findSemanticMatchesBatch(jobs, options), other(jobs, options)]);
    assert.equal(ai.calls, 1);
});

test('matching AI concurrency remains bounded and releases slots after failures', async () => {
    const { withAIConcurrency } = require('../src/services/matchingCache');
    let active = 0;
    let peak = 0;
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => withAIConcurrency(async () => {
        active++;
        peak = Math.max(peak, active);
        try {
            await new Promise(resolve => setTimeout(resolve, 3));
            if (index === 0) throw Error('expected test failure');
        } finally {
            active--;
        }
    })));
    assert.equal(peak, 2);
    assert.equal(active, 0);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
});

test('an AI call that never settles hits its overall deadline and is not cached', async () => {
    const cache = fakeCache();
    await assert.rejects(findSemanticMatchesBatch([{ skillGroups: [['deadline']], profileValues: ['react'] }], {
        config, collection: cache, timeoutMs: 20,
        client: { models: { generateContent: () => new Promise(() => {}) } },
    }), error => error.code === 'AI_TIMEOUT');
    for (const doc of cache.docs.values()) assert.equal(doc.matches, undefined);
});

test('large batches reserve output for Thai reasons, disable SDK retries, and reject incomplete output', async () => {
    const client = { models: { generateContent: async request => {
        assert.equal(request.config.thinkingConfig.thinkingBudget, 0);
        assert.equal(request.config.maxOutputTokens, 16384);
        assert.equal(request.config.httpOptions.retryOptions.attempts, 1);
        assert.ok(request.config.abortSignal);
        const input = JSON.parse(request.contents);
        assert.equal(input.jobs[0].jobIndex, 0);
        assert.deepEqual(input.jobs[0].skillGroups[0], { groupIndex: 0, alternatives: ['large batch'] });
        assert.deepEqual(input.jobs[0].profileValues[0], { evidenceIndex: 0, value: 'react', profileField: 'unspecified' });
        assert.equal(input.jobs[0].criterionIndex, undefined);
        return { candidates: [{ finishReason: 'MAX_TOKENS' }], text: '{"matches":[]}' };
    } } };
    await assert.rejects(findSemanticMatchesBatch([{ skillGroups: [['large batch']], profileValues: ['react'] }], {
        config: { model: 'gemini-2.5-flash' }, client, disableCache: true,
    }), /Incomplete/);
});

test('React can resolve the library group while missing Laravel and CSS evidence keeps the whole criterion UNKNOWN', async () => {
    const [result] = await evaluateProjectRelevanceBatch([criterion([
        ['php'], ['laravel framework', 'laravel'], ['bootstrap', 'tailwind css'], ['javascript framework', 'javascript library'],
    ])], { skills: ['PHP', 'JavaScript', 'React'] }, { semanticMatcher: async jobs => {
        assert.equal(jobs.length, 1);
        return [{ jobIndex: 0, groupIndex: 2, evidence: 'react', reason: 'React เป็น JavaScript Library จึงตรงกับข้อกำหนด' }];
    } });
    assert.equal(result.status, 'unknown');
    assert.deepEqual(result.matchedGroups, [['php'], ['javascript framework', 'javascript library']]);
    assert.deepEqual(result.missingGroups, [['laravel framework', 'laravel'], ['bootstrap', 'tailwind css']]);
});

test('omitted group evaluations never become a successful empty or partial cache entry', async () => {
    const cache = fakeCache();
    const jobs = [{ skillGroups: [['library'], ['css framework']], profileValues: ['react'] }];
    const options = { config, collection: cache, client: { models: { generateContent: async () => ({
        text: JSON.stringify({ matches: [{ jobIndex: 0, groupIndex: 0, evidenceIndex: 0, matched: true, reason: 'React เป็น JavaScript Library' }] }),
    }) } } };
    await assert.rejects(findSemanticMatchesBatch(jobs, options), /Incomplete/);
    for (const doc of cache.docs.values()) assert.equal(doc.matches, undefined);
});

test('partial relevance groups earn proportionate credit while OR alternatives remain one group', () => {
    const { rescoreMatchingResult } = require('../src/services/torMatchingService');
    const results = [
        { status: 'unknown', skillGroups: [['php'], ['laravel'], ['bootstrap', 'tailwind'], ['react', 'vue']], matchedGroups: [['php'], ['bootstrap', 'tailwind'], ['react', 'vue']], missingGroups: [['laravel']] },
        { status: 'unknown', skillGroups: [['git'], ['docker']], matchedGroups: [['docker']], missingGroups: [['git']] },
    ];
    const scored = rescoreMatchingResult({ eligibility: 'ineligible', relevanceResults: results });
    assert.equal(scored.matchingPercentage, 62.5); // (75% + 50%) / 2
    assert.equal(scored.matchingPercentageUpperBound, 100);
    assert.equal(scored.relevanceResults[0].earnedWeight, 37.5);
    assert.equal(scored.relevanceResults[1].earnedWeight, 25);
    assert.equal(scored.relevanceResults[0].coveragePercentage, 75);
    assert.equal(scored.relevanceResults[0].status, 'unknown');
    assert.equal(scored.eligibility, 'ineligible');
    assert.equal(scored.meetsDisplayThreshold, true);
});

test('equal criterion weights avoid weighting a long requirement more than a short requirement', () => {
    const result = calculateRelevanceScore([
        { status: 'unknown', skillGroups: [['a'], ['b'], ['c'], ['d']], matchedGroups: [['a'], ['b']], missingGroups: [['c'], ['d']] },
        { status: 'pass', skillGroups: [['e']], matchedGroups: [['e']], missingGroups: [] },
    ]);
    assert.equal(result.matchingPercentage, 75);
    assert.equal(calculateRelevanceScore([{ status: 'unknown', skillGroups: [['a']], matchedGroups: [], missingGroups: [['a']] }]).matchingPercentage, 0);
    assert.equal(calculateRelevanceScore([]).matchingPercentage, null);
});

test('18 equal criteria give a 75-percent-covered criterion 4.17 points without rounding the total early', () => {
    const { rescoreMatchingResult } = require('../src/services/torMatchingService');
    const relevanceResults = Array.from({ length: 18 }, (_, index) => ({
        status: 'unknown', skillGroups: [['a'], ['b'], ['c'], ['d']],
        matchedGroups: index === 0 ? [['a'], ['b'], ['c']] : [], missingGroups: index === 0 ? [['d']] : [['a'], ['b'], ['c'], ['d']],
    }));
    const result = rescoreMatchingResult({ relevanceResults });
    assert.equal(result.relevanceResults[0].earnedWeight, 4.17);
    assert.equal(result.matchingPercentage, 4.17);
    assert.equal(result.meetsDisplayThreshold, false);
});
