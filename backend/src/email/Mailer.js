const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,

    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
    },
});

async function sendEmail({ to, subject, text, html }) {
    if (!to) {
        throw new Error("Email recipient is required");
    }

    // Recheck at send time so opting out also suppresses already queued mail.
    const user = await require('../models/User').findOne({ email: String(to).trim().toLowerCase() })
        .select('emailNotificationsEnabled').lean();
    if (user?.emailNotificationsEnabled === false) return { skipped: true };

    const info = await transporter.sendMail({
        from: `"sTealORs" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        text,
        html,
    });

    if (Array.isArray(info.accepted) && info.accepted.length === 0) throw new Error('Email recipient was not accepted');
    console.log('[NOTIFICATION] Email accepted by mail server');
    return info;
}

module.exports = { sendEmail };
