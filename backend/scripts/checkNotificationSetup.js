// Read-only readiness check. SMTP verify authenticates but does not send mail.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const { createReminderService } = require('../src/services/notifications/deadlineReminderService');
async function main() {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const events = [];
    const scan = createReminderService({ notify: async event => events.push({ type: event.type }) });
    await scan.checkDeadlineReminders(); await scan.checkOwnerReminders();
    const Delivery = require('../src/models/NotificationDelivery');
    const deliveries = await Delivery.aggregate([{ $group: { _id: '$state', count: { $sum: 1 } } }]);
    let smtp = 'not_checked';
    const configured = !!process.env.EMAIL_USER && !!process.env.EMAIL_APP_PASSWORD;
    if (process.argv.includes('--smtp')) {
        if (!configured) smtp = 'missing_credentials';
        else {
            const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASSWORD }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
            try { await transport.verify(); smtp = 'authenticated'; } catch { smtp = 'connection_or_authentication_failed'; }
            finally { transport.close(); }
        }
    }
    console.log(JSON.stringify({ dryRun: true, emailsSent: 0, configured, smtp,
        currentlyDue: events.reduce((counts, row) => ({ ...counts, [row.type]: (counts[row.type] || 0) + 1 }), {}),
        deliveryStates: deliveries,
    }));
}
main().catch(() => { console.error('Notification readiness check unavailable'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
