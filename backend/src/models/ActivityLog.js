// backend/src/models/ActivityLog.js
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
    category: {
        type: String,
        enum: ['user', 'tor', 'system', 'security'],
        required: true
    },
    actorName: {
        type: String,
        required: true // เช่น "StealOR Bot", "Jongchana (Admin)"
    },
    action: {
        type: String,
        required: true // เช่น "อัปเดต e-GP RSS", "อนุมัติ TOR"
    },
    details: {
        type: String,
        default: '' // รายละเอียดเพิ่มเติม (ถ้ามี)
    }
}, { timestamps: true });

module.exports = mongoose.model('ActivityLog', activityLogSchema);