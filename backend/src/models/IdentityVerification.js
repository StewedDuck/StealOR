const mongoose = require("mongoose");

const identityVerificationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        citizenId: {
            type: String,
            required: true,
            trim: true,
        },

        laserCode: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },

        phone: {
            type: String,
            required: true,
            trim: true,
        },

        document: {
            fileName: {
                type: String,
                required: true,
            },

            storedFileName: {
                type: String,
                required: true,
            },

            filePath: {
                type: String,
                required: true,
            },

            mimeType: {
                type: String,
                required: true,
            },

            size: {
                type: Number,
                required: true,
            },
        },

        status: {
            type: String,
            enum: [
                "pending",
                "approved",
                "rejected",
            ],
            default: "pending",
            index: true,
        },

        rejectionReason: {
            type: String,
            default: null,
        },

        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        reviewedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model(
    "IdentityVerification",
    identityVerificationSchema
);