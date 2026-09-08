const mongoose = require('mongoose');

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
    raw_data: { type: Object } // Optional: stores raw DGA response payload
  },
  { timestamps: true }
);

module.exports = mongoose.model('GovProject', govProjectSchema);