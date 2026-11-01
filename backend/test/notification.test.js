const test = require('node:test');
const assert = require('node:assert/strict');
const { createReminderService, getDaysUntil } = require('../src/services/notifications/deadlineReminderService');
const { createDeliveryService, eventKey, messageEmail } = require('../src/services/notifications/deliveryService');
const now = new Date('2026-10-25T17:30:00Z'); // Oct 26 in Bangkok, Oct 25 in UTC.
const query = value => ({ lean: async () => value });
function fixture({ bookmarks = [], government, internal, owner, tors = [] } = {}) {
    const events = [];
    const service = createReminderService({
        Bookmark: { find: () => query(bookmarks) }, GovProject: { findOne: () => query(government) },
        Tor: { findById: () => query(internal), find: () => query(tors) },
        User: { findOne: filter => query(filter.verificationStatus ? owner : { email: 'contractor@test.com', accountRole: 'contractor' }) },
        notify: async value => events.push(value),
    });
    return { ...service, events };
}
test('deadline days follow Bangkok calendar independent of server timezone', () => {
    assert.equal(getDaysUntil('2026-10-31T12:00:00+07:00', now), 5);
    assert.equal(getDaysUntil('2026-10-27T12:00:00+07:00', now), 1);
    assert.ok(Number.isNaN(getDaysUntil('invalid', now)));
    assert.equal(getDaysUntil(null, now), null);
});
for (const days of [5, 1]) test(`saved internal TOR uses published application deadline at ${days} days`, async () => {
    const f = fixture({ bookmarks: [{ userId: ' CONTRACTOR@test.com ', source: 'internal', torId: 'tor' }],
        internal: { _id: 'tor', projectName: 'Project', status: 'published', applicationDeadline: `2026-10-${26 + days}T12:00:00+07:00`, submissionDeadline: '2020-01-01' } });
    await f.checkDeadlineReminders(now);
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].type, days === 5 ? 'deadline_5_days' : 'deadline_1_day');
});
test('government reminder prefers analyzed bidding closing date', async () => {
    const f = fixture({ bookmarks: [{ userId: 'a@test.com', source: 'government', projectId: '123' }], government: { _id: 'gov', project_name: 'Gov', procurementAnalysis: { biddingClosingDate: { dateTime: '2026-10-31T12:00:00+07:00' } }, raw_data: { deadline: '2020-01-01' } } });
    await f.checkDeadlineReminders(now); assert.equal(f.events.length, 1);
});
for (const status of ['draft', 'pending_verification']) test(`no deadline mail for unpublished ${status} TOR`, async () => {
    const f = fixture({ bookmarks: [{ userId: 'a@test.com', source: 'internal', torId: 'tor' }], internal: { status, applicationDeadline: '2026-10-31' } });
    await f.checkDeadlineReminders(now); assert.equal(f.events.length, 0);
});
test('cancelled government TOR does not send reminders', async () => {
    const f = fixture({ bookmarks: [{ userId: 'a@test.com', source: 'government', projectId: '123' }], government: { contract_status: 'ยกเลิก', raw_data: { deadline: '2026-10-31' } } });
    await f.checkDeadlineReminders(now); assert.equal(f.events.length, 0);
});
for (const [deadline, type] of [['2026-10-29T12:00:00+07:00', 'owner_deadline_3_days'], ['2026-10-26T00:00:00+07:00', 'owner_deadline_today']]) test(`owner published reminder ${type}`, async () => {
    const f = fixture({ owner: { email: 'owner@test.com' }, tors: [{ _id: 'tor', ownerId: 'owner@test.com', status: 'published', applicationDeadline: deadline, projectName: 'Project' }] });
    await f.checkOwnerReminders(now); assert.equal(f.events[0].type, type);
});
test('verified owner receives expired draft reminder; unverified owner does not', async () => {
    const tors = [{ _id: 'tor', ownerId: 'owner@test.com', status: 'draft', submissionDeadline: '2026-10-25', projectName: 'Draft' }];
    const approved = fixture({ owner: { email: 'owner@test.com' }, tors });
    await approved.checkOwnerReminders(now); assert.equal(approved.events[0].type, 'owner_draft_ready');
    const unverified = fixture({ tors }); await unverified.checkOwnerReminders(now); assert.equal(unverified.events.length, 0);
});
test('future draft does not send a publish-ready reminder', async () => {
    const f = fixture({ owner: { email: 'owner@test.com' }, tors: [{ status: 'draft', submissionDeadline: '2026-11-01' }] });
    await f.checkOwnerReminders(now); assert.equal(f.events.length, 0);
});
function memoryDelivery() {
    const rows = new Map();
    return { rows, async updateMany() {}, async updateOne(filter, update) {
        const key = filter.eventKey || [...rows.entries()].find(([, row]) => row._id === filter._id && row.token === filter.token)?.[0];
        if (!key) return;
        if (!rows.has(key)) rows.set(key, { _id: key, eventKey: key, ...update.$setOnInsert });
        Object.assign(rows.get(key), update.$set);
        for (const name of Object.keys(update.$unset || {})) delete rows.get(key)[name];
    }, async findOneAndUpdate(filter, update) {
        const row = [...rows.values()].find(item => item.attempts < 5 && ((item.state === 'pending' && item.nextAttemptAt <= filter.$or[0].nextAttemptAt.$lte) || (item.state === 'sending' && item.leaseUntil <= filter.$or[1].leaseUntil.$lte)));
        if (!row) return null;
        Object.assign(row, update.$set); row.attempts++; return { ...row };
    } };
}
test('email retry keeps web event, retries independently and deduplicates successful send', async () => {
    const delivery = memoryDelivery(); const logs = []; let sends = 0;
    const service = createDeliveryService({ delivery, logs: { findOneAndUpdate: async (...args) => logs.push(args), updateOne: async () => {} }, send: async () => { if (++sends === 1) throw Error('SMTP down'); } });
    const event = { key: 'one', user: { email: 'A@test.com' }, source: 'internal', torId: 'tor', type: 'deadline_1_day', title: 'Title', message: 'Message', url: 'http://localhost' };
    await service.notify(event); await service.notify(event);
    assert.equal(delivery.rows.size, 1);
    assert.ok(logs.every(([, update]) => update.$setOnInsert.read === false));
    await service.flush(new Date(Date.now() + 1000));
    assert.equal(delivery.rows.get('one').state, 'pending');
    await service.flush(new Date(Date.now() + 10 * 60000));
    assert.equal(delivery.rows.get('one').state, 'sent');
    await service.flush(new Date(Date.now() + 20 * 60000)); assert.equal(sends, 2);
});
test('changed deadline has a distinct delivery key and email escapes untrusted TOR text', () => {
    assert.notEqual(eventKey(['tor', '2026-10-26']), eventKey(['tor', '2026-10-27']));
    assert.doesNotMatch(messageEmail('<script>alert(1)</script>', '<img>', 'https://example.com').html, /<script>|<img>/);
});

