const fs = require("fs/promises");

const User = require("../models/User");
const IdentityVerification = require("../models/IdentityVerification");
const NotificationLog = require("../models/NotificationLog");
const path = require("path");

// Helper
async function removeUploadedFile(file) {
    if (!file?.path) return;

    try {
        await fs.unlink(file.path);
    } catch (error) {
        console.error(
            "Failed to remove uploaded verification file:", error.message
        );
    }
}


function validateCitizenId(citizenId) {
    return /^\d{13}$/.test(citizenId);
}


function validatePhone(phone) {
    return /^\d{9,10}$/.test(phone);
}

// POST /api/verifications
// Project Owner submits identity verification
async function submitVerification(req, res) {
    try {
        const {
            userId,
            citizenId,
            laserCode,
            email,
            phone,
        } = req.body;

        // Required fields
        if (
            !userId ||
            !citizenId ||
            !laserCode ||
            !email ||
            !phone
        ) {
            await removeUploadedFile(req.file);

            return res.status(400).json({
                success: false,
                error: "Please provide all verification information",
            });
        }


        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: "Verification document is required",
            });
        }

        // Validate Citizen ID
        if (!validateCitizenId(citizenId)) {
            await removeUploadedFile(req.file);

            return res.status(400).json({
                success: false,
                error: "Citizen ID must contain 13 digits",
            });
        }

        // Validate phone
        if (!validatePhone(phone)) {
            await removeUploadedFile(req.file);

            return res.status(400).json({
                success: false,
                error: "Invalid phone number",
            });
        }

        // Find User
        const user = await User.findById(userId);

        if (!user) {
            await removeUploadedFile(req.file);

            return res.status(404).json({
                success: false,
                error: "User not found",
            });
        }

        if (
            user.accountRole !== "contractor" &&
            user.accountRole !== "project_owner"
        ) {
            return res.status(403).json({
                success: false,
                error:
                    "This account cannot submit identity verification",
            });
        }

        // Email must belong to logged-in account
        if (
            user.email.toLowerCase() !==
            email.trim().toLowerCase()
        ) {
            await removeUploadedFile(req.file);

            return res.status(400).json({
                success: false,
                error: "Verification email must match account email",
            });
        }

        // Prevent duplicate pending request
        const existingPending =
            await IdentityVerification.findOne({
                userId: user._id,
                status: "pending",
            });

        if (existingPending) {
            await removeUploadedFile(req.file);

            return res.status(409).json({
                success: false,
                error: "You already have a pending verification request",
            });
        }

        // Already approved
        if (user.verificationStatus === "approved") {
            await removeUploadedFile(req.file);

            return res.status(409).json({
                success: false,
                error: "Your identity has already been verified",
            });
        }

        // Create Verification
        const verification =
            await IdentityVerification.create({
                userId: user._id,

                citizenId: citizenId.trim(),

                laserCode: laserCode.trim(),

                email: email.trim().toLowerCase(),

                phone: phone.trim(),

                document: {
                    fileName: req.file.originalname,

                    storedFileName: req.file.filename,

                    filePath: req.file.path,

                    mimeType: req.file.mimetype,

                    size: req.file.size,
                },

                status: "pending",

                rejectionReason: null,

                reviewedBy: null,

                reviewedAt: null,
            });

        // Update User status
        user.verificationStatus = "pending";
        user.verificationReason = null;

        await user.save();

        // Notify Admins
        const admins = await User.find({
            accountRole: "admin",
        });


        for (const admin of admins) {
            await NotificationLog.findOneAndUpdate(
                {
                    userId: admin.email,
                    source: "verification",

                    projectId: null,
                    torId: null,

                    verificationId:
                        verification._id.toString(),

                    type:
                        "identity_verification_requested",
                },
                {
                    $set: {
                        title:
                            "มีคำขอยืนยันตัวตนใหม่",

                        message:
                            `${user.name} ส่งคำขอยืนยันตัวตน รอการตรวจสอบ`,

                        read: false,

                        sentAt: new Date(),
                    },
                },
                {
                    upsert: true,
                    new: true,
                }
            );
        }


        return res.status(201).json({
            success: true,

            data: {
                id: verification._id,

                status:
                    verification.status,

                submittedAt:
                    verification.createdAt,
            },

            message:
                "Identity verification submitted successfully",
        });

    } catch (error) {

        await removeUploadedFile(req.file);

        console.error(
            "Submit verification error:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Failed to submit identity verification",
        });
    }
}

// GET /api/verifications/me/:userId
// Project Owner gets latest verification status
async function getMyVerification(req, res) {
    try {
        const { userId } = req.params;


        const user =
            await User.findById(userId).lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "User not found",
            });
        }

        const verification =
            await IdentityVerification
                .findOne({
                    userId,
                })
                .sort({
                    createdAt: -1,
                })
                .lean();


        return res.json({
            success: true,

            data: {
                verificationStatus:
                    user.verificationStatus,

                verificationReason:
                    user.verificationReason,

                verification: verification
                    ? {
                        id:
                            verification._id,

                        status:
                            verification.status,

                        rejectionReason:
                            verification.rejectionReason,

                        submittedAt:
                            verification.createdAt,

                        reviewedAt:
                            verification.reviewedAt,
                    }
                    : null,
            },
        });

    } catch (error) {

        console.error(
            "Get verification status error:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Failed to retrieve verification status",
        });
    }
}

