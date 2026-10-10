const mongoose = require("mongoose");
const Tor = require("../models/Tor");
const Bookmark = require("../models/Bookmark");
const User = require("../models/User");
const NotificationLog = require("../models/NotificationLog");

const { draftUpdated } = require("../email/Contractor");
const { sendEmail } = require("../email/Mailer");

// const DEMO_OWNER_ID = "demo-project-owner";
const EDITABLE_FIELDS = [
  "projectName", "agencyName", "description", "objectives", "scopeOfWork",
  "requirements", "budget", "submissionDeadline", "contactName", "contactEmail",
];
const GovProject = require("../models/GovProject");

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
  const bookmarks = await Bookmark.find({
    source: "internal",
    torId: tor._id.toString(),
  }).lean();

  console.log(
    `Found ${bookmarks.length} bookmarks for updated TOR ${tor._id}`
  );

  for (const bookmark of bookmarks) {
    try {
      const user = await User.findOne({
        email: bookmark.userId
          .trim()
          .toLowerCase(),
      }).lean();

      if (!user) {
        console.log(
          `User not found: ${bookmark.userId}`
        );
        continue;
      }

      await NotificationLog.findOneAndUpdate(
          {
              userId: bookmark.userId,
              source: "internal",
              projectId: null,
              torId: tor._id.toString(),
              type: "draft_updated",
          },
          {
              $set: {
                  title: `TOR ร่างมีการอัปเดต: ${tor.projectName}`,
                  message:
                      "TOR ร่างที่คุณบันทึกไว้มีการอัปเดตข้อมูล กรุณาตรวจสอบรายละเอียดล่าสุด",
                  read: false,
                  sentAt: new Date(),
              },
          },
          {
              upsert: true,
              new: true,
          }
      );

      const email = draftUpdated({
        name: user.name,
        torTitle: tor.projectName,
        torUrl: `${process.env.APP_URL}/contractor/saved`,
      });

      await sendEmail({
        to: user.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      console.log(
        `Draft updated email sent to ${user.email}: ${tor.projectName}`
      );
    } catch (error) {
      console.error(
        `Draft updated email failed for ${bookmark.userId}:`,
        error.message
      );
    }
  }
}

async function updateTor(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: "Invalid TOR id" });
    }
    const tor = await Tor.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.ownerId, status: "draft" },
      { $set: prepareTorData(req.body) },
      { new: true, runValidators: true }
    );
    if (!tor) {
      return res.status(404).json({ 
        success: false, 
        error: "Draft TOR not found" 
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
    const governmentTors = await GovProject.find({
      contract_status: {
        $not: /ยกเลิก|สิ้นสุด/,
      },
    }).sort({ updatedAt: -1});

    const data = governmentTors.map((project) => ({
      id: project._id.toString(),
      source: "government",

      projectId: project.project_id,
      projectName: project.project_name,
      agencyName: project.dept_name,

      budget:
        project.sum_price_agree ||
        project.budget_amount ||
        0,

      status: project.contract_status || "Active",

      winnerName: project.winner_name || null,
      winnerTin: project.winner_tin || null,

      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));

    const internalTors = await Tor.find({
      status: "published",
      applicationDeadline: { $gt: new Date() },
    }).sort({ publishedAt: -1 });
    
    const internalData = internalTors.map((tor) => ({
      id: tor._id.toString(),
      source: "internal",
      projectId: tor._id.toString(),
      projectName: tor.projectName,
      agencyName: tor.agencyName,
      budget: tor.budget,
      deadline: tor.applicationDeadline,
      description: tor.description,
      status: "เปิดรับสมัคร",
      createdAt: tor.createdAt,
      updatedAt: tor.updatedAt,
    }));
    
    data.push(...internalData);

    return res.json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error) {
    console.error("TOR Market API error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to retrieve TOR Market",
    });
  }
}

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
        project.sum_price_agree ||
        project.budget_amount ||
        0,

      submissionDeadline:
        raw.submission_deadline ||
        raw.deadline ||
        raw.project_end_date ||
        null,

      contactName:
        raw.contact_name ||
        raw.contact_person ||
        "",

      contactEmail:
        raw.contact_email ||
        "",

      description:
        raw.project_description ||
        raw.description ||
        "",

      objectives: Array.isArray(raw.objectives)
        ? raw.objectives
        : [],

      scopeOfWork: Array.isArray(raw.scope_of_work)
        ? raw.scope_of_work
        : [],

      requirements: Array.isArray(raw.requirements)
        ? raw.requirements.map((item) => ({
            description:
              typeof item === "string"
                ? item
                : item.description || "",
            weight:
              typeof item === "object"
                ? Number(item.weight) || 0
                : 0,
            mandatory:
              typeof item === "object"
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

    const tor = await Tor.findOneAndUpdate(
      {
        _id: id,
        ownerId: req.ownerId,
        status: "draft",
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
      return res.status(404).json({
        success: false,
        error: "ไม่พบ TOR ฉบับร่างที่สามารถเผยแพร่ได้",
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