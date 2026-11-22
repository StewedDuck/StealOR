const mongoose = require("mongoose");

const rssDepartmentSchema = new mongoose.Schema(
  {
    deptId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    addedBy: {
      type: String,
      default: "system",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RssDepartment", rssDepartmentSchema);