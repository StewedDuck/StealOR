const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const User = require('../src/models/User');
const NotificationLog = require('../src/models/NotificationLog');
const { createDeliveryService } = require('../src/services/notifications/deliveryService');
const { getNotifications, markNotificationAsRead, getPreferences, updatePreferences } = require('../src/controllers/notificationController');

const USER_ID = '507f1f77bcf86cd799439011';
function response() {
    return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

// Keep database and SMTP boundaries in memory; execute the real preference
// controllers, delivery worker, mailer, notification list and read controller.
function fixture(t, { enabled = true, role = 'contractor' } = {}) {
    const user = { email: 'user@example.com', accountRole: role, emailNotificationsEnabled: enabled };
    const web = new Map(), deliveries = new Map(), sent = [];
    let smtpFailure = false, preferenceFailure = false;
    t.mock.method(User, 'findOne', filter => ({ select: () => ({ lean: async () => {
        if (preferenceFailure) throw Error('Database unavailable');
        return filter.email === user.email ? { ...user } : null;
    } }) }));
    t.mock.method(User, 'findOneAndUpdate', async (filter, update) => {
        if (filter.email !== user.email) return null;
        Object.assign(user, update.$set);
        return { ...user };
    });
    t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async message => {
        if (smtpFailure) throw Error('SMTP unavailable');
        sent.push(message);
        return { accepted: [message.to] };
    } }));
    const mailerPath = require.resolve('../src/email/Mailer');
    const original = require.cache[mailerPath];
    delete require.cache[mailerPath];
    const { sendEmail } = require(mailerPath);
    t.after(() => { if (original) require.cache[mailerPath] = original; else delete require.cache[mailerPath]; });
    const identityKey = value => JSON.stringify([value.userId, value.source, value.projectId, value.torId, value.type, value.verificationId]);
    const logs = {
        async findOneAndUpdate(filter, update) {
            const key = identityKey(filter);
            if (!web.has(key)) web.set(key, { ...filter, _id: USER_ID, ...update.$setOnInsert });
            return web.get(key);
        },
        async updateOne(filter, update) {
            const row = web.get(identityKey(filter));
            if (row && row.eventKey !== filter.eventKey.$ne) Object.assign(row, update.$set);
        },
    };
    const delivery = {
        async updateMany() {},
        async updateOne(filter, update) {
            if (filter.eventKey) {
                if (!deliveries.has(filter.eventKey)) deliveries.set(filter.eventKey, { _id: filter.eventKey, ...update.$setOnInsert });
                return;
            }
            const row = deliveries.get(filter._id);
            if (!row || row.token !== filter.token) return;
            Object.assign(row, update.$set);
            for (const field of Object.keys(update.$unset || {})) delete row[field];
        },
        async findOneAndUpdate(filter, update) {
            const now = filter.$or[0].nextAttemptAt.$lte;
            const row = [...deliveries.values()].find(row => row.attempts < filter.attempts.$lt &&
                ((row.state === 'pending' && row.nextAttemptAt <= now) || (row.state === 'sending' && row.leaseUntil <= now)));
            if (!row) return null;
            Object.assign(row, update.$set);
            row.attempts += update.$inc.attempts;
            return { ...row };
        },
    };
    t.mock.method(NotificationLog, 'find', filter => ({ sort: () => ({ lean: async () => [...web.values()].filter(row => row.userId === filter.userId).map(row => ({ ...row })) }) }));
    t.mock.method(NotificationLog, 'findOneAndUpdate', async (filter, update) => {
        const row = [...web.values()].find(row => row._id === filter._id && row.userId === filter.userId);
        if (!row) return null;
        Object.assign(row, update.$set);
        return { ...row };
    });
    const service = createDeliveryService({ delivery, logs, send: sendEmail });
    return {
        user, web, deliveries, sent,
        smtpFails(value) { smtpFailure = value; },
        preferenceLookupFails(value) { preferenceFailure = value; },
        async setEmail(value) {
            const res = response();
            await updatePreferences({ profileEmail: user.email, body: { emailNotificationsEnabled: value } }, res);
            assert.equal(res.code, 200);
            assert.equal(res.body.data.emailNotificationsEnabled, value);
        },
        async notify(key = 'event-1') {
            await service.notify({ key, user: { ...user }, source: 'verification', verificationId: 'verification-1',
                type: 'identity_verification_approved', title: 'Account approved', message: 'Your account is ready.', url: 'http://localhost:3000' });
        },
        async flush(minutes = 1) { await service.flush(new Date(Date.now() + minutes * 60000)); },
        async list(email = user.email) {
            const res = response();
            await getNotifications({ profileEmail: email }, res);
            assert.equal(res.code, 200);
            return res.body;
        },
        async read(email = user.email) {
            const res = response();
            await markNotificationAsRead({ profileEmail: email, params: { id: USER_ID } }, res);
            return res;
        },
    };
}

