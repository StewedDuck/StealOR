const express = require("express");

const {
    submitVerification,
    getMyVerification,

    getAdminVerifications,
    getAdminVerificationById,
    getVerificationDocument,

    approveVerification,
    rejectVerification,
} = require( "../controllers/verificationController");

const verificationUpload = require("../middleware/verificationUpload");

const router = express.Router();


// Submit verification
router.post( "/", verificationUpload.single("document"), submitVerification);

// Get Project Owner verification status
router.get("/me/:userId", getMyVerification);

// Admin
// Get all verification requests
router.get("/admin", getAdminVerifications);

// View uploaded document
// IMPORTANT: keep this before /admin/:id
router.get("/admin/:id/document", getVerificationDocument);

// Get one verification request
router.get("/admin/:id", getAdminVerificationById);

// Approve
router.patch("/admin/:id/approve", approveVerification);


// Reject
router.patch("/admin/:id/reject", rejectVerification);

module.exports = router;
