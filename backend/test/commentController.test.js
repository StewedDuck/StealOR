const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const mockComment = {
    find: () => ({
        sort: () => ({
            lean: async () => [],
        }),
    }),

    create: async (data) => ({
        _id: "comment123",
        ...data,
    }),

    findOne: async () => null,

    deleteOne: async () => ({
        deletedCount: 1,
    }),
};


// Mock Comment model
const Module = require("module");
const originalRequire = Module.prototype.require;

Module.prototype.require = function (path) {

    if (path === "../models/Comment") {
        return mockComment;
    }

    return originalRequire.apply(this, arguments);
};

const {
    getComments,
    createComment,
    deleteComment,
} = require("../src/controllers/commentController");

Module.prototype.require = originalRequire;


// Helper
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


describe("Comment Controller", () => {

    beforeEach(() => {

        mockComment.find = () => ({
            sort: () => ({
                lean: async () => [],
            }),
        });

        mockComment.create = async (data) => ({
            _id: "comment123",
            ...data,
        });

        mockComment.findOne = async () => null;

        mockComment.deleteOne = async () => ({
            deletedCount: 1,
        });
    });

    // getComments
    test("getComments - should return 400 when projectId is missing", async () => {

        const req = {
            params: {},
        };

        const res = createMockResponse();

        await getComments(req, res);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.success, false);
        assert.equal(
            res.body.error,
            "projectId is required"
        );
    });


    test("getComments - should return empty comments successfully", async () => {

        const req = {
            params: {
                projectId: "project123",
            },
        };

        const res = createMockResponse();

        await getComments(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.deepEqual(res.body.data, []);
    });


    test("getComments - should return comments for a project", async () => {

        const comments = [
            {
                _id: "comment1",
                userId: "user1",
                userName: "Alice",
                projectId: "project123",
                content: "This TOR looks good",
            },
            {
                _id: "comment2",
                userId: "user2",
                userName: "Bob",
                projectId: "project123",
                content: "I am interested",
            },
        ];

        mockComment.find = () => ({
            sort: () => ({
                lean: async () => comments,
            }),
        });

        const req = {
            params: {
                projectId: "project123",
            },
        };

        const res = createMockResponse();

        await getComments(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);

        assert.equal(res.body.data.length, 2);
        assert.equal(
            res.body.data[0].projectId,
            "project123"
        );
        assert.equal(
            res.body.data[0].content,
            "This TOR looks good"
        );
    });

    // createComment
    test("createComment - should return 400 when required data is missing", async () => {

        const req = {
            body: {
                userId: "user123",
                userName: "Alice",
                projectId: "project123",
            },
        };

        const res = createMockResponse();

        await createComment(req, res);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.success, false);
        assert.equal(
            res.body.error,
            "กรุณากรอกข้อมูลความคิดเห็นให้ครบ"
        );
    });


    test("createComment - should return 400 when content contains only spaces", async () => {

        const req = {
            body: {
                userId: "user123",
                userName: "Alice",
                projectId: "project123",
                content: "     ",
            },
        };

        const res = createMockResponse();

        await createComment(req, res);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.success, false);
    });


    test("createComment - should create comment successfully", async () => {

        const req = {
            body: {
                userId: "user123",
                userName: "Alice",
                projectId: "project123",
                content: "  This TOR looks interesting  ",
            },
        };

        const res = createMockResponse();

        await createComment(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(res.body.success, true);

        assert.equal(
            res.body.data.userId,
            "user123"
        );

        assert.equal(
            res.body.data.userName,
            "Alice"
        );

        assert.equal(
            res.body.data.projectId,
            "project123"
        );

        // Controller use trim()
        assert.equal(
            res.body.data.content,
            "This TOR looks interesting"
        );
    });

    // deleteComment
    test("deleteComment - should return 400 when commentId is missing", async () => {

        const req = {
            params: {},
            body: {
                userId: "user123",
            },
        };

        const res = createMockResponse();

        await deleteComment(req, res);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.success, false);
        assert.equal(
            res.body.error,
            "commentId and userId are required"
        );
    });


    test("deleteComment - should return 400 when userId is missing", async () => {

        const req = {
            params: {
                commentId: "comment123",
            },
            body: {},
        };

        const res = createMockResponse();

        await deleteComment(req, res);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.success, false);
    });


    test("deleteComment - should return 404 when comment does not exist or user has no permission", async () => {

        mockComment.findOne = async () => null;

        const req = {
            params: {
                commentId: "comment123",
            },
            body: {
                userId: "wrongUser",
            },
        };

        const res = createMockResponse();

        await deleteComment(req, res);

        assert.equal(res.statusCode, 404);
        assert.equal(res.body.success, false);
        assert.equal(
            res.body.error,
            "ไม่พบความคิดเห็นหรือไม่มีสิทธิ์ลบ"
        );
    });


    test("deleteComment - should delete comment successfully", async () => {

        mockComment.findOne = async () => ({
            _id: "comment123",
            userId: "user123",
        });

        const req = {
            params: {
                commentId: "comment123",
            },
            body: {
                userId: "user123",
            },
        };

        const res = createMockResponse();

        await deleteComment(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);

        assert.equal(
            res.body.data.commentId,
            "comment123"
        );
    });

});
