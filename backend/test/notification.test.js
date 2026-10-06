const {
    test,
    describe,
    beforeEach,
} = require("node:test");

const assert = require("node:assert/strict");

// Mock data
let mockBookmarks = [];
let mockGovernmentProject = null;
let mockInternalTor = null;
let mockUser = null;
let mockExistingNotification = null;

let createdNotifications = [];
let sentEmails = [];

// Mock Bookmark
const mockBookmark = {
    find: async () => mockBookmarks,
};

// Mock GovProject
const mockGovProject = {
    findOne: () => ({
        lean: async () => mockGovernmentProject,
    }),
};

// Mock Tor
const mockTor = {
    findById: () => ({
        lean: async () => mockInternalTor,
    }),
};

// Mock User
const mockUserModel = {
    findOne: () => ({
        lean: async () => mockUser,
    }),
};

// Mock NotificationLog
const mockNotificationLog = {

    findOne: () => ({
        lean: async () =>
            mockExistingNotification,
    }),

    create: async (data) => {
        createdNotifications.push(data);

        return {
            _id: "notification123",
            ...data,
        };
    },
};

// Mock Email
const mockDeadlineReminder = (data) => ({
    subject: `Deadline: ${data.torTitle}`,
    text: `TOR closes in ${data.daysLeft} days`,
    html: `<p>TOR closes in ${data.daysLeft} days</p>`,
});


const mockSendEmail = async (data) => {
    sentEmails.push(data);

    return {
        success: true,
    };
};


// Replace required modules
const Module = require("module");

const originalRequire =
    Module.prototype.require;


Module.prototype.require = function (path) {

    if (path === "../../models/Bookmark") {
        return mockBookmark;
    }

    if (path === "../../models/GovProject") {
        return mockGovProject;
    }

    if (path === "../../models/Tor") {
        return mockTor;
    }

    if (path === "../../models/User") {
        return mockUserModel;
    }

    if (path === "../../models/NotificationLog") {
        return mockNotificationLog;
    }

    if (path === "../../email/Contractor") {
        return {
            deadlineReminder:
                mockDeadlineReminder,
        };
    }

    if (path === "../../email/Mailer") {
        return {
            sendEmail: mockSendEmail,
        };
    }

    return originalRequire.apply(
        this,
        arguments
    );
};

// Import service AFTER mocks
const {
    checkDeadlineReminders,
} = require(
    "../src/services/notifications/deadlineReminderService"
);


// Restore normal require
Module.prototype.require = originalRequire;

// Helper
function dateFromToday(days) {

    const date = new Date();

    date.setHours(12, 0, 0, 0);

    date.setDate(
        date.getDate() + days
    );

    return date;
}

