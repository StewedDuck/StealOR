const test = require('node:test');
const assert = require('node:assert/strict');
const { createSavedTorUpdateService, savedTorFingerprint } = require('../src/services/notifications/savedTorUpdateService');
const query = value => ({ lean: async () => value });
function fixture(source = 'internal') {
    let tor = source === 'internal' ? { _id: 'tor', projectName: 'Project', budget: 100, status: 'draft' } : { _id: 'gov', project_name: 'Gov', budget_amount: 100, raw_data: {} };
    const bookmark = { _id: 'saved', source, userId: 'contractor@test.com', torId: 'tor', projectId: '123', observedTorFingerprint: null };
    const events = []; let fail = false;
    const service = createSavedTorUpdateService({ Bookmark: { find: () => query([bookmark]), updateOne: async (_, update) => Object.assign(bookmark, update.$set) },
        Tor: { findById: () => query(tor) }, GovProject: { findOne: () => query(tor) }, User: { findOne: () => query({ email: 'contractor@test.com' }) },
        notify: async event => { if (fail) throw Error('queue down'); events.push(event); },
    });
    return { ...service, bookmark, events, setTor: value => { tor = { ...tor, ...value }; }, fail: value => { fail = value; } };
}
for (const source of ['internal', 'government']) test(`${source}: initialize existing bookmark without historical alerts, detect changes once`, async () => {
    const f = fixture(source);
    await f.checkSavedTorUpdates(); assert.equal(f.events.length, 0);
    f.setTor(source === 'internal' ? { budget: 200 } : { budget_amount: 200 });
    await f.checkSavedTorUpdates(); assert.equal(f.events.length, 1);
    assert.equal(f.events[0].type, 'saved_tor_updated');
    assert.match(f.events[0].url, /contractor\/saved\?tor=/);
    await f.checkSavedTorUpdates(); assert.equal(f.events.length, 1);
});
test('failed queue retains previous fingerprint so next scan retries the same event', async () => {
    const f = fixture(); await f.checkSavedTorUpdates();
    const previous = f.bookmark.observedTorFingerprint;
    f.setTor({ description: 'Changed' }); f.fail(true);
    await f.checkSavedTorUpdates(); assert.equal(f.bookmark.observedTorFingerprint, previous);
    f.fail(false); await f.checkSavedTorUpdates(); assert.equal(f.events.length, 1);
});
test('published status, reference price and government document revisions count as changes', () => {
    const row = { status: 'draft', referencePriceEstimate: 100 };
    assert.notEqual(savedTorFingerprint(row, 'internal'), savedTorFingerprint({ ...row, status: 'published' }, 'internal'));
    assert.notEqual(savedTorFingerprint(row, 'internal'), savedTorFingerprint({ ...row, referencePriceEstimate: 200 }, 'internal'));
    assert.notEqual(savedTorFingerprint({ documents: { invitation: { sha256: 'one' } } }, 'government'), savedTorFingerprint({ documents: { invitation: { sha256: 'two' } } }, 'government'));
});
test('routine crawl times and AI metadata do not produce update alerts', () => {
    const row = { project_name: 'Gov', documents: { invitation: { fileId: 'file', lastCheckedAt: 'yesterday' } } };
    assert.equal(savedTorFingerprint(row, 'government'), savedTorFingerprint({ ...row, updatedAt: new Date(), documents: { invitation: { fileId: 'file', lastCheckedAt: 'today' } }, procurementAnalysis: { analyzedAt: new Date() } }, 'government'));
});
test('second distinct edit creates another event instead of suppressing all future updates', async () => {
    const f = fixture(); await f.checkSavedTorUpdates();
    f.setTor({ budget: 200 }); await f.checkSavedTorUpdates();
    f.setTor({ budget: 300 }); await f.checkSavedTorUpdates();
    assert.equal(f.events.length, 2); assert.notEqual(f.events[0].key, f.events[1].key);
});
