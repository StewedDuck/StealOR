const mongoose = require("mongoose");
const Tor = require("../models/Tor");
const Bookmark = require("../models/Bookmark");
const User = require("../models/User");


// const DEMO_OWNER_ID = "demo-project-owner";
const EDITABLE_FIELDS = [
  "projectName", "agencyName", "description", "objectives", "scopeOfWork",
  "referencePriceEstimate",
  "requirements", "budget", "submissionDeadline", "contactName", "contactEmail",
];
const GovProject = require("../models/GovProject");

// รับเฉพาะfieldที่เจ้าของแก้ได้ และจัดรูปแบบรายการก่อนบันทึกทั้งตอนสร้างและแก้ไข
function prepareTorData(body) {
  const data = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  if (data.referencePriceEstimate === "") data.referencePriceEstimate = null;
  if (data.referencePriceEstimate != null &&
      (typeof data.referencePriceEstimate !== "number" || !Number.isFinite(data.referencePriceEstimate) || data.referencePriceEstimate < 0)) {
    const error = new Error("ราคากลางต้องเป็นตัวเลขตั้งแต่ศูนย์ขึ้นไป");
    error.status = 400;
    throw error;
  }
  if (Array.isArray(data.objectives)) {
    data.objectives = data.objectives.map((item) => String(item).trim()).filter(Boolean);
  }
  if (Array.isArray(data.scopeOfWork)) {
    data.scopeOfWork = data.scopeOfWork.map((item) => String(item).trim()).filter(Boolean);
  }
  const categories = ["generalLegal", "projectSpecific", "technicalRequirements", "deliverables"];
  const invalidRequirement = () => {
    const error = new Error("หมวดหมู่ รายละเอียด น้ำหนัก หรือข้อบังคับของรายการไม่ถูกต้อง");
    error.status = 400;
    throw error;
  };
  if (data.requirements !== undefined) {
    if (!Array.isArray(data.requirements)) invalidRequirement();
    data.requirements = data.requirements.map((item) => {
      if (!item || typeof item.description !== "string" ||
          !categories.includes(item.category ?? "projectSpecific") ||
          (item.weight !== undefined && (typeof item.weight !== "number" || !Number.isFinite(item.weight) || item.weight < 0 || item.weight > 100)) ||
          (item.mandatory !== undefined && typeof item.mandatory !== "boolean")) invalidRequirement();
      return {
        category: item.category ?? "projectSpecific",
        description: item.description.trim(),
        weight: item.weight ?? 0,
        mandatory: item.mandatory ?? false,
      };
    }).filter((item) => item.description);
  }
  if (data.submissionDeadline === "") data.submissionDeadline = null;
  if (data.budget === "") data.budget = null;
  return data;
}

// ส่งข้อผิดพลาดข้อมูลจากฟอร์มเป็น 400 แทนข้อผิดพลาดภายในระบบ
function handleError(res, error) {
  if (error.status === 400 || error.code === 'INVALID_OWNER_CRITERIA') {
    return res.status(400).json({ success: false, error: error.message });
  }
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
      ownerId: req.ownerId,
      status: "draft",
    });
    return res.status(201).json({ success: true, data: tor, message: "TOR draft created successfully" });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getTors(req, res) {
  try {
    const query = { ownerId: req.ownerId };
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
    const tor = await Tor.findOne({ _id: req.params.id, ownerId: req.ownerId });
    if (!tor) return res.status(404).json({ success: false, error: "TOR not found" });
    return res.json({ success: true, data: tor, message: "TOR retrieved successfully" });
  } catch (error) {
    return handleError(res, error);
  }
}

async function notifyDraftUpdated(tor) {
  // The same detector handles government imports and internal edits, with one deduplication policy.
  try { await require('../services/notifications/savedTorUpdateService').checkSavedTorUpdates({ source: 'internal', torId: String(tor._id) }); }
  catch { console.warn('[NOTIFICATION] Saved TOR update notification deferred'); }
}

