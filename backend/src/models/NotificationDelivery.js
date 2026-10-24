const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    eventKey: { type: String, required: true, unique: true },
    to: { type: String, required: true },
    subject: String, text: String, html: String,
    state: { type: String, enum: ['pending', 'sending', 'sent', 'failed'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    leaseUntil: Date, token: String, sentAt: Date,
}, { timestamps: true });
schema.index({ state: 1, nextAttemptAt: 1 });
module.exports = mongoose.models.NotificationDelivery || mongoose.model('NotificationDelivery', schema);
