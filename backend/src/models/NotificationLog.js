const mongoose = require("mongoose");

const notificationLogSchema = new mongoose.Schema(
    {
        eventKey: { type: String, default: null },
        userId: {
            type: String,
            required: true,
            index: true,
        },

        source: {
            type: String,
            enum: ["government", "internal", "verification"],
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
                "saved_tor_updated",
                "new_matching",
                "owner_draft_ready",
                "owner_deadline_3_days",
                "owner_deadline_today",

                "identity_verification_requested",
                "identity_verification_approved",
                "identity_verification_rejected"
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

        verificationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "IdentityVerification",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Government / Internal TOR notifications
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
        partialFilterExpression: {
            source: { $in: ["government", "internal"] },
        },
    }
);

// Verification notifications
notificationLogSchema.index(
    {
        userId: 1,
        verificationId: 1,
        type: 1,
    },
    {
        unique: true,
        partialFilterExpression: {
            source: "verification",
            verificationId: { $type: "objectId" },
        },
    }
);

module.exports = mongoose.model(
    "NotificationLog",
    notificationLogSchema
);