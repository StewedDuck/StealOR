const mongoose = require("mongoose");
const Tor = require("../models/Tor");

// เอกสารเก่าที่ไม่มีเลขฉบับถือเป็นฉบับ 1; เงื่อนไขนี้ป้องกันการตัดสินทับการแก้ไขพร้อมกัน
function versionFilter(version) {
  return version === 1
    ? { $or: [{ contentVersion: 1 }, { contentVersion: { $exists: false } }] }
    : { contentVersion: version };
}

async function submitTorReview(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, error: "Invalid TOR id" });
    const current = await Tor.findOne({ _id: req.params.id, ownerId: req.ownerId, status: "draft" }).lean();
    if (!current) return res.status(404).json({ success: false, error: "ไม่พบ TOR ฉบับร่าง" });
    if (current.reviewStatus === "changes_requested") {
      return res.status(409).json({ success: false, error: "กรุณาแก้ไขและบันทึก TOR ก่อนส่งตรวจอีกครั้ง" });
    }
    const version = current.contentVersion ?? 1;
    // หลังถูกขอแก้ไข ต้องบันทึกเนื้อหาที่เปลี่ยนก่อน จึงกลับเป็น not_submitted และส่งใหม่ได้
    const tor = await Tor.findOneAndUpdate({
      _id: current._id, ownerId: req.ownerId, status: "draft",
      $and: [versionFilter(version), { $or: [
        { reviewStatus: { $in: ["not_submitted"] } },
        { reviewStatus: { $exists: false } },
      ] }],
    }, { $set: { reviewStatus: "pending", contentVersion: version, submittedVersion: version, submittedForReviewAt: new Date() } }, { new: true, runValidators: true });
    if (!tor) return res.status(409).json({ success: false, error: "TOR เปลี่ยนแปลงหรือส่งตรวจแล้ว กรุณาโหลดใหม่" });
    return res.json({ success: true, data: tor });
  } catch (error) {
    console.error("Submit TOR review error:", error);
    return res.status(500).json({ success: false, error: "ไม่สามารถส่งตรวจ TOR ได้" });
  }
}

async function reviewTor(req, res) {
  try {
    const { decision, comment = "", version } = req.body;
    if (!mongoose.isValidObjectId(req.params.id) || !["approved", "changes_requested"].includes(decision) ||
        !Number.isSafeInteger(version) || version < 1 || typeof comment !== "string" || comment.trim().length > 5000 ||
        (decision === "changes_requested" && !comment.trim())) {
      return res.status(400).json({ success: false, error: "ข้อมูลการตรวจไม่ถูกต้อง หรือยังไม่ได้ระบุเหตุผลที่ขอแก้ไข" });
    }
    // ตรวจเฉพาะฉบับที่แอดมินเปิดอ่าน และบันทึกผลกับประวัติในคำสั่งเดียว
    const tor = await Tor.findOneAndUpdate({
      _id: req.params.id, status: "draft", reviewStatus: "pending",
      contentVersion: version, submittedVersion: version,
    }, {
      $set: { reviewStatus: decision },
      $push: { reviewHistory: { decision, comment: comment.trim(), reviewedBy: req.adminEmail, reviewedAt: new Date(), version } },
    }, { new: true, runValidators: true });
    if (!tor) return res.status(409).json({ success: false, error: "TOR ไม่ได้รอตรวจหรือเลขฉบับเปลี่ยน กรุณาโหลดใหม่" });
    return res.json({ success: true, data: tor });
  } catch (error) {
    console.error("Review TOR error:", error);
    return res.status(500).json({ success: false, error: "ไม่สามารถบันทึกผลตรวจ TOR ได้" });
  }
}

module.exports = { submitTorReview, reviewTor, versionFilter };
