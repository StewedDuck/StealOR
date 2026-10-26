const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateRequirement, refreshMatchingExplanations } = require('../src/services/torMatchingService');
const source = 'ผู้ยื่นข้อเสนอต้องมีความสามารถตามกฎหมาย ไม่เป็นบุคคลล้มละลาย ไม่อยู่ระหว่างเลิกกิจการ และไม่เป็นบุคคลซึ่งอยู่ระหว่างถูกระงับการยื่นข้อเสนอหรือทำสัญญากับหน่วยงานของรัฐ';
const criterion = { text: source, sourceText: source, profileField: 'legalEligibility', category: 'mandatory', requirementType: 'legal' };
test('compound legal requirement explains known and missing fields independently', () => {
    const result = evaluateRequirement(criterion, { legalEligibility: { bankruptcyStatus: 'no', debarmentStatus: 'no' } });
    assert.equal(result.status, 'unknown');
    assert.equal(result.conditionDetails.find(row => row.field === 'legalEligibility.bankruptcyStatus').status, 'pass');
    assert.equal(result.conditionDetails.find(row => row.field === 'legalEligibility.legalCapacity').status, 'unknown');
    assert.equal(result.conditionDetails.find(row => row.field === 'legalEligibility.liquidationStatus').status, 'unknown');
    assert.equal(result.conditionDetails.find(row => row.field === 'legalEligibility.suspensionStatus').status, 'unknown');
    assert.ok(result.conditionDetails.every(row => /[ก-๙]/.test(row.reason)));
});
test('known contradiction fails even when another part lacks data; complete evidence passes', () => {
    assert.equal(evaluateRequirement(criterion, { legalEligibility: { bankruptcyStatus: 'yes' } }).status, 'fail');
    assert.equal(evaluateRequirement(criterion, { legalEligibility: { bankruptcyStatus: 'no', legalCapacity: true, liquidationStatus: 'no', suspensionStatus: 'no' } }).status, 'pass');
});
test('unsupported additional condition cannot pass merely from bankruptcy evidence', () => {
    const result = evaluateRequirement({ ...criterion, text: '', sourceText: 'ไม่เป็นบุคคลล้มละลาย และต้องมีหนังสือรับรองการแต่งตั้งเป็นตัวแทนจำหน่าย' }, { legalEligibility: { bankruptcyStatus: 'no' } });
    assert.equal(result.status, 'unknown');
    assert.ok(result.conditionDetails.some(row => row.field === null));
});
test('cached legal result gains current per-condition evidence without AI; old English fallback becomes Thai', () => {
    const result = refreshMatchingExplanations({ mandatoryResults: [{ text: source, status: 'unknown', reason: 'This requirement needs further verification.' }, { text: 'Certificate', status: 'unknown', reason: 'This requirement needs further verification.' }], relevanceResults: [] },
        { legalEligibility: { bankruptcyStatus: 'no' } }, { requirements: [criterion] });
    assert.ok(result.mandatoryResults[0].conditionDetails.length > 1);
    assert.ok(result.mandatoryResults.every(row => /[ก-๙]/.test(row.reason)));
});
