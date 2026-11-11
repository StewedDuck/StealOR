const mongoose = require('mongoose');

// Separate from request metadata so list/detail reads never load document bytes.
// Uploads are capped at 10 MB, below MongoDB's 16 MB document limit.
const schema = new mongoose.Schema({
    filename: { type: String, required: true, unique: true },
    verificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'IdentityVerification', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    originalFileName: { type: String },
    data: { type: Buffer, required: true, select: false },
}, { timestamps: true });
module.exports = mongoose.model('VerificationDocument', schema);
