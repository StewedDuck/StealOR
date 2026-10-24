const test = require('node:test');
const assert = require('node:assert/strict');
const { applyOwnerCriteria } = require('../src/services/ownerTorCriteria');
const { calculateMatching, calculateRelevanceScore } = require('../src/services/torMatchingService');

function analysis() {
    return { torSource: 'internal', ...applyOwnerCriteria({ requirements: [
        { description: 'React', weight: 80, mandatory: true },
        { description: 'Docker', weight: 20, mandatory: false },
    ] }, [], [
        { text: 'React', sourceText: 'React', skillGroups: [['react']], profileFields: ['skills'] },
        { text: 'Docker', sourceText: 'Docker', skillGroups: [['docker']], profileFields: ['skills'] },
    ], 'fixture') };
}
test('owner mandatory flags and weights are authoritative', () => {
    const row = analysis();
    assert.equal(row.requirements.length, 1);
    assert.equal(row.requirements[0].category, 'mandatory');
    assert.deepEqual(row.projectRelevance.map(item => item.weight), [80, 20]);
});
test('matching internal TOR evaluates mandatory technical evidence and preserves weights', async () => {
    const result = await calculateMatching({ skills: ['React', 'Docker'] }, analysis());
    assert.equal(result.eligibility, 'eligible');
    assert.equal(result.mandatorySummary.passed, 1);
    assert.equal(result.matchingPercentage, 100);
    assert.equal(result.weightingMethod, 'documented');
    assert.deepEqual(result.relevanceResults.map(item => item.appliedWeight), [80, 20]);
});
test('missing mandatory evidence stays unknown instead of passing from other criteria', async () => {
    const result = await calculateMatching({ skills: [] }, analysis());
    assert.equal(result.eligibility, 'unknown');
    assert.equal(result.mandatorySummary.unknown, 1);
});
test('partial coverage earns the owner weighted proportion; zero weights fall back to equal', () => {
    const rows = [
        { ownerRequirementIndex: 0, documentedWeight: 80, skillGroups: [['react'], ['typescript']], matchedGroups: [['react']], missingGroups: [['typescript']], status: 'unknown' },
        { ownerRequirementIndex: 1, documentedWeight: 20, skillGroups: [['docker']], matchedGroups: [['docker']], status: 'pass' },
    ];
    assert.equal(calculateRelevanceScore(rows).matchingPercentage, 60);
    assert.equal(calculateRelevanceScore(rows.map(row => ({ ...row, documentedWeight: 0 }))).matchingPercentage, 75);
});
test('uninterpretable owner mandatory condition is retained for review', () => {
    const row = applyOwnerCriteria({ requirements: [{ description: 'เงื่อนไขพิเศษ', mandatory: true, weight: 10 }] }, [], [{ sourceText: 'เงื่อนไขพิเศษ', skillGroups: [], profileFields: [] }], 'fixture');
    assert.equal(row.requirements.length, 1);
    assert.equal(row.projectRelevance.length, 1);
    assert.equal(row.status, 'needs_review');
});

test('domain experience cannot pass using generic career years', async () => {
    const { evaluateRequirement } = require('../src/services/torMatchingService');
    assert.equal(evaluateRequirement({ ownerRequirementIndex: 0, profileField: 'experienceYears', text: 'มีประสบการณ์พัฒนา AI อย่างน้อย 2 ปี' }, { experienceYears: 5 }).status, 'unknown');
});
test('missing owner extraction cannot silently become zero score', () => {
    assert.throws(() => applyOwnerCriteria({ requirements: [{ description: 'Python', weight: 100 }] }, [], [], 'fixture'), /Incomplete/);
});
test('technical owner criteria retain authorized skills evidence when AI omits profileFields', () => {
    const row = applyOwnerCriteria({ requirements: [{ description: 'Python', weight: 100 }] }, [],
        [{ sourceText: 'Python', skillGroups: [['python']], profileFields: [] }], 'fixture');
    assert.ok(row.projectRelevance[0].profileFields.includes('skills'));
    assert.ok(row.projectRelevance[0].profileFields.includes('teamQualifications.skills'));
});
