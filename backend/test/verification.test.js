const {
    test,
    describe,
    beforeEach,
} = require("node:test");

const assert = require("node:assert/strict");
const Module = require("node:module");

// Test IDs
const OWNER_ID = "507f1f77bcf86cd799439011";

const ADMIN_ID = "507f191e810c19729de860ea";

const CONTRACTOR_ID = "507f191e810c19729de860eb";

const VERIFICATION_ID =  "507f191e810c19729de860ec";

// Mock state
let mockUsers;
let mockVerification;
let notificationCalls;

let userSaveCalls;
let verificationSaveCalls;

// Mock User model
const UserMock = {

    async findById(id) {

        const user = mockUsers[String(id)];

        return user || null;
    },


    async find(query) {

        if (query.accountRole === "admin") {

            return Object.values(
                mockUsers
            ).filter(
                (user) =>
                    user.accountRole === "admin"
            );
        }

        return [];
    },
};

// Mock IdentityVerification model
const IdentityVerificationMock = {

    async findOne(query) {

        if (
            mockVerification &&
            String(
                mockVerification.userId
            ) === String(query.userId) &&
            mockVerification.status === query.status
        ) {
            return mockVerification;
        }

        return null;
    },


    async findById(id) {

        if (
            mockVerification &&
            String(
                mockVerification._id
            ) === String(id)
        ) {
            return mockVerification;
        }

        return null;
    },


    async create(data) {

        mockVerification = {
            _id: VERIFICATION_ID, ...data,

            createdAt: new Date(),

            async save() {
                verificationSaveCalls++;
                return this;
            },
        };

        return mockVerification;
    },
};

// Mock NotificationLog
const NotificationLogMock = {

    async findOneAndUpdate(
        query,
        update,
        options
    ) {

        notificationCalls.push({
            query,
            update,
            options,
        });

        return {
            ...query,
            ...update.$set,
        };
    },
};

// Mock module imports
const originalRequire = Module.prototype.require;

Module.prototype.require =
    function (request) {

        if (
            request === "../models/User"
        ) {
            return UserMock;
        }


        if (
            request === "../models/IdentityVerification"
        ) {
            return IdentityVerificationMock;
        }


        if (
            request === "../models/NotificationLog"
        ) {
            return NotificationLogMock;
        }


        return originalRequire.apply(
            this,
            arguments
        );
    };


const {
    submitVerification,
    approveVerification,
    rejectVerification,
} = require("../src/controllers/verificationController");


// Restore normal require
Module.prototype.require =  originalRequire;

// Helpers
function createUser({
    id,
    name,
    email,
    role,
    verificationStatus = "not_required",
}) {

    return {
        _id: id,

        name,

        email,

        accountRole: role,

        verificationStatus,

        verificationReason: null,

        async save() {
            userSaveCalls++;
            return this;
        },
    };
}


