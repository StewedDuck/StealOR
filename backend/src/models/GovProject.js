const mongoose = require("mongoose");

const documentLookupAttemptSchema = new mongoose.Schema(
  {
    lookupMethod: { type: String, default: null },
    outcome: { type: String, default: null },
    code: { type: String, default: null },
    kind: { type: String, default: null },
  },
  { _id: false }
);

const documentCandidateSchema = new mongoose.Schema(
  {
    fileId: { type: String, default: null },
    fileName: { type: String, default: null },
    revision: { type: Number, default: null },
    lookupMethod: { type: String, default: null },
  },
  { _id: false }
);

const documentErrorSchema = new mongoose.Schema(
  {
    code: { type: String, default: null },
    kind: { type: String, default: null },
    message: { type: String, default: null },
  },
  { _id: false }
);

const documentReferenceSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["not_checked", "available", "not_found", "ambiguous", "error"],
      default: "not_checked",
    },
    source: { type: String, default: null },
    lookupMethod: { type: String, default: null },
    downloadMethod: { type: String, default: null },
    fileId: { type: String, default: null },
    fileName: { type: String, default: null },
    downloadUrl: { type: String, default: null },
    sha256: { type: String, default: null },
    publishedAt: { type: Date, default: null },
    lastCheckedAt: { type: Date, default: null },
    revision: { type: Number, default: null },
    version: { type: String, default: null },
    candidateCount: { type: Number, default: null },
    announcementTemplateId: { type: String, default: null },
    ambiguityReason: { type: String, default: null },
    error: { type: documentErrorSchema, default: null },
    lookupAttempts: { type: [documentLookupAttemptSchema], default: undefined },
    candidates: { type: [documentCandidateSchema], default: undefined },
  },
  { _id: false }
);

const documentsSchema = new mongoose.Schema(
  {
    priceEstimate: { type: documentReferenceSchema, default: () => ({}) },
    invitation: { type: documentReferenceSchema, default: () => ({}) },
    draftEbidding: { type: documentReferenceSchema, default: () => ({}) },
    selectedProcurementDocument: {
      type: String,
      enum: ["invitation", "draftEbidding", null],
      default: null,
    },
  },
  { _id: false }
);

const documentExtractionSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "processing", "text_extracted", "failed"],
      default: "pending",
    },
    attemptCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    extractedAt: { type: Date, default: null },
    error: { type: String, default: null },
    source: { type: String, default: "egp" },
    sourceDocumentType: { type: String, default: "price_estimate" },
    sourceDocument: { type: String, default: null },
    sourceFileId: { type: String, default: null },
    sourceSha256: { type: String, default: null },
    pdfFileNames: { type: [String], default: [] },
    textLength: { type: Number, default: 0 },
    extractedText: { type: String, default: "" },
  },
  { _id: false }
);

const govProjectSchema = new mongoose.Schema(
  {
    project_id: { type: String, required: true, unique: true },
    project_name: { type: String, required: true },
    dept_name: { type: String },
    dept_code: { type: String },
    budget_amount: { type: Number },
    sum_price_agree: { type: Number },
    winner_tin: { type: String },
    winner_name: { type: String },
    contract_status: { type: String },
    raw_data: { type: Object }, // Optional: stores raw DGA response payload
    documents: { type: documentsSchema, default: () => ({}) },
    // Keep the legacy extraction structure until migration verification and a
    // separately approved cleanup. Existing download code still reads it.
    documentExtraction: { type: documentExtractionSchema, default: () => ({}) },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GovProject", govProjectSchema);
