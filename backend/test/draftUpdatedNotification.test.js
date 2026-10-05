const {
    test,
    describe,
    beforeEach,
} = require("node:test");

const assert = require("node:assert/strict");
const TEST_TOR_ID = "507f1f77bcf86cd799439011";
// Mock state
let mockTor = null;
let mockBookmarks = [];
let mockUser = null;

let notificationUpdates = [];
let sentEmails = [];

// Mock Tor model
const mockTorModel = {
    findOneAndUpdate: async () => mockTor,
};

// Mock Bookmark model
const mockBookmarkModel = {
    find: () => ({
        lean: async () => mockBookmarks,
    }),
};

// Mock User model
const mockUserModel = {
    findOne: () => ({
        lean: async () => mockUser,
    }),
};

// Mock NotificationLog
const mockNotificationLog = {
    findOneAndUpdate: async (
        query,
        update,
        options
    ) => {
        notificationUpdates.push({
            query,
            update,
            options,
        });

        return {
            _id: "notification123",
            ...query,
            ...update.$set,
        };
    },
};

// Mock email
const mockDraftUpdated = (data) => ({
    subject: `TOR draft updated: ${data.torTitle}`,
    text: "Draft TOR updated",
    html: "<p>Draft TOR updated</p>",
});


const mockSendEmail = async (data) => {
    sentEmails.push(data);

    return {
        success: true,
    };
};

// Mock require()
const Module = require("module");

const originalRequire =
    Module.prototype.require;


Module.prototype.require = function (path) {

    if (path === "../models/Tor") {
        return mockTorModel;
    }

    if (path === "../models/Bookmark") {
        return mockBookmarkModel;
    }

    if (path === "../models/User") {
        return mockUserModel;
    }

    if (path === "../models/NotificationLog") {
        return mockNotificationLog;
    }

    if (path === "../email/Contractor") {
        return {
            draftUpdated: mockDraftUpdated,
        };
    }

    if (path === "../email/Mailer") {
        return {
            sendEmail: mockSendEmail,
        };
    }

    return originalRequire.apply(
        this,
        arguments
    );
};

// Import controller AFTER mocks
const {
    updateTor,
} = require(
    "../src/controllers/torController"
);


// Restore require
Module.prototype.require = originalRequire;

// Mock Express response
function createMockResponse() {

    return {
        statusCode: 200,
        body: null,

        status(code) {
            this.statusCode = code;
            return this;
        },

        json(data) {
            this.body = data;
            return this;
        },
    };
}

// Tests
describe(
    "Draft Updated Notification",
    () => {

        beforeEach(() => {

            mockTor = {
                _id: TEST_TOR_ID,

                projectName: "Test Draft TOR",

                agencyName: "Test Agency",

                description: "Test description",

                objectives: [
                    "Objective 1",
                ],

                scopeOfWork: [
                    "Develop system",
                ],

                requirements: [],

                budget: 100000,

                submissionDeadline:
                    new Date(
                        "2026-12-31"
                    ),

                contactName:
                    "Project Owner",

                contactEmail:
                    "owner@example.com",

                status: "draft",

                toObject() {
                    return {
                        ...this,
                    };
                },
            };


            mockBookmarks = [];

            mockUser = {
                name: "Contractor Test",
                email: "contractor@example.com",
            };

            notificationUpdates = [];

            sentEmails = [];
        });

        // TC01
        // Draft updated + bookmarked
        test(
            "TC01 - should create draft_updated notification when bookmarked draft is updated",
            async () => {

                mockBookmarks = [
                    {
                        _id: "bookmark1",

                        userId: "contractor@example.com",

                        source: "internal",

                        torId: TEST_TOR_ID,
                    },
                ];


                const req = {
                    params: {
                        id: TEST_TOR_ID,
                    },

                    body: {
                        projectName: "Updated Test Draft TOR",
                    },
                };


                const res = createMockResponse();


                await updateTor(req, res);


                assert.equal(
                    notificationUpdates.length, 1
                );


                const notification = notificationUpdates[0];


                assert.equal(
                    notification.query.userId, "contractor@example.com"
                );


                assert.equal(
                    notification.query.source, "internal"
                );


                assert.equal(
                    notification.query.torId, TEST_TOR_ID
                );


                assert.equal(
                    notification.query.type, "draft_updated"
                );


                assert.equal(
                    notification.update.$set.read, false
                );


                assert.match(
                    notification.update.$set.title, /Test Draft TOR/
                );


                assert.equal(
                    sentEmails.length, 1
                );
            }
        );

        // TC02
        // Draft updated but nobody bookmarked it
        test(
            "TC02 - should not create notification when updated draft has no bookmarks",
            async () => {

                mockBookmarks = [];


                const req = {
                    params: {
                        id: TEST_TOR_ID,
                    },

                    body: {
                        projectName: "Updated TOR",
                    },
                };


                const res = createMockResponse();


                await updateTor(req, res);


                assert.equal(
                    notificationUpdates.length, 0
                );


                assert.equal(
                    sentEmails.length, 0
                );
            }
        );

        // TC03
        // Bookmark exists but User does not exist
        test(
            "TC03 - should not create notification when bookmarked user does not exist",
            async () => {

                mockBookmarks = [
                    {
                        _id: "bookmark3",

                        userId: "missing@example.com",

                        source: "internal",

                        torId: TEST_TOR_ID,
                    },
                ];


                mockUser = null;


                const req = {
                    params: { 
                        id: TEST_TOR_ID,
                    },

                    body: {
                        projectName: "Updated TOR",
                    },
                };


                const res = createMockResponse();


                await updateTor(req, res);


                assert.equal(
                    notificationUpdates.length, 0
                );


                assert.equal(
                    sentEmails.length, 0
                );
            }
        );

        // TC04
        // Updating again should use findOneAndUpdate
        // instead of creating another notification
        test(
            "TC04 - should update existing draft notification and mark it unread again",
            async () => {

                mockBookmarks = [
                    {
                        _id: "bookmark4",

                        userId: "contractor@example.com",

                        source: "internal",

                        torId: TEST_TOR_ID,
                    },
                ];


                const req = {
                    params: {
                        id: TEST_TOR_ID,
                    },

                    body: {
                        description: "Updated description",
                    },
                };


                const res = createMockResponse();


                await updateTor(req, res);


                assert.equal(
                    notificationUpdates.length, 1
                );


                const notification = notificationUpdates[0];


                // Same user + same TOR + same type
                // is used to find existing notification
                assert.deepEqual(
                    notification.query,
                    {
                        userId: "contractor@example.com",

                        source: "internal",

                        projectId: null,

                        torId: TEST_TOR_ID,

                        type: "draft_updated",
                    }
                );


                // Update should turn it unread again
                assert.equal(
                    notification.update.$set.read,
                    false
                );


                // Must use upsert so the same query
                // creates it if it does not exist
                assert.equal(
                    notification.options.upsert,
                    true
                );


                assert.equal(
                    notification.options.new,
                    true
                );
            }
        );

    }
);