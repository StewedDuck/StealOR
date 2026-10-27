const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    _id: { type: String },
    userKey: { type: String, required: true, index: true },
    day: { type: String, required: true },
    rate: { type: Number, min: 0, max: 100, required: true },
    matchedCount: Number,
    assessedCount: Number,
}, { timestamps: true });
schema.index({ userKey: 1, day: 1 }, { unique: true });
module.exports = mongoose.models.DashboardSnapshot || mongoose.model('DashboardSnapshot', schema);
