const test = require('node:test');
const assert = require('node:assert/strict');
const { hash } = require('../src/services/matchingCache');
const { backfillMatchingOwners } = require('../scripts/backfillMatchingOwners');

test('legacy ownership repair is idempotent, account-scoped, and preserves evaluated results', async () => {
    const analyses = [{ torId: 'tor', torSource: 'government' }];
    const id = contractorId => hash({ contractorId, source: 'government', torId: 'tor' });
    const result = { matchingPercentage: 80 };
    const documents = [{ _id: id('a'), result }, { _id: id('b'), result }, { _id: 'unrelated', result }];
    const collection = { async updateMany(query, update) {
        let modifiedCount = 0;
        for (const row of documents) {
            if (query._id.$in.includes(row._id) && !Object.hasOwn(row, 'contractorId')) {
                Object.assign(row, update.$set); modifiedCount++;
            }
        }
        return { modifiedCount };
    } };
    const args = { users: [{ _id: 'a' }], analyses, collection };
    assert.equal(await backfillMatchingOwners(args), 1);
    assert.equal(documents[0].contractorId, 'a');
    assert.equal(documents[0].result, result);
    assert.equal(documents[1].contractorId, undefined);
    assert.equal(documents[2].contractorId, undefined);
    assert.equal(await backfillMatchingOwners(args), 0);
});
