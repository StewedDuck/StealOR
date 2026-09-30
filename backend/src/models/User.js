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

        phone: {
            type: String,
            default: "",
            trim: true,
        },
        
        company: {
            type: String,
            default: "",
            trim: true,
        },
        
        profileSummary: {
            type: String,
            default: "",
            trim: true,
            maxlength: 200,
        },
        
        experienceYears: {
            type: Number,
            default: 0,
            min: 0,
        },
        
        experienceSummary: {
            type: String,
            default: "",
            trim: true,
        },
        
        skills: {
            type: [String],
            default: [],
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
