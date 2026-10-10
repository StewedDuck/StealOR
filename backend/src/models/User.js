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

        contractorType: {
            type: String,
            enum: ["individual", "company", "freelance_team"],
            default: "individual"
        },

        occupation:{
            type: String,
            default: "",
            trim: true,
        },

        teamSize: {
            type: Number,
            default: 1,
            min: 1,
        },


        projectTypes: {
            type: [String],
            default: [],
        },

        serviceAreas: {
            type: [String],
            default: [],
        },
        
        workModes: {
            type: [String],
            enum: ["onsite", "remote", "hybrid"],
            default: [],
        },

        certifications: {
            type: [String],
            default: [],
        },

        minProjectBudget: {
            type: Number,
            default: null,
            min: 0,
        },
        
        maxProjectBudget: {
            type: Number,
            default: null,
            min: 0,
        },

        availableFrom: {
            type: Date,
            default: null,
        },
        
        preferredProjectDuration: {
            type: String,
            default: "",
        },

        additionalInfo: {
            type: String,
            default: "",
            trim: true,
            maxlength: 2000,
        },

        registeredCapital: {
            type: Number,
            default: null,
            min: 0,
        },
        
        maxPastProjectValue: {
            type: Number,
            default: null,
            min: 0,
        },
        
        hasGovernmentExperience: {
            type: Boolean,
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

        isActive: {
            type: Boolean,
            default: true,
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
