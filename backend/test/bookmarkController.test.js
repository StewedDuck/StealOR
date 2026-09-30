const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");


// Helper: Mock Mongoose Query
function mockQuery(data) {
    return {
        // รองรับ .lean()
        lean: async () => data,

        // รองรับ await Model.findOne(...)
        then: (resolve, reject) =>
            Promise.resolve(data).then(resolve, reject),
    };
}


// Mock Models
const mockBookmark = {
    findOne: async () => null,

    create: async (data) => data,

    find: () => ({
        sort: async () => [],
    }),

    findOneAndDelete: async () => null,
};


const mockGovProject = {
    findOne: () => mockQuery(null),
};


const mockTor = {
    findById: () => mockQuery(null),
};


// Mock mongoose models before loading controller
const Module = require("module");

const originalRequire = Module.prototype.require;

Module.prototype.require = function (path) {

    if (path === "../models/Bookmark") {
        return mockBookmark;
    }

    if (path === "../models/GovProject") {
        return mockGovProject;
    }

    if (path === "../models/Tor") {
        return mockTor;
    }

    return originalRequire.apply(this, arguments);
};


const {
    createBookmark,
    getBookmarks,
    deleteBookmark,
} = require("../src/controllers/bookmarkController");


Module.prototype.require = originalRequire;


// Helper: Mock Express Response
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

