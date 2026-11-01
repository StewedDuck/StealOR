const test = require('node:test');
const assert = require('node:assert/strict');
const Tor = require('../src/models/Tor');
const { marketTor } = require('../src/services/torMatchingCatalog');
const { createTor } = require('../src/controllers/torController');
const base = { ownerId: 'owner', projectName: 'Project', agencyName: 'Agency', budget: 1000000 };

test('owner reference price is optional and independent from budget', () => {
    const omitted = new Tor(base);
    assert.equal(omitted.referencePriceEstimate, null);
    const priced = new Tor({ ...base, referencePriceEstimate: 850000.25 });
    assert.equal(priced.validateSync(), undefined);
    assert.equal(priced.toObject().referencePriceEstimate, 850000.25);
    for (const value of [-1, Infinity, NaN, 'invalid']) {
        assert.ok(new Tor({ ...base, referencePriceEstimate: value }).validateSync());
    }
});
test('matching catalog carries owner reference price without budget fallback', () => {
    assert.equal(marketTor({ ...base, _id: 'id', referencePriceEstimate: 850000.25 }, 'internal').referencePriceEstimate, 850000.25);
    assert.equal(marketTor({ ...base, _id: 'id' }, 'internal').referencePriceEstimate, null);
});
test('create API persists reference price and converts a cleared input to null', async () => {
    const original = Tor.create;
    const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    try {
        Tor.create = async data => new Tor(data).toObject();
        await createTor({ body: { ...base, referencePriceEstimate: 750000.5 }, ownerId: 'owner' }, response);
        assert.equal(response.code, 201);
        assert.equal(response.body.data.referencePriceEstimate, 750000.5);
        await createTor({ body: { ...base, referencePriceEstimate: '' }, ownerId: 'owner' }, response);
        assert.equal(response.body.data.referencePriceEstimate, null);
    } finally { Tor.create = original; }
});
