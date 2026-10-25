const mongoose = require("mongoose");

const requirementSchema = new mongoose.Schema(
  {
    // แต่ละข้อเลือกหมวดได้ โดยใช้ช่องweightและข้อบังคับร่วมกัน
    category: {
      type: String,
      enum: ["generalLegal", "projectSpecific", "technicalRequirements", "deliverables"],
      default: "projectSpecific",
    },
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

// ประวัติการตัดสินของแอดมินแยกจากความคิดเห็นผู้รับจ้าง และระบุฉบับที่ตรวจ
const reviewHistorySchema = new mongoose.Schema({
  decision: { type: String, enum: ["approved", "changes_requested"], required: true },
  comment: { type: String, trim: true, default: "", maxlength: 5000 },
  reviewedBy: { type: String, required: true },
  reviewedAt: { type: Date, default: Date.now },
  version: { type: Number, required: true, min: 1 },
}, { _id: false });

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
    referencePriceEstimate: {
      type: Number,
      default: null,
      min: 0,
      validate: { validator: value => value == null || Number.isFinite(value), message: 'ราคากลางต้องเป็นตัวเลขที่ถูกต้อง' },
    },
    submissionDeadline: {
      type: Date,
      default: null,
    },
    applicationDeadline: {
      type: Date,
      default: null,
    },
    publishedAt: {
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
    // สถานะตรวจ TOR แยกจากสถานะเผยแพร่และการยืนยันตัวตนของบัญชี
    // ขั้นแรกเพิ่มเฉพาะโครงสร้างข้อมูล ยังไม่เปลี่ยนเงื่อนไขการเผยแพร่
    reviewStatus: {
      type: String,
      enum: ["not_submitted", "pending", "changes_requested", "approved"],
      default: "not_submitted",
    },
    // ขั้นตอน API ถัดไปจะเพิ่ม version เมื่อแก้เนื้อหา และอนุมัติเฉพาะ version ที่ส่งตรวจ
    contentVersion: { type: Number, default: 1, min: 1 },
    submittedVersion: { type: Number, default: null, min: 1 },
    submittedForReviewAt: { type: Date, default: null },
    reviewHistory: { type: [reviewHistorySchema], default: [] },
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
