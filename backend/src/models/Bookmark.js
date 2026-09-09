const mongoose = require("mongoose")

const bookmarkSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        source: {
            type: String,
            enum: ["government", "internal"],
            required: true,
            default: "government",
        },
        projectId: {
            type: String,
            default: null,
        },
        torId: {
            type: String,
            default: null,
        },
        savedFrom: {
            type: String,
            enum: ["market", "matching"],
            require: true,
            default: "market",
        },
        match: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);
bookmarkSchema.index(
    {userId: 1, source: 1, projectId: 1},
    {unique: true, sparse: true}
);

module.exports = mongoose.model("Bookmark", bookmarkSchema);