for (const role of ['contractor', 'project_owner', 'admin']) {
    for (const enabled of [true, false]) {
        test(`${role}: email ${enabled ? 'ON' : 'OFF'} preserves web notification and ${enabled ? 'sends' : 'suppresses'} email`, async t => {
            const f = fixture(t, { role, enabled });
            await f.notify();
            await f.flush();
            const inbox = await f.list();
            assert.equal(inbox.total, 1);
            assert.equal(inbox.unread, 1);
            assert.equal(inbox.data[0].title, 'Account approved');
            assert.equal(f.sent.length, enabled ? 1 : 0);
            assert.equal(f.deliveries.get('event-1').state, enabled ? 'sent' : 'skipped');
            assert.equal((await f.read()).code, 200);
            assert.equal((await f.list()).unread, 0);
        });
    }
}

test('legacy account without preference receives both channels by default', async t => {
    const f = fixture(t);
    delete f.user.emailNotificationsEnabled;
    const res = response();
    await getPreferences({ profileEmail: f.user.email }, res);
    assert.equal(res.body.data.emailNotificationsEnabled, true);
    await f.notify(); await f.flush();
    assert.equal(f.sent.length, 1);
    assert.equal((await f.list()).unread, 1);
});

test('turning OFF after enqueue suppresses pending email without removing the web event', async t => {
    const f = fixture(t);
    await f.notify();
    await f.setEmail(false);
    await f.flush();
    assert.equal(f.sent.length, 0);
    assert.equal(f.deliveries.get('event-1').state, 'skipped');
    assert.equal((await f.list()).total, 1);
});

test('turning ON again sends new events without replaying skipped mail or resetting a read web event', async t => {
    const f = fixture(t, { enabled: false });
    await f.notify(); await f.flush(); await f.read();
    await f.setEmail(true);
    await f.notify(); await f.flush();
    assert.equal(f.sent.length, 0);
    assert.equal((await f.list()).unread, 0);
    await f.notify('event-2'); await f.flush();
    assert.equal(f.sent.length, 1);
    assert.equal(f.deliveries.get('event-1').state, 'skipped');
    assert.equal(f.deliveries.get('event-2').state, 'sent');
    assert.equal((await f.list()).unread, 1);
});

test('turning OFF before an SMTP retry suppresses that retry; web remains readable', async t => {
    const f = fixture(t);
    f.smtpFails(true);
    await f.notify(); await f.flush();
    assert.equal(f.deliveries.get('event-1').state, 'pending');
    assert.equal((await f.list()).unread, 1);
    await f.setEmail(false);
    f.smtpFails(false);
    await f.flush(10);
    assert.equal(f.sent.length, 0);
    assert.equal(f.deliveries.get('event-1').state, 'skipped');
    assert.equal((await f.read()).code, 200);
});

test('SMTP recovery delivers once without duplicating or marking a read web event unread', async t => {
    const f = fixture(t);
    f.smtpFails(true);
    await f.notify(); await f.flush(); await f.read();
    f.smtpFails(false);
    await f.flush(10); await f.notify(); await f.flush(20);
    assert.equal(f.sent.length, 1);
    assert.equal((await f.list()).total, 1);
    assert.equal((await f.list()).unread, 0);
});

test('unavailable preference storage defers email instead of sending without checking opt-out', async t => {
    const f = fixture(t, { enabled: false });
    await f.notify();
    f.preferenceLookupFails(true);
    await f.flush();
    assert.equal(f.sent.length, 0);
    assert.equal(f.deliveries.get('event-1').state, 'pending');
    assert.equal((await f.list()).total, 1);
    f.preferenceLookupFails(false);
    await f.flush(10);
    assert.equal(f.deliveries.get('event-1').state, 'skipped');
});

test('web notifications cannot be listed or marked read by another account', async t => {
    const f = fixture(t, { enabled: false });
    await f.notify(); await f.flush();
    assert.equal((await f.list('other@example.com')).total, 0);
    assert.equal((await f.read('other@example.com')).code, 404);
    assert.equal((await f.list()).unread, 1);
});