// GET /api/verifications/admin
// Admin gets verification requests
async function getAdminVerifications(req, res) {
    try {
        const { adminId } = req.query;
        const { status } = req.query;

        if (!adminId) {
            return res.status(400).json({
                success: false,
                error: "adminId is required",
            });
        }

        const admin = await User.findById(adminId).lean();

        if (!admin) {
            return res.status(404).json({
                success: false,
                error: "Admin user not found",
            });
        }

        if (admin.accountRole !== "admin") {
            return res.status(403).json({
                success: false,
                error: "Admin access required",
            });
        }

        const query = {};

        if (
            status &&
            ["pending", "approved", "rejected"].includes(status)
        ) {
            query.status = status;
        }

        const verifications =
            await IdentityVerification
                .find(query)
                .sort({
                    createdAt: -1,
                })
                .lean();

        const data = await Promise.all(
            verifications.map(async (verification) => {

                const owner = await User
                    .findById(verification.userId)
                    .lean();

                return {
                    id: verification._id,

                    owner: owner
                        ? {
                            id: owner._id,
                            name: owner.name,
                            email: owner.email,
                            image: owner.image,
                        }
                        : null,

                    phone:
                        verification.phone,

                    status:
                        verification.status,

                    rejectionReason:
                        verification.rejectionReason,

                    submittedAt:
                        verification.createdAt,

                    reviewedAt:
                        verification.reviewedAt,
                };
            })
        );

        return res.json({
            success: true,
            total: data.length,
            data,
        });

    } catch (error) {

        console.error(
            "Get admin verifications error:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Failed to retrieve verification requests",
        });
    }
}

// GET /api/verifications/admin/:id
// Admin gets one verification request
async function getAdminVerificationById(req, res) {
    try {
        const { id } = req.params;
        const { adminId } = req.query;

        if (!adminId) {
            return res.status(400).json({
                success: false,
                error: "adminId is required",
            });
        }

        const admin =
            await User.findById(adminId).lean();

        if (!admin) {
            return res.status(404).json({
                success: false,
                error: "Admin user not found",
            });
        }

        if (admin.accountRole !== "admin") {
            return res.status(403).json({
                success: false,
                error: "Admin access required",
            });
        }

        const verification =
            await IdentityVerification
                .findById(id)
                .lean();

        if (!verification) {
            return res.status(404).json({
                success: false,
                error:
                    "Verification request not found",
            });
        }

        const owner =
            await User
                .findById(
                    verification.userId
                )
                .lean();

        return res.json({
            success: true,

            data: {
                id:
                    verification._id,

                owner: owner
                    ? {
                        id: owner._id,
                        name: owner.name,
                        email: owner.email,
                        image: owner.image,
                    }
                    : null,

                // Admin needs to inspect submitted data.
                // We will mask citizen ID in the list,
                // but detail endpoint returns submitted value.
                citizenId:
                    verification.citizenId,

                laserCode:
                    verification.laserCode,

                email:
                    verification.email,

                phone:
                    verification.phone,

                document: {
                    fileName:
                        verification.document.fileName,

                    mimeType:
                        verification.document.mimeType,

                    size:
                        verification.document.size,

                    url:
                        `/api/verifications/admin/${verification._id}/document?adminId=${encodeURIComponent(adminId)}`,
                },

                status:
                    verification.status,

                rejectionReason:
                    verification.rejectionReason,

                reviewedBy:
                    verification.reviewedBy,

                submittedAt:
                    verification.createdAt,

                reviewedAt:
                    verification.reviewedAt,
            },
        });

    } catch (error) {

        console.error(
            "Get verification detail error:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Failed to retrieve verification request",
        });
    }
}

// GET /api/verifications/admin/:id/document
// Admin views uploaded verification document
async function getVerificationDocument(req, res) {
    try {
        const { id } = req.params;
        const { adminId } = req.query;

        if (!adminId) {
            return res.status(400).json({
                success: false,
                error: "adminId is required",
            });
        }

        const admin =
            await User.findById(adminId).lean();

        if (
            !admin ||
            admin.accountRole !== "admin"
        ) {
            return res.status(403).json({
                success: false,
                error: "Admin access required",
            });
        }

        const verification =
            await IdentityVerification
                .findById(id)
                .lean();

        if (!verification) {
            return res.status(404).json({
                success: false,
                error:
                    "Verification request not found",
            });
        }

        const filePath =
            path.resolve(
                verification.document.filePath
            );

        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({
                success: false,
                error:
                    "Verification document not found",
            });
        }

        res.setHeader(
            "Content-Type",
            verification.document.mimeType
        );

        res.setHeader(
            "Content-Disposition",
            `inline; filename="${encodeURIComponent(
                verification.document.fileName
            )}"`
        );

        return res.sendFile(filePath);

    } catch (error) {

        console.error(
            "Get verification document error:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Failed to retrieve verification document",
        });
    }
}

