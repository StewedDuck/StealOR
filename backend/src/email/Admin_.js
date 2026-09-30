const express = require("express");
const { accountApproved } = require("../emails")
const { sendEmail } = require("../services/mailer");
const User = require("../models/User");

const router = express.Router();

// POST /api/admin/users/:id/approve
router.post("/users/:id/approve", async (req, res) => {
    
})