// Bookmark Controller Tests
describe("Bookmark Controller", () => {

    // Reset mocks before every test
    beforeEach(() => {
        // Bookmark
        mockBookmark.findOne = async () => null;

        mockBookmark.create = async (data) => ({
            _id: "bookmark123",
            ...data,
        });

        mockBookmark.find = () => ({
            sort: async () => [],
        });

        mockBookmark.findOneAndDelete = async () => ({
            _id: "bookmark123",
        });

        // Government Project
        mockGovProject.findOne = () =>
            mockQuery({
                project_id: "project123",
                project_name: "Test Government Project",
                dept_name: "Test Department",
                budget_amount: 1000000,
                sum_price_agree: null,
                contract_status: "Active",
                raw_data: {},
            });

        // Internal TOR
        mockTor.findById = () =>
            mockQuery({
                _id: "tor123",
                projectName: "Test Internal TOR",
                agencyName: "Test Agency",
                budget: 500000,
                submissionDeadline: null,
                status: "published",
                description: "Test TOR description",
                objectives: [],
                scopeOfWork: [],
                requirements: [],
            });
    });


    // createBookmark
    test(
        "createBookmark - should return 400 when userId is missing",
        async () => {

            const req = {
                body: {
                    source: "government",
                    projectId: "project123",
                },
            };

            const res = createMockResponse();

            await createBookmark(req, res);

            assert.equal(res.statusCode, 400);

            assert.equal(
                res.body.success,
                false
            );

            assert.equal(
                res.body.error,
                "User id is required"
            );
        }
    );


    test(
        "createBookmark - should return 400 when internal TOR id is missing",
        async () => {

            const req = {
                body: {
                    userId: "user123",
                    source: "internal",
                },
            };

            const res = createMockResponse();

            await createBookmark(req, res);

            assert.equal(res.statusCode, 400);

            assert.equal(
                res.body.success,
                false
            );

            assert.equal(
                res.body.error,
                "TOR id is required"
            );
        }
    );


    test(
        "createBookmark - should return 404 when government TOR does not exist",
        async () => {

            mockGovProject.findOne = () =>
                mockQuery(null);

            const req = {
                body: {
                    userId: "user123",
                    source: "government",
                    projectId: "project123",
                },
            };

            const res = createMockResponse();

            await createBookmark(req, res);

            assert.equal(res.statusCode, 404);

            assert.equal(
                res.body.success,
                false
            );

            assert.equal(
                res.body.error,
                "Government TOR not found"
            );
        }
    );


    test(
        "createBookmark - should return 404 when internal TOR does not exist",
        async () => {

            mockTor.findById = () =>
                mockQuery(null);

            const req = {
                body: {
                    userId: "user123",
                    source: "internal",
                    torId: "tor123",
                },
            };

            const res = createMockResponse();

            await createBookmark(req, res);

            assert.equal(res.statusCode, 404);

            assert.equal(
                res.body.success,
                false
            );

            assert.equal(
                res.body.error,
                "TOR not found"
            );
        }
    );


    test(
        "createBookmark - should return existing bookmark when already bookmarked",
        async () => {

            const existingBookmark = {
                _id: "existing123",
                userId: "user123",
                source: "government",
                projectId: "project123",
            };

            mockBookmark.findOne = async () =>
                existingBookmark;


            const req = {
                body: {
                    userId: "user123",
                    source: "government",
                    projectId: "project123",
                },
            };

            const res = createMockResponse();

            await createBookmark(req, res);

            assert.equal(res.statusCode, 200);

            assert.equal(
                res.body.success,
                true
            );

            assert.equal(
                res.body.message,
                "TOR already bookmarked"
            );

            assert.deepEqual(
                res.body.data,
                existingBookmark
            );
        }
    );


    test(
        "createBookmark - should create government bookmark successfully",
        async () => {

            const req = {
                body: {
                    userId: "user123",
                    source: "government",
                    projectId: "project123",
                    savedFrom: "market",
                },
            };

            const res = createMockResponse();

            await createBookmark(req, res);

            assert.equal(res.statusCode, 201);

            assert.equal(
                res.body.success,
                true
            );

            assert.equal(
                res.body.message,
                "TOR bookmarked successfully"
            );

            assert.equal(
                res.body.data.userId,
                "user123"
            );

            assert.equal(
                res.body.data.source,
                "government"
            );

            assert.equal(
                res.body.data.projectId,
                "project123"
            );

            assert.equal(
                res.body.data.torId,
                null
            );
        }
    );


    test(
        "createBookmark - should create internal bookmark successfully",
        async () => {

            const req = {
                body: {
                    userId: "user123",
                    source: "internal",
                    torId: "tor123",
                    savedFrom: "matching",
                    match: {
                        skills: true,
                    },
                },
            };

            const res = createMockResponse();

            await createBookmark(req, res);

            assert.equal(res.statusCode, 201);

            assert.equal(
                res.body.success,
                true
            );

            assert.equal(
                res.body.message,
                "TOR bookmarked successfully"
            );

            assert.equal(
                res.body.data.userId,
                "user123"
            );

            assert.equal(
                res.body.data.source,
                "internal"
            );

            assert.equal(
                res.body.data.torId,
                "tor123"
            );

            assert.equal(
                res.body.data.projectId,
                null
            );

            assert.deepEqual(
                res.body.data.match,
                {
                    skills: true,
                }
            );
        }
    );

    // getBookmarks
    test(
        "getBookmarks - should return 400 when userId is missing",
        async () => {

            const req = {
                query: {},
            };

            const res = createMockResponse();

            await getBookmarks(req, res);

            assert.equal(res.statusCode, 400);

            assert.equal(
                res.body.success,
                false
            );

            assert.equal(
                res.body.error,
                "User id is required"
            );
        }
    );


    test(
        "getBookmarks - should return empty data when user has no bookmarks",
        async () => {

            mockBookmark.find = () => ({
                sort: async () => [],
            });


            const req = {
                query: {
                    userId: "user123",
                },
            };

            const res = createMockResponse();

            await getBookmarks(req, res);

            assert.equal(res.statusCode, 200);

            assert.equal(
                res.body.success,
                true
            );

            assert.equal(
                res.body.total,
                0
            );

            assert.deepEqual(
                res.body.data,
                []
            );
        }
    );


    test(
        "getBookmarks - should return government bookmark data",
        async () => {

            mockBookmark.find = () => ({
                sort: async () => [
                    {
                        _id: "bookmark123",
                        userId: "user123",
                        source: "government",
                        projectId: "project123",
                        savedFrom: "market",
                        match: null,
                        createdAt: new Date(),
                    },
                ],
            });


            const req = {
                query: {
                    userId: "user123",
                },
            };

            const res = createMockResponse();

            await getBookmarks(req, res);

            assert.equal(res.statusCode, 200);

            assert.equal(
                res.body.success,
                true
            );

            assert.equal(
                res.body.total,
                1
            );

            assert.equal(
                res.body.data[0].source,
                "government"
            );

            assert.equal(
                res.body.data[0].projectId,
                "project123"
            );

            assert.equal(
                res.body.data[0].projectName,
                "Test Government Project"
            );

            assert.equal(
                res.body.data[0].agencyName,
                "Test Department"
            );

            assert.equal(
                res.body.data[0].budget,
                1000000
            );

            assert.equal(
                res.body.data[0].status,
                "Active"
            );

            assert.equal(
                res.body.data[0].savedFrom,
                "market"
            );
        }
    );


    test(
        "getBookmarks - should return internal TOR bookmark data",
        async () => {

            mockBookmark.find = () => ({
                sort: async () => [
                    {
                        _id: "bookmark123",
                        userId: "user123",
                        source: "internal",
                        torId: "tor123",
                        savedFrom: "matching",
                        match: {
                            skills: true,
                        },
                        createdAt: new Date(),
                    },
                ],
            });


            const req = {
                query: {
                    userId: "user123",
                },
            };

            const res = createMockResponse();

            await getBookmarks(req, res);

            assert.equal(res.statusCode, 200);

            assert.equal(
                res.body.success,
                true
            );

            assert.equal(
                res.body.total,
                1
            );

            assert.equal(
                res.body.data[0].source,
                "internal"
            );

            assert.equal(
                res.body.data[0].torId,
                "tor123"
            );

            assert.equal(
                res.body.data[0].projectName,
                "Test Internal TOR"
            );

            assert.equal(
                res.body.data[0].agencyName,
                "Test Agency"
            );

            assert.equal(
                res.body.data[0].budget,
                500000
            );

            assert.equal(
                res.body.data[0].status,
                "published"
            );

            assert.deepEqual(
                res.body.data[0].match,
                {
                    skills: true,
                }
            );

            assert.equal(
                res.body.data[0].savedFrom,
                "matching"
            );
        }
    );

    // deleteBookmark
    test(
        "deleteBookmark - should return 400 when userId is missing",
        async () => {

            const req = {
                params: {
                    projectId: "project123",
                },
            };

            const res = createMockResponse();

            await deleteBookmark(req, res);

            assert.equal(res.statusCode, 400);

            assert.equal(
                res.body.success,
                false
            );

            assert.equal(
                res.body.error,
                "User id is required"
            );
        }
    );


    test(
        "deleteBookmark - should return 404 when bookmark does not exist",
        async () => {

            mockBookmark.findOneAndDelete = async () =>
                null;


            const req = {
                params: {
                    userId: "user123",
                    projectId: "project123",
                },
            };

            const res = createMockResponse();

            await deleteBookmark(req, res);

            assert.equal(res.statusCode, 404);

            assert.equal(
                res.body.success,
                false
            );

            assert.equal(
                res.body.error,
                "Bookmark not found"
            );
        }
    );


    test(
        "deleteBookmark - should delete bookmark successfully",
        async () => {

            mockBookmark.findOneAndDelete = async () => ({
                _id: "bookmark123",
                userId: "user123",
                source: "government",
                projectId: "project123",
            });


            const req = {
                params: {
                    userId: "user123",
                    projectId: "project123",
                },
            };

            const res = createMockResponse();

            await deleteBookmark(req, res);

            assert.equal(res.statusCode, 200);

            assert.equal(
                res.body.success,
                true
            );

            assert.equal(
                res.body.message,
                "Bookmark removed successfully"
            );

            assert.equal(
                res.body.data.projectId,
                "project123"
            );
        }
    );

});