// Tests
describe(
    "Deadline Reminder Notification Service",
    () => {

        beforeEach(() => {

            // Reset everything before every test

            mockBookmarks = [];

            mockGovernmentProject = null;

            mockInternalTor = null;

            mockUser = {
                name: "Test User",
                email: "test@example.com",
            };

            mockExistingNotification = null;

            createdNotifications = [];

            sentEmails = [];
        });

        // TC01
        // Government TOR - 5 days remaining
        test(
            "TC01 - should create deadline_5_days notification when government TOR has 5 days left",
            async () => {

                mockBookmarks = [
                    {
                        _id: "bookmark1",

                        userId:
                            "test@example.com",

                        source:
                            "government",

                        projectId:
                            "PROJECT001",

                        torId: null,

                        match: {
                            percent: 80,
                        },
                    },
                ];


                mockGovernmentProject = {

                    project_id:
                        "PROJECT001",

                    project_name:
                        "Government Test TOR",

                    raw_data: {

                        project_description:
                            "Test government project",

                        submission_deadline:
                            dateFromToday(5),
                    },
                };


                await checkDeadlineReminders();


                // Should create exactly one notification
                assert.equal(
                    createdNotifications.length,
                    1
                );


                const notification =
                    createdNotifications[0];


                assert.equal(
                    notification.type,
                    "deadline_5_days"
                );


                assert.equal(
                    notification.source,
                    "government"
                );


                assert.equal(
                    notification.projectId,
                    "PROJECT001"
                );


                assert.equal(
                    notification.torId,
                    null
                );


                assert.equal(
                    notification.read,
                    false
                );


                assert.match(
                    notification.title,
                    /Government Test TOR/
                );


                assert.equal(
                    notification.message,
                    "รหัส TOR: PROJECT001"
                );


                // Email should also be sent
                assert.equal(
                    sentEmails.length,
                    1
                );
            }
        );

        // TC02
        // Government TOR - 1 day remaining
        test(
            "TC02 - should create deadline_1_day notification when government TOR has 1 day left",
            async () => {

                mockBookmarks = [
                    {
                        _id: "bookmark2",

                        userId:
                            "test@example.com",

                        source:
                            "government",

                        projectId:
                            "PROJECT002",

                        torId: null,
                    },
                ];


                mockGovernmentProject = {

                    project_id:
                        "PROJECT002",

                    project_name:
                        "One Day TOR",

                    raw_data: {

                        submission_deadline:
                            dateFromToday(1),
                    },
                };


                await checkDeadlineReminders();


                assert.equal(
                    createdNotifications.length,
                    1
                );


                const notification =
                    createdNotifications[0];


                assert.equal(
                    notification.type,
                    "deadline_1_day"
                );


                assert.equal(
                    notification.projectId,
                    "PROJECT002"
                );


                assert.match(
                    notification.title,
                    /One Day TOR/
                );


                assert.equal(
                    notification.message,
                    "รหัส TOR: PROJECT002"
                );


                assert.equal(
                    sentEmails.length,
                    1
                );
            }
        );

        // TC03
        // 4 days remaining -> do nothing
        test(
            "TC03 - should not create notification when TOR has 4 days left",
            async () => {

                mockBookmarks = [
                    {
                        _id: "bookmark3",

                        userId:
                            "test@example.com",

                        source:
                            "government",

                        projectId:
                            "PROJECT003",
                    },
                ];


                mockGovernmentProject = {

                    project_id:
                        "PROJECT003",

                    project_name:
                        "Four Day TOR",

                    raw_data: {

                        submission_deadline:
                            dateFromToday(4),
                    },
                };


                await checkDeadlineReminders();


                assert.equal(
                    createdNotifications.length,
                    0
                );


                assert.equal(
                    sentEmails.length,
                    0
                );
            }
        );

        // TC04
        // No deadline
        test(
            "TC04 - should not create notification when TOR has no deadline",
            async () => {

                mockBookmarks = [
                    {
                        _id: "bookmark4",

                        userId:
                            "test@example.com",

                        source:
                            "government",

                        projectId:
                            "PROJECT004",
                    },
                ];


                mockGovernmentProject = {

                    project_id:
                        "PROJECT004",

                    project_name:
                        "No Deadline TOR",

                    raw_data: {},
                };


                await checkDeadlineReminders();


                assert.equal(
                    createdNotifications.length,
                    0
                );


                assert.equal(
                    sentEmails.length,
                    0
                );
            }
        );

        // TC05
        // Duplicate notification
        test(
            "TC05 - should not send duplicate deadline notification",
            async () => {

                mockBookmarks = [
                    {
                        _id: "bookmark5",

                        userId:
                            "test@example.com",

                        source:
                            "government",

                        projectId:
                            "PROJECT005",
                    },
                ];


                mockGovernmentProject = {

                    project_id:
                        "PROJECT005",

                    project_name:
                        "Duplicate TOR",

                    raw_data: {

                        submission_deadline:
                            dateFromToday(1),
                    },
                };


                // Notification already exists
                mockExistingNotification = {

                    _id:
                        "existingNotification",

                    userId:
                        "test@example.com",

                    source:
                        "government",

                    projectId:
                        "PROJECT005",

                    type:
                        "deadline_1_day",
                };


                await checkDeadlineReminders();


                // Must NOT create another one
                assert.equal(
                    createdNotifications.length,
                    0
                );


                // Must NOT send email again
                assert.equal(
                    sentEmails.length,
                    0
                );
            }
        );


        // TC06
        // Government TOR not found
        test(
            "TC06 - should not create notification when government TOR does not exist",
            async () => {

                mockBookmarks = [
                    {
                        _id: "bookmark6",

                        userId:
                            "test@example.com",

                        source:
                            "government",

                        projectId:
                            "NOT_FOUND",
                    },
                ];


                mockGovernmentProject = null;


                await checkDeadlineReminders();


                assert.equal(
                    createdNotifications.length,
                    0
                );


                assert.equal(
                    sentEmails.length,
                    0
                );
            }
        );


        // TC07
        // Internal TOR - 1 day
        test(
            "TC07 - should create deadline notification for internal TOR",
            async () => {

                mockBookmarks = [
                    {
                        _id: "bookmark7",

                        userId:
                            "test@example.com",

                        source:
                            "internal",

                        projectId: null,

                        torId:
                            "internalTor123",

                        match: {
                            percent: 90,
                        },
                    },
                ];


                mockInternalTor = {

                    _id:
                        "internalTor123",

                    projectName:
                        "Internal Test TOR",

                    description:
                        "Internal TOR description",

                    scopeOfWork: [
                        "Develop system",
                        "Testing",
                    ],

                    submissionDeadline:
                        dateFromToday(1),
                };


                await checkDeadlineReminders();


                assert.equal(
                    createdNotifications.length,
                    1
                );


                const notification =
                    createdNotifications[0];


                assert.equal(
                    notification.type,
                    "deadline_1_day"
                );


                assert.equal(
                    notification.source,
                    "internal"
                );


                assert.equal(
                    notification.projectId,
                    null
                );


                assert.equal(
                    notification.torId,
                    "internalTor123"
                );


                assert.match(
                    notification.title,
                    /Internal Test TOR/
                );


                assert.equal(
                    notification.message,
                    "รหัส TOR: internalTor123"
                );


                assert.equal(
                    sentEmails.length,
                    1
                );
            }
        );

    }
);