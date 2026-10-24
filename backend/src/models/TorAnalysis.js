
const mongoose = require("mongoose");

const analyzedRequirementSchema = new mongoose.Schema(
    {
        ownerRequirementIndex: { type: Number, default: null },
        text: {
            type: String,
            required: true,
            trim: true,
        },

        category: {
            type: String,
            enum: ["mandatory", "scored", "unclear", "not_applicable"],
            required: true,
        },

        requirementType: {
            type: String,
            enum: [
                "legal",
                "past_project",
                "team",
                "certification",
                "experience",
                "technical",
                "other",
            ],
            default: "other",
        },

        profileField: {
            type: String,
            default: null,
        },

        sourceText: {
            type: String,
            default: "",
        },

        reason: {
            type: String,
            default: "",
        },

        weight: {
            type: Number,
            default: null,
            min: 0,
            max: 100,
        },

        confidence: {
            type: Number,
            default: null,
            min: 0,
            max: 1,
        },
    },
    { 
        _id: true 
    }
);


const projectRelevanceSchema = new mongoose.Schema(
    {
        profileField: { type: String, default: null },
        requirementType: { type: String, default: 'other' },
        ownerRequirementIndex: { type: Number, default: null },
        text: {
            type: String,
            required: true,
            trim: true,
        },

        skillKeywords: {
            type: [String],
            default: [],
        },

        skillGroups: {
            type: [[String]],
            default: [],
        },

        profileFields: {
            type: [String],
            enum: [
                "skills",
                "projectTypes",
                "pastProjects.projectType",
                "pastProjects.projectName",
                "teamQualifications.skills",
                "experienceSummary",
                "profileSummary",
            ],
            default: [],
        },

        sourceText: {
            type: String,
            required: true,
            trim: true,
        },

        reason: {
            type: String,
            default: "",
            trim: true,
        },

        weight: {
            type: Number,
            default: null,
            min: 0,
            max: 100,
        },

        confidence: {
            type: Number,
            default: null,
            min: 0,
            max: 1,
        },
    },
    {
        _id: true,
    }
);


const torAnalysisSchema = new mongoose.Schema(
    {
        torSource: {
            type: String,
            enum: ["internal", "government"],
            required: true,
        },

        torId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },

        status: {
            type: String,
            enum: ["pending", "processing", "completed", "needs_review", "failed"],
            default: "pending",
        },

        requirements: {
            type: [analyzedRequirementSchema],
            default: [],
        },

        projectRelevance: {
            type: [projectRelevanceSchema],
            default: [],
        },

        relevanceStatus: {
            type: String,
            enum: ["ready", "needs_review", "not_available"],
            default: "not_available",
        },

        scoringStatus: {
            type: String,
            enum: ["ready", "needs_weights", "not_available"],
            default: "not_available",
        },

        pipelineState: { type: String, enum: ['waiting_data', 'pending', 'processing', 'ready', 'retry_wait', 'failed', 'not_available'], default: 'pending' },
        attemptedFingerprint: { type: String, default: '' },
        leaseToken: { type: String, default: null },
        leaseUntil: { type: Date, default: null },
        attemptCount: { type: Number, default: 0 },
        nextAttemptAt: { type: Date, default: null },
        analysisVersion: {
            type: String,
            default: "1.0",
        },

        sourceFingerprint: {
            type: String,
            default: "",
        },

        modelName: {
            type: String,
            default: "",
        },

        error: {
            type: String,
            default: null,
        },

        analyzedAt: {
            type: Date,
            default: null,
        },
    },
    { 
        timestamps: true 
    }
);

torAnalysisSchema.index(
    { torSource: 1, torId: 1 },
    { unique: true }
);

module.exports =  mongoose.models.TorAnalysis ||  mongoose.model("TorAnalysis", torAnalysisSchema);
