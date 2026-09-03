const mongoose = require("mongoose");

const requirementSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: true,
      trim: true,
    },
    weight: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    mandatory: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const torSchema = new mongoose.Schema(
  {
    ownerId: {
      type: String,
      required: true,
      index: true,
    },
    projectName: {
      type: String,
      required: true,
      trim: true,
    },
    agencyName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    objectives: {
      type: [String],
      default: [],
    },
    scopeOfWork: {
      type: [String],
      default: [],
    },
    requirements: {
      type: [requirementSchema],
      default: [],
    },
    budget: {
      type: Number,
      default: null,
      min: 0,
    },
    submissionDeadline: {
      type: Date,
      default: null,
    },
    contactName: {
      type: String,
      default: "",
    },
    contactEmail: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["draft", "pending_verification", "published"],
      default: "draft",
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.Tor || mongoose.model("Tor", torSchema);