async function updateTor(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: "Invalid TOR id" });
    }
    const current = await Tor.findOne({ _id: req.params.id, ownerId: req.ownerId, status: "draft" }).lean();
    if (!current) return res.status(404).json({ success: false, error: "Draft TOR not found" });
    if (current.reviewStatus === "pending") {
      return res.status(409).json({ success: false, error: "TOR อยู่ระหว่างตรวจสอบ ยังแก้ไขไม่ได้" });
    }
    const data = prepareTorData(req.body);
    // กดบันทึกโดยไม่เปลี่ยนเนื้อหาไม่นับเป็นฉบับใหม่ และไม่ปลดล็อกการส่งซ้ำหลังขอแก้ไข
    const comparable = (key, value) => key === "submissionDeadline"
      ? (value ? new Date(value).getTime() : null)
      : JSON.stringify(value);
    const changed = Object.keys(data).some(key => comparable(key, data[key]) !== comparable(key, current[key]));
    if (!changed) return res.json({ success: true, data: current, message: "ไม่มีการเปลี่ยนแปลงเนื้อหา" });
    const version = current.contentVersion ?? 1;
    // แก้ร่างที่อนุมัติแล้วต้องส่งตรวจใหม่ และเก็บประวัติการตรวจเดิมไว้
    // ตรวจ version และสถานะพร้อมกัน ป้องกันการแก้ไขชนกับการส่งตรวจ/เผยแพร่
    const tor = await Tor.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.ownerId, status: "draft",
        reviewStatus: { $ne: "pending" },
        ...require("./torReviewController").versionFilter(version) },
      { $set: { ...data, contentVersion: version + 1,
        reviewStatus: "not_submitted", submittedVersion: null, submittedForReviewAt: null } },
      { new: true, runValidators: true }
    );
    if (!tor) {
      return res.status(409).json({ 
        success: false, 
        error: "TOR เปลี่ยนแปลงระหว่างแก้ไข กรุณาโหลดใหม่" 
      })
    };
    await notifyDraftUpdated(tor);

    return res.json({ 
      success: true, 
      data: tor, 
      message: "TOR draft updated successfully" 
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function deleteTor(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid TOR id",
      });
    }

    const tor = await Tor.findOneAndDelete({
      _id: id,
      ownerId: req.ownerId,
      status: { $in: ["draft", "published"] },
    });

    if (!tor) {
      return res.status(404).json({
        success: false,
        error: "ไม่พบ TOR ที่สามารถลบได้",
      });
    }
    // del. Bookmark the link with TOR
    await Bookmark.deleteMany({
      source: "internal",
      torId: id,
    });

    return res.json({
      success: true,
      data: { id },
      message: "ลบ TOR สำเร็จ",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getMarketTors(req, res) {
  try {
    const [governmentTors, internalTors] = await Promise.all([
      GovProject.find({ contract_status: { $not: /ยกเลิก|สิ้นสุด/ } })
        .select('project_id project_name dept_name budget_amount contract_status winner_name winner_tin createdAt updatedAt procurementAnalysis.allocatedBudget procurementAnalysis.referencePriceEstimate procurementAnalysis.projectDetails procurementAnalysis.biddingClosingDate raw_data.project_description raw_data.submission_deadline raw_data.deadline')
        .sort({ updatedAt: -1 }).lean(),
      Tor.find({ status: 'published', applicationDeadline: { $gt: new Date() } })
        .select('projectName agencyName budget referencePriceEstimate applicationDeadline description createdAt updatedAt')
        .sort({ publishedAt: -1 }).lean(),
    ]);

    const data = governmentTors.map((project) => ({
      id: project._id.toString(),
      source: "government",

      projectId: project.project_id,
      projectName: project.project_name,
      agencyName: project.dept_name,

      budget:
        project.procurementAnalysis?.allocatedBudget?.amount > 0
          ? project.procurementAnalysis.allocatedBudget.amount
          : project.budget_amount > 0
            ? project.budget_amount
            : null,

      description:
        project.procurementAnalysis?.projectDetails ||
        project.raw_data?.project_description ||
        "",
          
      deadline:
        project.procurementAnalysis?.biddingClosingDate?.dateTime ||
        project.raw_data?.submission_deadline ||
        project.raw_data?.deadline ||
        null,

      allocatedBudget:
        project.procurementAnalysis?.allocatedBudget?.amount ?? null,

      referencePriceEstimate:
        project.procurementAnalysis?.referencePriceEstimate?.amount ?? null,

      status: project.contract_status || "Active",

      winnerName: project.winner_name || null,
      winnerTin: project.winner_tin || null,

      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));

    const internalData = internalTors.map((tor) => ({
      id: tor._id.toString(),
      source: "internal",
      projectId: tor._id.toString(),
      projectName: tor.projectName,
      agencyName: tor.agencyName,
      budget: tor.budget,
      referencePriceEstimate: tor.referencePriceEstimate ?? null,
      deadline: tor.applicationDeadline,
      description: tor.description,
      status: "เปิดรับสมัคร",
      createdAt: tor.createdAt,
      updatedAt: tor.updatedAt,
    }));
    
    data.push(...internalData);
    const summarized = await require('../services/marketDocumentSummary').addMarketDocumentSummaries(data);
    return res.json({ success: true, total: summarized.length, data: summarized });
  } catch (error) {
    console.error("TOR Market API error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to retrieve TOR Market",
    });
  }
}

// ส่งรายละเอียด TOR ภายในให้ครบกลุ่มข้อมูลเดียวกับที่หน้ารายละเอียดโครงการรัฐใช้
async function getMarketTorDetail(req, res) {
  try {

    if (mongoose.isValidObjectId(req.params.projectId)) {
      const internalTor = await Tor.findOne({
        _id: req.params.projectId,
        status: "published",
        applicationDeadline: { $gt: new Date() },
      });
    
      if (internalTor) {
        return res.json({
          success: true,
          data: {
            id: internalTor._id.toString(),
            source: "internal",
            projectId: internalTor._id.toString(),
            projectName: internalTor.projectName,
            agencyName: internalTor.agencyName,
            budget: internalTor.budget,
            referencePriceEstimate: internalTor.referencePriceEstimate ?? null,
            submissionDeadline: internalTor.applicationDeadline,
            contactName: internalTor.contactName,
            contactEmail: internalTor.contactEmail,
            description: internalTor.description,
            objectives: internalTor.objectives,
            scopeOfWork: internalTor.scopeOfWork,
            requirements: internalTor.requirements,
            status: "เปิดรับสมัคร",
            createdAt: internalTor.createdAt,
            updatedAt: internalTor.updatedAt,
          },
        });
      }
    }
    const project = await GovProject.findOne({
      project_id: req.params.projectId,
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: "Government TOR not found",
      });
    }

    const raw = project.raw_data || {};
    const analysis = project.procurementAnalysis || {};
    const analyzedBudget = analysis.allocatedBudget?.amount;

    const governmentBudget = typeof analyzedBudget === "number" && analyzedBudget > 0
      ? analyzedBudget
      : project.budget_amount > 0
        ? project.budget_amount
        :null;

    const qualifications = analysis.contractorQualifications || {};

    const data = {
      id: project._id.toString(),
      source: "government",

      projectId: project.project_id,

      projectName:
        project.project_name ||
        raw.project_name ||
        "ไม่ระบุชื่อโครงการ",

      agencyName:
        project.dept_name ||
        raw.dept_name ||
        "ไม่ระบุหน่วยงาน",

      budget:
        project.procurementAnalysis?.allocatedBudget?.amount ??
        (project.budget_amount > 0 ? project.budget_amount : null),

      allocatedBudget:
        project.procurementAnalysis?.allocatedBudget?.amount ?? null,

      referencePriceEstimate:
        project.procurementAnalysis?.referencePriceEstimate?.amount ?? null,

      submissionDeadline:
        analysis.biddingClosingDate?.dateTime ||
        raw.submission_deadline ||
        raw.deadline ||
        null,
      
      biddingClosingDate:
        analysis.biddingClosingDate || null,

      contactName:
        raw.contact_name ||
        raw.contact_person ||
        "",

      contactEmail:
        raw.contact_email ||
        "",

      description:
        analysis.projectDetails ||
        raw.project_description ||
        raw.description ||
        "",

      objectives: analysis.objectives ||
        (Array.isArray(raw.objectives) ? raw.objectives : []),

      scopeOfWork: analysis.scopeOfWork ||
        (Array.isArray(raw.scope_of_work) ? raw.scope_of_work : []),

      requirements: Array.isArray(raw.requirements)
        ? raw.requirements.map((item) => ({
          description:
            typeof item === "string"
              ? item
              : item?.description || "",
          weight:
            typeof item === "object" && item !== null
              ? Number(item.weight) || 0
              : 0,
          mandatory:
            typeof item === "object" && item !== null
              ? Boolean(item.mandatory)
              : false,
        }))
        : [],

      status:
        project.contract_status ||
        raw.contract_status ||
        "Active",

      winnerName:
        project.winner_name ||
        raw.winner_name ||
        null,

      winnerTin:
        project.winner_tin ||
        raw.winner_tin ||
        null,
      
      contractorQualifications: {
        generalLegal: qualifications.generalLegal || [],
        projectSpecific: qualifications.projectSpecific || [],
      },
      
      technicalRequirements:
        analysis.technicalRequirements || [],
      
      deliverables:
        analysis.deliverables || [],
      
      procurementAnalysisVersion:
        analysis.analysisVersion || null,
      
      documents: {
        priceEstimate: {
          status: project.documents?.priceEstimate?.status || "not_checked",
        },
        invitation: {
          status: project.documents?.invitation?.status || "not_checked",
        },
        draftEbidding: {
          status: project.documents?.draftEbidding?.status || "not_checked",
        },
      },

      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("TOR Market Detail API error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to retrieve TOR detail",
    });
  }
}

function isValidFutureDeadline(value) {
  if (typeof value !== "string" || !value) return false;

  const date = new Date(value);

  return (
    !Number.isNaN(date.getTime()) &&
    date.getTime() > Date.now()
  );
}

async function publishTor(req, res) {
  try {
    const { id } = req.params;
    const { applicationDeadline } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid TOR id",
      });
    }

    if (!isValidFutureDeadline(applicationDeadline)) {
      return res.status(400).json({
        success: false,
        error: "กรุณาระบุวันปิดรับสมัครในอนาคต",
      });
    }

    const owner = await User.findOne({ email: req.ownerId, accountRole: 'project_owner', verificationStatus: 'approved' }).lean();
    if (!owner) return res.status(403).json({ success: false, error: 'กรุณายืนยันตัวตนให้ผ่านก่อนเผยแพร่ TOR' });

    const tor = await Tor.findOneAndUpdate(
      {
        _id: id,
        ownerId: req.ownerId,
        status: "draft",
        // บังคับที่ backend: อนุมัติแล้วและเลขฉบับยังตรงกับที่ส่งตรวจเท่านั้น
        reviewStatus: "approved",
        submittedVersion: { $ne: null },
        $expr: { $eq: ["$contentVersion", "$submittedVersion"] },
      },
      {
        $set: {
          status: "published",
          applicationDeadline: new Date(applicationDeadline),
          publishedAt: new Date(),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!tor) {
      return res.status(409).json({
        success: false,
        error: "TOR ต้องได้รับอนุมัติฉบับปัจจุบันก่อนเผยแพร่",
      });
    }

    return res.json({
      success: true,
      data: tor,
      message: "เผยแพร่ TOR สำเร็จ",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = {
  createTor,
  getTors,
  getTorById,
  updateTor,
  deleteTor,
  publishTor,
  getMarketTors,
  getMarketTorDetail,
};
