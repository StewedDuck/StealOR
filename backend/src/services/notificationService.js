// Compatibility entry point: all reminder scans now share one deadline policy and delivery queue.
const reminders = require('./notifications/deadlineReminderService');
module.exports = { getDaysUntil: reminders.getDaysUntil, checkDeadlineNotifications: reminders.checkDeadlineReminders };
