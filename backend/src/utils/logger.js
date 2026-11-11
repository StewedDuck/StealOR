// backend/src/utils/logger.js
const ActivityLog = require('../models/ActivityLog');

const logActivity = async (category, actorName, action, details = '') => {
    try {
        await ActivityLog.create({ category, actorName, action, details });
    } catch (error) {
        console.error('❌ [Logger Error] ไม่สามารถบันทึก Log ได้:', error.message);
    }
};

module.exports = { logActivity };