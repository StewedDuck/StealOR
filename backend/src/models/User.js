const mongoose = require('mongoose');

const pastProjectSchema = new mongoose.Schema(
    {
        projectName: { 
            type: String, 
            required: true, 
            trim: true 
        },

        projectType: { 
            type: String, 
            default: "", 
            trim: true 
        },

        projectValue: { 
            type: Number, 
            default: null, 
            min: 0 
        },

        durationMonths: { 
            type: Number, 
            default: null, 
            min: 0 
        },

        clientName: { 
            type: String, 
            default: "", 
            trim: true 
        },

        completedAt: { 
            type: Date, 
            default: null 
        },

        evidenceUrl: { 
            type: String, 
            default: "", 
            trim: true 
        },
    }, 
    { 
        _id: false 
    }
);
    
const certificationDetailSchema = new mongoose.Schema(
    {
        name: { 
            type: String, 
            required: true, 
            trim: true 
        },

        holderType: {
        type: String,
        enum: ["company", "individual"],
        default: "individual",
        },

        holderName: { 
            type: String, 
            default: "", 
            trim: true 
        },

        issuedAt: { 
            type: Date, 
            default: null 
        },

        expiresAt: { 
            type: Date, 
            default: null 
        },

        evidenceUrl: { 
            type: String, 
            default: "", 
            trim: true 
        },
    }, 
    { 
        _id: false 
    }
);
    
const teamQualificationSchema = new mongoose.Schema(
    {
        role: { 
            type: String, 
            required: true, 
            trim: true 
        },

        memberCount: { 
            type: Number, 
            required: true, 
            min: 1 
        },

        experienceYears: { 
            type: Number, 
            default: 0, 
            min: 0 
        },

        educationLevel: {
            type: String,
            enum: [
              "unspecified",
              "vocational",
              "diploma",
              "bachelor",
              "master",
              "doctorate",
            ],
            default: "unspecified",
        },

        skills: { 
            type: [String], 
            default: [] 
        },
    },
    {
         _id: false 
    }
);
    
const legalEligibilitySchema = new mongoose.Schema(
    {
        registrationNumber: { 
            type: String, 
            default: "", 
            trim: true 
        },

        bankruptcyStatus: {
            type: String,
            enum: ["no", "yes", "unknown"],
            default: "unknown",
        },

        debarmentStatus: {
            type: String,
            enum: ["no", "yes", "unknown"],
            default: "unknown",
        },
        
        evidenceUrl: { 
            type: String, 
            default: "", 
            trim: true 
        },
    }, { 
        _id: false 
    }
);
  

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

        pastProjects: {
            type: [pastProjectSchema],
            default: [],
        },

        certificationDetails: {
            type: [certificationDetailSchema],
            default: [],
        },

        legalEligibility: {
            type: legalEligibilitySchema,
            default: () => ({}),
        },

        teamQualifications: {
            type: [teamQualificationSchema],
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
