const NotificationLog = require("../models/NotificationLog");
const GovProject = require("../models/GovProject");
const Tor = require("../models/Tor");

async function getNotifications(req, res) {
    try {
        const { userId } = req.query;

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


        const data = await Promise.all(
            notifications.map(async (notification) => {

                let torName = "";
                let torIdentifier = "";

                // Government TOR
                if (
                    notification.source === "government" &&
                    notification.projectId
                ) {
                    const project =
                        await GovProject.findOne({
                            project_id:
                                notification.projectId,
                        })
                            .select(
                                "project_name project_id raw_data"
                            )
                            .lean();

                    if (project) {
                        torName =
                            project.project_name ||
                            project.raw_data?.project_name ||
                            "ไม่ระบุชื่อ TOR";

                        torIdentifier =
                            project.project_id;
                    }
                }


                // Internal TOR
                if (
                    notification.source === "internal" &&
                    notification.torId
                ) {
                    const tor =
                        await Tor.findById(
                            notification.torId
                        )
                            .select(
                                "projectName"
                            )
                            .lean();

                    if (tor) {
                        torName =
                            tor.projectName ||
                            "ไม่ระบุชื่อ TOR";

                        torIdentifier =
                            notification.torId;
                    }
                }


                return {
                    ...notification,
                    torName,
                    torIdentifier,
                };
            })
        );


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

        const notification =
            await NotificationLog.findByIdAndUpdate(
                id,
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