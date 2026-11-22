const mongoose = require("mongoose");
const RssDepartment = require("../models/RssDepartment");
const { runRssSyncOnce, getRssSyncStatus } = require("../services/egp/rssAutoSyncService");
const { logActivity } = require("../utils/logger");

exports.getDepartments = async (req, res) => {
  try {
    const departments = await RssDepartment.find().sort({ createdAt: -1 }).lean();
    return res.json({
      success: true,
      data: {
        departments,
        syncStatus: getRssSyncStatus(),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "ไม่สามารถโหลดรายการหน่วยงาน RSS ได้" });
  }
};

exports.addDepartment = async (req, res) => {
  try {
    const deptId = String(req.body.deptId || "").trim();
    const name = String(req.body.name || "").trim();

    if (!/^\d{4}$/.test(deptId)) {
      return res.status(400).json({ success: false, error: "รหัสหน่วยงาน (deptId) ต้องเป็นตัวเลข 4 หลัก เช่น 0706" });
    }
    if (!name) {
      return res.status(400).json({ success: false, error: "กรุณาระบุชื่อหน่วยงาน" });
    }

    const exists = await RssDepartment.findOne({ deptId });
    if (exists) {
      return res.status(409).json({ success: false, error: `รหัสหน่วยงาน ${deptId} มีอยู่ในระบบแล้ว` });
    }

    const dept = await RssDepartment.create({
      deptId,
      name,
      isActive: true,
      addedBy: req.adminEmail || "Admin",
    });

    await logActivity("system", req.adminEmail || "Admin", "เพิ่มหน่วยงาน RSS", `${dept.deptId} - ${dept.name}`);
    return res.status(201).json({ success: true, data: dept });
  } catch (error) {
    return res.status(500).json({ success: false, error: "ไม่สามารถเพิ่มหน่วยงานได้" });
  }
};

exports.updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: "Invalid department ID" });
    }

    const update = {};
    if (typeof req.body.isActive === "boolean") update.isActive = req.body.isActive;
    if (typeof req.body.name === "string" && req.body.name.trim()) update.name = req.body.name.trim();

    const dept = await RssDepartment.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!dept) return res.status(404).json({ success: false, error: "ไม่พบหน่วยงาน" });

    await logActivity(
      "system",
      req.adminEmail || "Admin",
      "อัปเดตหน่วยงาน RSS",
      `${dept.deptId} (${dept.name}) | สถานะ: ${dept.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}`
    );
    return res.json({ success: true, data: dept });
  } catch (error) {
    return res.status(500).json({ success: false, error: "ไม่สามารถอัปเดตหน่วยงานได้" });
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: "Invalid department ID" });
    }

    const dept = await RssDepartment.findByIdAndDelete(id);
    if (!dept) return res.status(404).json({ success: false, error: "ไม่พบหน่วยงาน" });

    await logActivity("system", req.adminEmail || "Admin", "ลบหน่วยงาน RSS", `${dept.deptId} - ${dept.name}`);
    return res.json({ success: true, data: { id } });
  } catch (error) {
    return res.status(500).json({ success: false, error: "ไม่สามารถลบหน่วยงานได้" });
  }
};

exports.triggerSyncNow = async (req, res) => {
  const status = getRssSyncStatus();
  if (status.isRunning) {
    return res.status(409).json({ success: false, error: "ระบบกำลังซิงค์ RSS อยู่ กรุณารอสักครู่" });
  }

  runRssSyncOnce(req.adminEmail || "Admin");
  return res.status(202).json({ success: true, message: "เริ่มซิงค์ข้อมูล RSS ในเบื้องหลังแล้ว" });
};