require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

// Import Routes
const torRoutes = require("./routes/torRoutes");
const bookmarkRoutes = require("./routes/bookmarkRoutes");
const govSpendingRoutes = require("./routes/govSpendingRoutes");
const govProjectRoutes = require("./routes/govProjectRoutes");
const commentRoutes = require("./routes/commentRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Register API Endpoints
app.use("/api/tors", torRoutes);
app.use("/api/bookmarks", bookmarkRoutes);
app.use("/api/govspending", govSpendingRoutes);
app.use("/api/gov-projects", govProjectRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/users", userRoutes);

const { checkDeadlineReminders, } = require("./services/notifications/deadlineReminderService");
app.post("/api/test/deadline-reminders", async (req, res) => {
  try {
    await checkDeadlineReminders();

    return res.json({
      success: true,
      message: "Deadline reminder check completed",
    });
  } catch (error) {
    console.error("Deadline reminder test error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    mongoState: mongoose.connection.readyState,
  });
});

// MongoDB Atlas
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB Atlas connected"))
  .catch((err) => console.error("MongoDB connection error:", err.message));

// Start Server
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
