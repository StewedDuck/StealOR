const Bookmark = require("../../models/Bookmark");
const GovProject = require("../../models/GovProject");
const Tor = require("../../models/Tor");
const User = require("../../models/User");
const NotificationLog = require("../../models/NotificationLog");

const { deadlineReminder } = require("../../email/Contractor");
const { sendEmail } = require("../../email/Mailer");

function getDaysLeft(deadline) {
    const now = new Date();
    const closeDate = new Date(deadline);

    now.setHours(0, 0, 0, 0);
    closeDate.setHours(0, 0, 0, 0);

    const difference = closeDate.getTime() - now.getTime();

    return Math.ceil(difference / (1000 * 60 * 60 * 24));
}

async function checkDeadlineReminders() {
    console.log("Checking TOR deadline reminders...");

    const bookmarks = await Bookmark.find({});
    console.log(`Found ${bookmarks.length} bookmarks`);

    for (const bookmark of bookmarks) {
        try {
                console.log("Checking bookmark:", {
                    id: bookmark._id,
                    userId: bookmark.userId,
                    source: bookmark.source,
                    projectId: bookmark.projectId,
                    torId: bookmark.torId,
                });
                let torTitle = "";
                let scope = "";
                let closeDate = null;
                let torUrl = "";

                // Government TOR
                if(
                    bookmark.source === "government" && bookmark.projectId
                ) {
                    const project = await GovProject.findOne({
                        project_id: bookmark.projectId,
                    }).lean();

                    console.log("Government project found:", !!project);

                    if (!project) {
                        continue;
                    }

                    console.log(
                        "Government project data:",
                        JSON.stringify(project, null, 2)
                    );

                    const raw = project.raw_data || {};

                    torTitle = project.project_name || raw.project_name || "ไม่ระบุชื่อ TOR";
                    scope = raw.project_description || raw.description || "ไม่ระบุขอบเขตงาน";
                    closeDate = raw.submission_deadline || raw.deadline || raw.project_end_date || null;
                    torUrl = `${process.env.APP_URL}/contractor/saved`;
                }

                // Internal TOR
                if(
                    bookmark.source === "internal" && bookmark.torId
                ) {
                    const tor = await Tor.findById(bookmark.torId).lean();

                    if (!tor) {
                        continue;
                    }

                    torTitle = tor.projectName;
                    scope = tor.scopeOfWork?.join(", ") || tor.description || "ไม่ระบุขอบเขตงาน";
                    closeDate = tor.submissionDeadline;
                    torUrl = `${process.env.APP_URL}/contractor/saved`;
                }
                if (!closeDate) {
                    console.log("No closeDate found for:", torTitle);
                    continue;
                }
                
                const daysLeft = getDaysLeft(closeDate);
                
                console.log({
                    torTitle,
                    closeDate,
                    daysLeft,
                    source: bookmark.source,
                });

                // ===== TEST ONLY =====
                // const daysLeft = 1;

                // closeDate = new Date();
                // closeDate.setDate(closeDate.getDate() + daysLeft);

                // console.log("TEST deadline:", {
                //     torTitle,
                //     closeDate,
                //     daysLeft,
                // });
                // =====================

                // const daysLeft = getDaysLeft(closeDate);
                // console.log({
                //     torTitle,
                //     closeDate,
                //     daysLeft,
                //     source: bookmark.source,
                // });

                // sent onlt 5 day and 1 day before end
                if (daysLeft !== 5 && daysLeft !== 1) {
                    continue;
                }

                const notificationType = daysLeft === 5 ? "deadline_5_days" : "deadline_1_day";

                const notificationQuery = {
                    userId: bookmark.userId,
                    source: bookmark.source,
                    projectId: bookmark.source === "government" 
                        ? bookmark.projectId 
                        : null,
                    torId: bookmark.source === "internal"
                        ? bookmark.torId
                        : null,
                    type: notificationType,
                };

                const alreadySent = await NotificationLog.findOne(notificationQuery).lean();

                if (alreadySent) {
                    console.log(
                        `Reminder already sent: ${bookmark.userId} - ${notificationType}`
                    );
                    continue;
                }

                const user = await User.findOne({
                    email: bookmark.userId.trim().toLowerCase(),
                }).lean();

                if(!user) {
                    console.log(`User not found: ${bookmark.userId}`);
                    continue;
                }

                const matchPercent = bookmark.match?.percent ?? 0;
                const email = deadlineReminder({
                    name: user.name,
                    torTitle,
                    scope,
                    matchPercent,
                    closeDate,
                    torUrl,
                    daysLeft
                });

                await sendEmail({
                    to: user.email,
                    subject: email.subject,
                    text: email.text,
                    html: email.html,
                });

                const torIdentifier =
                    bookmark.source === "government"
                        ? bookmark.projectId
                        : bookmark.torId;

                const title =
                    daysLeft === 5
                        ? `TOR ใกล้ปิดรับใน 5 วัน: ${torTitle}`
                        : `TOR ใกล้ปิดรับใน 1 วัน: ${torTitle}`;

                const message =
                    `รหัส TOR: ${torIdentifier}`;

                await NotificationLog.create({
                    ...notificationQuery,
                    title,
                    message,
                    read: false,
                    sentAt: new Date(),
                });

                console.log(
                    `Deadline reminder sent to ${user.email}: ${torTitle} (${daysLeft} days)`
                );
            } catch (error) {
                console.error(`Deadline reminder failed for bookmark ${bookmark._id}:`, error.message);
        }
    }

    console.log("Finish checking TOR deadlines");
}

module.exports = { checkDeadlineReminders, }