// PATCH /api/verifications/admin/:id/approve
async function approveVerification(req, res) {
    try {
        const { id } = req.params;
        const { adminId } = req.body;

        if (!adminId) {
            return res.status(400).json({
                success: false,
                error: "adminId is required",
            });
        }

        const admin =
            await User.findById(adminId);

        if (!admin) {
            return res.status(404).json({
                success: false,
                error: "Admin user not found",
            });
        }

        if (admin.accountRole !== "admin") {
            return res.status(403).json({
                success: false,
                error: "Admin access required",
            });
        }

        const verification =
            await IdentityVerification.findById(id);

        if (!verification) {
            return res.status(404).json({
                success: false,
                error:
                    "Verification request not found",
            });
        }

        if (verification.status !== "pending") {
            return res.status(409).json({
                success: false,
                error:
                    "Verification request has already been reviewed",
            });
        }

        const owner =
            await User.findById(
                verification.userId
            );

        if (!owner) {
            return res.status(404).json({
                success: false,
                error:
                    "Project owner not found",
            });
        }


        // Update verification
        verification.status = "approved";
        verification.rejectionReason = null;
        verification.reviewedBy = admin._id;
        verification.reviewedAt = new Date();
        await verification.save();


        // Update Project Owner
        owner.verificationStatus = "approved";
        owner.verificationReason = null;
        owner.accountRole = "project_owner";
        await owner.save();


        // Notify Project Owner
        await NotificationLog.findOneAndUpdate(
            {
                userId: owner.email,
                source: "verification",
                projectId: null,
                torId: null,
                verificationId: verification._id.toString(),
                type: "identity_verification_approved",
            },
            {
                $set: {
                    title: "การยืนยันตัวตนได้รับการอนุมัติ",
                    message: "บัญชี Project Owner ของคุณได้รับการยืนยันตัวตนเรียบร้อยแล้ว",
                    read: false,
                    sentAt: new Date(),
                },
            },
            {
                upsert: true,
                new: true,
            }
        );


        return res.json({
            success: true,
            data: {
                id: verification._id,
                status: verification.status,
                reviewedAt: verification.reviewedAt,
            },
            message: "Verification approved successfully",
        });

    } catch (error) {
        console.error(
            "Approve verification error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Failed to approve verification",
        });
    }
}

// PATCH /api/verifications/admin/:id/reject
async function rejectVerification(req, res) {
    try {
        const {
            adminId,
            reason,
        } = req.body;


        if (!adminId) {
            return res.status(400).json({
                success: false,
                error: "adminId is required",
            });
        }


        if (
            !reason ||
            !reason.trim()
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Rejection reason is required",
            });
        }


        const admin =
            await User.findById(adminId);


        if (!admin) {
            return res.status(404).json({
                success: false,
                error: "Admin user not found",
            });
        }


        if (admin.accountRole !== "admin") {
            return res.status(403).json({
                success: false,
                error: "Admin access required",
            });
        }


        const verification =
            await IdentityVerification.findById(
                req.params.id
            );


        if (!verification) {
            return res.status(404).json({
                success: false,
                error: "Verification request not found",
            });
        }


        if (verification.status !== "pending") {
            return res.status(409).json({
                success: false,
                error: "Verification request has already been reviewed",
            });
        }

        const owner =
            await User.findById(
                verification.userId
            );

        if (!owner) {
            return res.status(404).json({
                success: false,
                error: "Project owner not found",
            });
        }
        const rejectionReason = reason.trim();

        // Update verification
        verification.status = "rejected";
        verification.rejectionReason = rejectionReason;ฃ
        verification.reviewedBy = admin._id;
        verification.reviewedAt = new Date();
        await verification.save();

        // Update Project Owner
        owner.verificationStatus = "rejected";
        owner.verificationReason = rejectionReason;
        owner.accountRole = "contractor";
        await owner.save();

        // Notify Project Owner
        await NotificationLog.findOneAndUpdate(
            {
                userId: owner.email,
                source: "verification",
                projectId: null,
                torId: null,
                verificationId: verification._id.toString(),
                type: "identity_verification_rejected",
            },
            {
                $set: {
                    title: "การยืนยันตัวตนไม่ผ่าน",
                    message: `เหตุผล: ${rejectionReason}`,
                    read: false,
                    sentAt: new Date(),
                },
            },
            {
                upsert: true,
                new: true,
            }
        );

        return res.json({
            success: true,

            data: {
                id: verification._id,
                status: verification.status,
                rejectionReason: verification.rejectionReason,
                reviewedAt: verification.reviewedAt,
            },

            message: "Verification rejected successfully",
        });

    } catch (error) {

        console.error(
            "Reject verification error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Failed to reject verification",
        });
    }
}

module.exports = {
    submitVerification,
    getMyVerification,
    getAdminVerifications,
    getAdminVerificationById,
    getVerificationDocument,
    approveVerification,
    rejectVerification,
};