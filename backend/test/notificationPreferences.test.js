const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/models/User');
const nodemailer = require('nodemailer');
const { getPreferences, updatePreferences } = require('../src/controllers/notificationController');
function response() { return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }

test('preferences default to enabled for existing accounts and are scoped to the authenticated email', async t => {
    t.mock.method(User, 'findOne', filter => {
        assert.deepEqual(filter, { email: 'me@example.com' });
        return { select: () => ({ lean: async () => ({}) }) };
    });
    const res = response();
    await getPreferences({ profileEmail: 'me@example.com' }, res);
    assert.equal(res.body.data.emailNotificationsEnabled, true);
});
test('opt out saves to the authenticated account, ignoring supplied identity', async t => {
    t.mock.method(User, 'findOneAndUpdate', async (filter, update) => {
        assert.deepEqual(filter, { email: 'me@example.com' });
        assert.equal(update.$set.emailNotificationsEnabled, false);
        return { emailNotificationsEnabled: false };
    });
    const res = response();
    await updatePreferences({ profileEmail: 'me@example.com', body: { email: 'other@example.com', emailNotificationsEnabled: false } }, res);
    assert.equal(res.body.data.emailNotificationsEnabled, false);
});
test('preferences reject string booleans without writing', async () => {
    const res = response();
    await updatePreferences({ body: { emailNotificationsEnabled: 'false' } }, res);
    assert.equal(res.code, 400);
});
test('mailer suppresses opted-out users and resumes after opting in', async t => {
    let enabled = false, sent = 0;
    t.mock.method(User, 'findOne', filter => {
        assert.equal(filter.email, 'me@example.com');
        return { select: () => ({ lean: async () => ({ emailNotificationsEnabled: enabled }) }) };
    });
    t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async () => { sent++; return { accepted: ['me@example.com'] }; } }));
    delete require.cache[require.resolve('../src/email/Mailer')];
    const { sendEmail } = require('../src/email/Mailer');
    const email = { to: ' ME@example.com ', subject: 'Notification', text: 'Test' };
    assert.equal((await sendEmail(email)).skipped, true);
    assert.equal(sent, 0);
    enabled = true;
    await sendEmail(email);
    assert.equal(sent, 1);
});
