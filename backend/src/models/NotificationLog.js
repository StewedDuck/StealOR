const mongoose = require("mongoose");

const notificationLogSchema = new mongoose.Schema(
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
        },

        projectId: {
            type: String,
            default: null,
        },

        torId: {
            type: String,
            default: null,
        },

        type: {
            type: String,
            enum: [
                "deadline_5_days",
                "deadline_1_day",
                "draft_updated",
            ],
            required: true,
        },

        title: {
            type: String,
            required: true,
        },

        message: {
            type: String,
            default: "",
        },

        read: {
            type: Boolean,
            default: false,
        },

        sentAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

notificationLogSchema.index(
    {
        userId: 1,
        source: 1,
        projectId: 1,
        torId: 1,
        type: 1,
    },
    {
        unique: true,
    }
);

module.exports = mongoose.model(
    "NotificationLog",
    notificationLogSchema
);