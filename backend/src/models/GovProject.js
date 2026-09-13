const mongoose = require('mongoose');

const documentExtractionSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'processing', 'text_extracted', 'failed'],
      default: 'pending',
    },
    attemptCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    extractedAt: { type: Date, default: null },
    error: { type: String, default: null },
    source: { type: String, default: 'egp' },
    sourceDocumentType: { type: String, default: 'price_estimate' },
    sourceDocument: { type: String, default: null },
    sourceFileId: { type: String, default: null },
    sourceSha256: { type: String, default: null },
    pdfFileNames: { type: [String], default: [] },
    textLength: { type: Number, default: 0 },
    extractedText: { type: String, default: '' },
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
    documentExtraction: { type: documentExtractionSchema, default: () => ({}) },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GovProject', govProjectSchema);
