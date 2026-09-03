const mongoose = require("mongoose");
const Tor = require("../models/Tor");

const DEMO_OWNER_ID = "demo-project-owner";
const EDITABLE_FIELDS = [
  "projectName", "agencyName", "description", "objectives", "scopeOfWork",
  "requirements", "budget", "submissionDeadline", "contactName", "contactEmail",
];

function prepareTorData(body) {
  const data = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  if (Array.isArray(data.objectives)) {
    data.objectives = data.objectives.map((item) => String(item).trim()).filter(Boolean);
  }
  if (Array.isArray(data.scopeOfWork)) {
    data.scopeOfWork = data.scopeOfWork.map((item) => String(item).trim()).filter(Boolean);
  }
  if (Array.isArray(data.requirements)) {
    data.requirements = data.requirements
      .filter((item) => item && String(item.description || "").trim())
      .map((item) => ({
        description: String(item.description).trim(),
        weight: Number(item.weight) || 0,
        mandatory: Boolean(item.mandatory),
      }));
  }
  if (data.submissionDeadline === "") data.submissionDeadline = null;
  if (data.budget === "") data.budget = null;
  return data;
}

function handleError(res, error) {
  if (error instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ success: false, error: error.message });
  }
  console.error("TOR API error:", error);
  return res.status(500).json({ success: false, error: "Internal server error" });
}

async function createTor(req, res) {
  try {
    const tor = await Tor.create({
      ...prepareTorData(req.body),
      ownerId: DEMO_OWNER_ID,
      status: "draft",
    });
    return res.status(201).json({ success: true, data: tor, message: "TOR draft created successfully" });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getTors(req, res) {
  try {
    const query = { ownerId: DEMO_OWNER_ID };
    if (req.query.status) query.status = req.query.status;
    const tors = await Tor.find(query).sort({ updatedAt: -1 });
    return res.json({ success: true, data: tors, message: "TORs retrieved successfully" });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getTorById(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: "Invalid TOR id" });
    }
    const tor = await Tor.findOne({ _id: req.params.id, ownerId: DEMO_OWNER_ID });
    if (!tor) return res.status(404).json({ success: false, error: "TOR not found" });
    return res.json({ success: true, data: tor, message: "TOR retrieved successfully" });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateTor(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: "Invalid TOR id" });
    }
    const tor = await Tor.findOneAndUpdate(
      { _id: req.params.id, ownerId: DEMO_OWNER_ID, status: "draft" },
      { $set: prepareTorData(req.body) },
      { new: true, runValidators: true }
    );
    if (!tor) return res.status(404).json({ success: false, error: "Draft TOR not found" });
    return res.json({ success: true, data: tor, message: "TOR draft updated successfully" });
  } catch (error) {
    return handleError(res, error);
  }
}

async function deleteTor(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: "Invalid TOR id" });
    }
    const tor = await Tor.findOneAndDelete({
      _id: req.params.id,
      ownerId: DEMO_OWNER_ID,
      status: "draft",
    });
    if (!tor) return res.status(404).json({ success: false, error: "Draft TOR not found" });
    return res.json({ success: true, data: { id: tor.id }, message: "TOR draft deleted successfully" });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = { createTor, getTors, getTorById, updateTor, deleteTor };
