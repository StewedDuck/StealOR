const { checkDeadlineReminders, checkOwnerReminders } = require('./deadlineReminderService');
const { flush } = require('./deliveryService');
let running = false;
async function runNotificationCycle() {
    if (running) return;
    running = true;
    try {
        await require('./verificationNotificationService').initializeNotifications();
        for (const run of [require('./savedTorUpdateService').checkSavedTorUpdates, checkDeadlineReminders, checkOwnerReminders, require('./matchingNotificationService').reconcileMatchingNotifications, require('./verificationNotificationService').reconcileVerificationNotifications, flush]) {
            try { await run(); } catch { console.warn('[NOTIFICATION] Scheduled stage deferred'); }
        }
    } finally { running = false; }
}
module.exports = { runNotificationCycle };
