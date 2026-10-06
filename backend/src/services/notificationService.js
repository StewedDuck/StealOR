const Bookmark = require("../models/Bookmark");
const GovProject = require("../models/GovProject");
const Tor = require("../models/Tor");
const NotificationLog = require("../models/NotificationLog");

function getDaysUntil(deadline, now = new Date()) {
    if (!deadline) return null;

    const target = new Date(deadline);

    if (Number.isNaN(target.getTime())) {
        return null;
    }

    const startToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );

    const startTarget = new Date(
        target.getFullYear(),
        target.getMonth(),
        target.getDate()
    );

    return Math.round(
        (startTarget.getTime() - startToday.getTime()) /
        (1000 * 60 * 60 * 24)
    );
}

async function createDeadlineNotification({
    bookmark,
    projectName,
    deadline,
}) {
    const days = getDaysUntil(deadline);

    if (days !== 5 && days !== 1) {
        return null;
    }

    const type =
        days === 5
            ? "deadline_5_days"
            : "deadline_1_day";

    const title =
        days === 5
            ? `Closing in 5 days: ${projectName}`
            : `Closing in 1 day: ${projectName}`;

    const message =
        days === 5
            ? "A saved TOR is closing in 5 days."
            : "A saved TOR is closing tomorrow.";

    return NotificationLog.findOneAndUpdate(
        {
            userId: bookmark.userId,
            source: bookmark.source,
            projectId:
                bookmark.source === "government"
                    ? bookmark.projectId
                    : null,
            torId:
                bookmark.source === "internal"
                    ? bookmark.torId
                    : null,
            type,
        },
        {
            $setOnInsert: {
                title,
                message,
                read: false,
                sentAt: new Date(),
            },
        },
        {
            upsert: true,
            new: true,
        }
    );
}

async function checkDeadlineNotifications() {
    const bookmarks = await Bookmark.find({}).lean();

    for (const bookmark of bookmarks) {
        if (
            bookmark.source === "government" &&
            bookmark.projectId
        ) {
            const project = await GovProject.findOne({
                project_id: bookmark.projectId,
            }).lean();

            if (!project) continue;

            const raw = project.raw_data || {};

            const deadline =
                raw.submission_deadline ||
                raw.deadline ||
                raw.project_end_date ||
                null;

            await createDeadlineNotification({
                bookmark,
                projectName:
                    project.project_name ||
                    raw.project_name ||
                    bookmark.projectId,
                deadline,
            });
        }

        if (
            bookmark.source === "internal" &&
            bookmark.torId
        ) {
            const tor = await Tor.findById(
                bookmark.torId
            ).lean();

            if (!tor) continue;

            await createDeadlineNotification({
                bookmark,
                projectName: tor.projectName,
                deadline: tor.submissionDeadline,
            });
        }
    }
}

module.exports = {
    getDaysUntil,
    createDeadlineNotification,
    checkDeadlineNotifications,
};