test('new matching creates web and email event only above 39, and skips unpublished TORs', async () => {
    const { createMatchingNotificationService } = require('../src/services/notifications/matchingNotificationService');
    const events = [];
    let tor = { _id: 'tor', status: 'published', applicationDeadline: new Date('2099-01-01'), projectName: 'Test TOR' };
    const run = createMatchingNotificationService({ Tor: { findById: () => query(tor) }, notify: async event => events.push(event) });
    const user = { email: 'contractor@test.com' }, analysis = { torSource: 'internal', torId: 'tor' };
    await run(user, analysis, { matchingPercentage: 39 }); assert.equal(events.length, 0);
    await run(user, analysis, { matchingPercentage: 39.01 }); assert.equal(events.length, 1);
    assert.equal(events[0].type, 'new_matching');
    assert.match(events[0].url, /contractor\/matching$/);
    tor = { ...tor, status: 'draft' };
    await run(user, analysis, { matchingPercentage: 100 }); assert.equal(events.length, 1);
});

test('read notification updates are scoped to the authenticated recipient', async t => {
    const NotificationLog = require('../src/models/NotificationLog');
    const { markNotificationAsRead } = require('../src/controllers/notificationController');
    let captured;
    t.mock.method(NotificationLog, 'findOneAndUpdate', async filter => { captured = filter; return null; });
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await markNotificationAsRead({ params: { id: '507f1f77bcf86cd799439011' }, profileEmail: 'mine@test.com' }, res);
    assert.deepEqual(captured, { _id: '507f1f77bcf86cd799439011', userId: 'mine@test.com' });
    assert.equal(res.code, 404);
});

test('failed email stops after five attempts and preserves terminal state', async () => {
    const delivery = memoryDelivery(); let sends = 0;
    const service = createDeliveryService({ delivery, send: async () => { sends++; throw Error('SMTP failure'); } });
    await service.enqueueEmail('failure', 'test@example.com', { subject: 'Test', text: 'Test' });
    for (let i = 1; i <= 6; i++) await service.flush(new Date(Date.now() + i * 3600000));
    assert.equal(sends, 5);
    assert.equal(delivery.rows.get('failure').state, 'failed');
});

test('expired worker leases are eligible for recovery by another delivery worker', async () => {
    const delivery = memoryDelivery(); let sends = 0;
    const service = createDeliveryService({ delivery, send: async () => { sends++; } });
    await service.enqueueEmail('crash', 'test@example.com', { subject: 'Test', text: 'Test' });
    Object.assign(delivery.rows.get('crash'), { state: 'sending', attempts: 1, token: 'old', leaseUntil: new Date(Date.now() - 1000) });
    await service.flush(new Date());
    assert.equal(sends, 1); assert.equal(delivery.rows.get('crash').state, 'sent');
});

test('notification list batches TOR lookups and excludes bulky raw imported data', async t => {
    const NotificationLog = require('../src/models/NotificationLog');
    const GovProject = require('../src/models/GovProject');
    const Tor = require('../src/models/Tor');
    const { getNotifications } = require('../src/controllers/notificationController');
    t.mock.method(NotificationLog, 'find', () => ({ sort: () => query([
        { source: 'government', projectId: '123', read: false },
        { source: 'government', projectId: '123', read: true },
        { source: 'internal', torId: 'tor', read: false },
    ]) }));
    let govCalls = 0, internalCalls = 0;
    t.mock.method(GovProject, 'find', filter => {
        govCalls++; assert.deepEqual(filter.project_id.$in, ['123']);
        return { select: projection => { assert.equal(projection, 'project_name project_id raw_data.project_name'); return query([{ project_id: '123', project_name: 'Gov project' }]); } };
    });
    t.mock.method(Tor, 'find', () => { internalCalls++; return { select: () => query([{ _id: 'tor', projectName: 'Internal project' }]) }; });
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await getNotifications({ profileEmail: 'mine@test.com' }, res);
    assert.equal(res.code, 200); assert.equal(res.body.unread, 2);
    assert.equal(govCalls, 1); assert.equal(internalCalls, 1);
    assert.equal(res.body.data[0].torName, 'Gov project');
    assert.equal(res.body.data[2].torName, 'Internal project');
});
