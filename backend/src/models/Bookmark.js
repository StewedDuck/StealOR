const mongoose = require("mongoose");

const bookmarkSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    source: {
      type: String,
      enum: ["government", "internal"],
      required: true,
      default: "government",
    },

    projectId: {
      type: String,
      default: null,
    },

    torId: {
      type: String,
      default: null,
    },

    savedFrom: {
      type: String,
      enum: ["market", "matching"],
      required: true,
      default: "market",
    },

    match: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);


// Government bookmark
bookmarkSchema.index(
  { userId: 1, projectId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      source: "government",
      projectId: { $type: "string" },
    },
  }
);


// Internal / Draft bookmark
bookmarkSchema.index(
  { userId: 1, torId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      source: "internal",
      torId: { $type: "string" },
    },
  }
);


module.exports = mongoose.model("Bookmark", bookmarkSchema);