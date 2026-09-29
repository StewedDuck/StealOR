const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        image: {
            type: String,
            default: null,
        },

        accountRole: {
            type: String,
            enum: [
                "contractor",
                "project_owner",
                "admin",
            ],
            default: "contractor",
        },

        verificationStatus: {
            type: String,
            enum: [
                "not_required",
                "pending",
                "approved",
                "rejected",
            ],
            default: "not_required",
        },

        verificationReason: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("User", userSchema);
