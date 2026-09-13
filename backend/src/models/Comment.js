const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },

        userName: {
            type: String,
            required: true,
        },

        projectId: {
            type: String,
            required: true,
            index: true,
        },

        content: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },
    },
    {
        timestamps: true,
    }
);

commentSchema.index({ projectId: 1, createdAt: -1,});
module.exports = mongoose.model( "Comment", commentSchema);