function createResponse() {

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

function createUploadedFile() {

    return {
        originalname: "identity-card.png",

        filename: "123456-card.png",

        path: "/tmp/123456-card.png",

        mimetype: "image/png",

        size: 1024,
    };
}

// Reset before each test
beforeEach(() => {
    notificationCalls = [];
    userSaveCalls = 0;
    verificationSaveCalls = 0;
    mockVerification = null;
    mockUsers = {

        [OWNER_ID]:
            createUser({
                id: OWNER_ID,

                name: "Project Owner",

                email: "owner@test.com",

                role: "project_owner",
            }),


        [ADMIN_ID]:
            createUser({
                id: ADMIN_ID,

                name: "Admin",

                email: "admin@test.com",

                role: "admin",
            }),


        [CONTRACTOR_ID]:
            createUser({
                id: CONTRACTOR_ID,

                name: "Contractor",

                email: "contractor@test.com",

                role: "contractor",
            }),
    };
});

// Verification Tests
describe(
    "Identity Verification Controller",
    () => {

        // TC01
        test(
            "TC01 - Project Owner submits verification successfully",
            async () => {

                const req = {

                    body: {
                        userId: OWNER_ID,

                        citizenId: "1100401297737",

                        laserCode: "ABC123456789",

                        email: "owner@test.com",

                        phone: "0986194919",
                    },

                    file: createUploadedFile(),
                };


                const res = createResponse();


                await submitVerification(req, res);


                assert.equal(
                    res.statusCode, 201
                );


                assert.equal(
                    res.body.success, true
                );


                assert.equal(
                    mockVerification.status, "pending"
                );


                assert.equal(
                    mockUsers[
                        OWNER_ID
                    ].verificationStatus,
                    "pending"
                );


                assert.equal(
                    notificationCalls.length,
                    1
                );


                assert.equal(
                    notificationCalls[0]
                        .query.type,
                    "identity_verification_requested"
                );


                assert.equal(
                    notificationCalls[0]
                        .query.userId,
                    "admin@test.com"
                );
            }
        );

        // TC02
        test(
            "TC02 - Contractor cannot submit verification",
            async () => {

                const req = {

                    body: {
                        userId:
                            CONTRACTOR_ID,

                        citizenId:
                            "1100401297737",

                        laserCode:
                            "ABC123456789",

                        email:
                            "contractor@test.com",

                        phone:
                            "0986194919",
                    },

                    // No real temp file here because
                    // controller may delete rejected upload.
                    file: {
                        ...createUploadedFile(),
                        path: null,
                    },
                };


                const res =
                    createResponse();


                await submitVerification(
                    req,
                    res
                );


                assert.equal(
                    res.statusCode,
                    403
                );


                assert.equal(
                    res.body.success,
                    false
                );


                assert.equal(
                    mockVerification,
                    null
                );


                assert.equal(
                    notificationCalls.length,
                    0
                );
            }
        );

        // TC03
        test(
            "TC03 - Duplicate pending verification is rejected",
            async () => {

                mockVerification = {

                    _id:
                        VERIFICATION_ID,

                    userId:
                        OWNER_ID,

                    status:
                        "pending",
                };


                const req = {

                    body: {
                        userId:
                            OWNER_ID,

                        citizenId:
                            "1100401297737",

                        laserCode:
                            "ABC123456789",

                        email:
                            "owner@test.com",

                        phone:
                            "0986194919",
                    },

                    file: {
                        ...createUploadedFile(),
                        path: null,
                    },
                };


                const res =
                    createResponse();


                await submitVerification(
                    req,
                    res
                );


                assert.equal(
                    res.statusCode,
                    409
                );


                assert.equal(
                    res.body.success,
                    false
                );


                assert.equal(
                    notificationCalls.length,
                    0
                );
            }
        );

        // TC04
        test(
            "TC04 - Admin approves pending verification",
            async () => {

                mockVerification = {

                    _id:
                        VERIFICATION_ID,

                    userId:
                        OWNER_ID,

                    status:
                        "pending",

                    rejectionReason:
                        null,

                    reviewedBy:
                        null,

                    reviewedAt:
                        null,


                    async save() {

                        verificationSaveCalls++;

                        return this;
                    },
                };


                const req = {

                    params: {
                        id:
                            VERIFICATION_ID,
                    },

                    body: {
                        adminId:
                            ADMIN_ID,
                    },
                };


                const res =
                    createResponse();


                await approveVerification(
                    req,
                    res
                );


                assert.equal(
                    res.statusCode,
                    200
                );


                assert.equal(
                    res.body.success,
                    true
                );


                assert.equal(
                    mockVerification.status,
                    "approved"
                );


                assert.equal(
                    mockUsers[
                        OWNER_ID
                    ].verificationStatus,
                    "approved"
                );


                assert.equal(
                    mockVerification.reviewedBy,
                    ADMIN_ID
                );


                assert.equal(
                    notificationCalls.length,
                    1
                );


                assert.equal(
                    notificationCalls[0]
                        .query.type,
                    "identity_verification_approved"
                );


                assert.equal(
                    notificationCalls[0]
                        .query.userId,
                    "owner@test.com"
                );
            }
        );

        // TC05
        test(
            "TC05 - Admin rejects verification with reason",
            async () => {

                mockVerification = {

                    _id:
                        VERIFICATION_ID,

                    userId:
                        OWNER_ID,

                    status:
                        "pending",

                    rejectionReason:
                        null,

                    reviewedBy:
                        null,

                    reviewedAt:
                        null,


                    async save() {

                        verificationSaveCalls++;

                        return this;
                    },
                };


                const req = {

                    params: {
                        id:
                            VERIFICATION_ID,
                    },

                    body: {
                        adminId:
                            ADMIN_ID,

                        reason:
                            "เอกสารไม่ชัดเจน",
                    },
                };


                const res =
                    createResponse();


                await rejectVerification(
                    req,
                    res
                );


                assert.equal(
                    res.statusCode,
                    200
                );


                assert.equal(
                    res.body.success,
                    true
                );


                assert.equal(
                    mockVerification.status,
                    "rejected"
                );


                assert.equal(
                    mockVerification
                        .rejectionReason,
                    "เอกสารไม่ชัดเจน"
                );


                assert.equal(
                    mockUsers[
                        OWNER_ID
                    ].verificationStatus,
                    "rejected"
                );


                assert.equal(
                    mockUsers[
                        OWNER_ID
                    ].verificationReason,
                    "เอกสารไม่ชัดเจน"
                );


                assert.equal(
                    notificationCalls.length,
                    1
                );


                assert.equal(
                    notificationCalls[0]
                        .query.type,
                    "identity_verification_rejected"
                );


                assert.equal(
                    notificationCalls[0]
                        .query.userId,
                    "owner@test.com"
                );


                assert.equal(
                    notificationCalls[0]
                        .update.$set.message,
                    "เหตุผล: เอกสารไม่ชัดเจน"
                );
            }
        );

        // TC06
        test(
            "TC06 - Reject without reason returns 400",
            async () => {

                const req = {

                    params: {
                        id:
                            VERIFICATION_ID,
                    },

                    body: {
                        adminId:
                            ADMIN_ID,

                        reason: "",
                    },
                };


                const res =
                    createResponse();


                await rejectVerification(
                    req,
                    res
                );


                assert.equal(
                    res.statusCode,
                    400
                );


                assert.equal(
                    res.body.success,
                    false
                );


                assert.equal(
                    notificationCalls.length,
                    0
                );
            }
        );

        // TC07
        test(
            "TC07 - Non-admin cannot approve verification",
            async () => {

                mockVerification = {

                    _id:
                        VERIFICATION_ID,

                    userId:
                        OWNER_ID,

                    status:
                        "pending",
                };


                const req = {

                    params: {
                        id:
                            VERIFICATION_ID,
                    },

                    body: {
                        adminId:
                            CONTRACTOR_ID,
                    },
                };


                const res =
                    createResponse();


                await approveVerification(
                    req,
                    res
                );


                assert.equal(
                    res.statusCode,
                    403
                );


                assert.equal(
                    res.body.success,
                    false
                );


                assert.equal(
                    mockVerification.status,
                    "pending"
                );


                assert.equal(
                    notificationCalls.length,
                    0
                );
            }
        );

        // TC08
        test(
            "TC08 - Already reviewed verification cannot be approved again",
            async () => {

                mockVerification = {

                    _id:
                        VERIFICATION_ID,

                    userId:
                        OWNER_ID,

                    status:
                        "approved",
                };


                const req = {

                    params: {
                        id:
                            VERIFICATION_ID,
                    },

                    body: {
                        adminId:
                            ADMIN_ID,
                    },
                };


                const res =
                    createResponse();


                await approveVerification(
                    req,
                    res
                );


                assert.equal(
                    res.statusCode,
                    409
                );


                assert.equal(
                    res.body.success,
                    false
                );


                assert.equal(
                    notificationCalls.length,
                    0
                );
            }
        );
    }
);