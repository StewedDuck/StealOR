const { randomUUID, createHash } = require('node:crypto');
const Delivery = require('../../models/NotificationDelivery');
const NotificationLog = require('../../models/NotificationLog');
const { sendEmail } = require('../../email/Mailer');
const eventKey = parts => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const { notificationEmail } = require('../../email/notificationEmail');
function messageEmail(title, message, url, details = {}) {
    return notificationEmail({ title, message, url, ...details });
}
function createDeliveryService({ delivery = Delivery, logs = NotificationLog, send = sendEmail } = {}) {
    async function enqueueEmail(key, to, email) {
        await delivery.updateOne({ eventKey: key }, { $setOnInsert: { to: to.trim().toLowerCase(), ...email, state: 'pending', attempts: 0, nextAttemptAt: new Date() } }, { upsert: true });
    }
    async function notify({ key, user, source, projectId = null, torId = null, type, title, message, url, email, verificationId = null, details = {} }) {
        const identity = { userId: user.email.trim().toLowerCase(), source, projectId, torId, type,
            ...(source === 'verification' ? { verificationId } : {}) };
        // Repeating the scan must not mark an already-read event unread again.
        await logs.findOneAndUpdate(identity, {
            $setOnInsert: { title, message, read: false, sentAt: new Date() },
        }, { upsert: true, new: true });
        await logs.updateOne({ ...identity, eventKey: { $ne: key } },
            { $set: { eventKey: key, title, message, read: false, sentAt: new Date() } });
        await enqueueEmail(key, user.email, email || messageEmail(title, message, url, { name: user.name, ...details }));
    }
    async function flush(now = new Date()) {
        // A worker crash on its final attempt must not leave a permanent sending state.
        await delivery.updateMany({ state: 'sending', leaseUntil: { $lte: now }, attempts: { $gte: 5 } },
            { $set: { state: 'failed' }, $unset: { token: '', leaseUntil: '' } });
        for (let i = 0; i < 50; i++) {
            const token = randomUUID();
            const row = await delivery.findOneAndUpdate({
                attempts: { $lt: 5 },
                $or: [ { state: 'pending', nextAttemptAt: { $lte: now } }, { state: 'sending', leaseUntil: { $lte: now } } ],
            }, { $set: { state: 'sending', token, leaseUntil: new Date(now.getTime() + 120000) }, $inc: { attempts: 1 } }, { new: true, sort: { nextAttemptAt: 1 } });
            if (!row) break;
            try {
                // Upgrade unsent legacy plain HTML too, without resending delivered emails.
                const html = row.html?.includes('sTealORs') ? row.html : messageEmail(row.subject, row.text || '', process.env.APP_URL || 'http://localhost:3000').html;
                await send({ to: row.to, subject: row.subject, text: row.text, html });
                await delivery.updateOne({ _id: row._id, token }, { $set: { state: 'sent', sentAt: new Date() }, $unset: { token: '', leaseUntil: '' } });
            } catch {
                await delivery.updateOne({ _id: row._id, token }, {
                    $set: { state: row.attempts >= 5 ? 'failed' : 'pending', nextAttemptAt: new Date(now.getTime() + Math.min(60, 2 ** row.attempts) * 60000) },
                    $unset: { token: '', leaseUntil: '' },
                });
                console.warn('[NOTIFICATION] Email delivery failed; retry state recorded');
            }
        }
    }
    return { enqueueEmail, notify, flush };
}
module.exports = { ...createDeliveryService(), createDeliveryService, eventKey, messageEmail };
