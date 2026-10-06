const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',

    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
    },
});

async function sendEmail({ to, subject, text, html }) {
    if (!to) {
        throw new Error("Email recipient is required");
    }

    const info = await transporter.sendMail({
        from: `"sTealORs" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        text,
        html,
    });

    console.log("Email sent: ", info.messageId);
    return info;
}

module.exports = { sendEmail };
