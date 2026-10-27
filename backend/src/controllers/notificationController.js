const NotificationLog = require("../models/NotificationLog");
const GovProject = require("../models/GovProject");
const Tor = require("../models/Tor");

async function getNotifications(req, res) {
    try {
        const userId = req.profileEmail;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "userId is required",
            });
        }

        const notifications =
            await NotificationLog.find({
                userId: userId.trim().toLowerCase(),
            })
                .sort({ sentAt: -1 })
                .lean();


        // Resolve each TOR once and only load its display name, not large imported raw data.
        const projectIds = [...new Set(notifications.filter(row => row.source === 'government' && row.projectId).map(row => row.projectId))];
        const torIds = [...new Set(notifications.filter(row => row.source === 'internal' && row.torId).map(row => row.torId))];
        const [projects, tors] = await Promise.all([
            projectIds.length ? GovProject.find({ project_id: { $in: projectIds } }).select('project_name project_id raw_data.project_name').lean() : [],
            torIds.length ? Tor.find({ _id: { $in: torIds } }).select('projectName').lean() : [],
        ]);
        const projectNames = new Map(projects.map(project => [project.project_id, project.project_name || project.raw_data?.project_name || 'ไม่ระบุชื่อ TOR']));
        const torNames = new Map(tors.map(tor => [String(tor._id), tor.projectName || 'ไม่ระบุชื่อ TOR']));
        const data = notifications.map(notification => ({
            ...notification,
            torName: notification.source === 'government' ? projectNames.get(notification.projectId) || '' : torNames.get(notification.torId) || '',
            torIdentifier: notification.source === 'government' ? notification.projectId || '' : notification.torId || '',
        }));


        const unread =
            data.filter(
                (notification) =>
                    !notification.read
            ).length;


        return res.status(200).json({
            success: true,
            total: data.length,
            unread,
            data,
        });

    } catch (error) {
        console.error(
            "Get notifications error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
}

async function markNotificationAsRead(req, res) {
    try {
        const { id } = req.params;
        if (!require('mongoose').isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid notification ID' });

        const notification =
            await NotificationLog.findOneAndUpdate(
                { _id: id, userId: req.profileEmail },
                {
                    $set: { read: true, },
                },
                {
                    new: true,
                }
            );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: notification,
        });
    } catch (error) {
        console.error(
            "Mark notification as read error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
}

module.exports = {
    getNotifications,
    markNotificationAsRead,
};