require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

// Import Routes
const torRoutes = require("./routes/torRoutes");
const bookmarkRoutes = require("./routes/bookmarkRoutes");
const govSpendingRoutes = require("./routes/govSpendingRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Register API Endpoints
app.use("/api/tors", torRoutes);
app.use("/api/bookmarks", bookmarkRoutes);
app.use("/api/govspending", govSpendingRoutes);

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