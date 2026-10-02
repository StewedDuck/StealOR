const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");

const ZIP_BUFFER = Buffer.from("PK\u0003\u0004test-zip");
let projectResult;
let receivedMetadata;

const mockGovProject = {
  findOne: async () => projectResult,
};

const mockDocumentService = {
  validateProjectId(projectId) {
    if (!/^\d{11}$/.test(projectId)) {
      const error = new Error("Project ID must contain exactly 11 digits");
      error.statusCode = 400;
      throw error;
    }
    return projectId;
  },
  async getPriceEstimateArchive(projectId, metadata) {
    receivedMetadata = metadata;
    return {
      projectId,
      fileId: metadata.fileId || "looked-up-id",
      fileName: metadata.fileName || "looked-up.zip",
      zipBuffer: ZIP_BUFFER,
    };
  },
  async getInvitationArchive(projectId, metadata) {
    receivedMetadata = metadata;
    return {
      projectId,
      fileId: metadata.fileId || "invitation-looked-up-id",
      fileName: metadata.fileName || "invitation-looked-up.zip",
      zipBuffer: ZIP_BUFFER,
    };
  },
  async getDraftEbiddingArchive(projectId, metadata) {
    receivedMetadata = metadata;
    return {
      projectId,
      fileId: metadata.fileId || "draft-looked-up-id",
      fileName: metadata.fileName || "draft-looked-up.zip",
      zipBuffer: ZIP_BUFFER,
    };
  },
  async getPriceEstimateDocument() {},
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (request) {
  if (request === "../models/GovProject") return mockGovProject;
  if (request === "../services/egp/egpDocumentService") {
    return mockDocumentService;
  }
  return originalRequire.apply(this, arguments);
};
const {
  downloadDraftEbiddingDocument,
  downloadInvitationDocument,
  downloadOriginalDocument,
} = require("../src/controllers/govProjectController");
Module.prototype.require = originalRequire;

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(headers) {
      Object.assign(this.headers, headers);
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("downloadOriginalDocument returns the original ZIP to the frontend", async () => {
  projectResult = {
    documentExtraction: {
      sourceFileId: "stored-id",
      sourceDocument: "pricebuild_67079622362.zip",
    },
  };
  const response = createResponse();

  await downloadOriginalDocument(
    { params: { projectId: "67079622362" } },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "application/zip");
  assert.equal(
    response.headers["Content-Disposition"],
    'attachment; filename="pricebuild_67079622362.zip"'
  );
  assert.deepEqual(response.body, ZIP_BUFFER);
  assert.deepEqual(receivedMetadata, {
    fileId: "stored-id",
    fileName: "pricebuild_67079622362.zip",
    downloadMethod: "file_id",
  });
});

test("downloadOriginalDocument prefers the new Price Estimate metadata", async () => {
  projectResult = {
    documents: {
      priceEstimate: {
        status: "available",
        fileId: "new-price-id",
        fileName: "new-price.zip",
        downloadMethod: "file_id",
      },
    },
    documentExtraction: {
      sourceFileId: "legacy-price-id",
      sourceDocument: "legacy-price.zip",
    },
  };
  const response = createResponse();

  await downloadOriginalDocument(
    { params: { projectId: "67079622362" } },
    response
  );

  assert.deepEqual(receivedMetadata, {
    fileId: "new-price-id",
    fileName: "new-price.zip",
    downloadMethod: "file_id",
    revision: null,
    version: null,
  });
  assert.equal(
    response.headers["Content-Disposition"],
    'attachment; filename="new-price.zip"'
  );
});

test("Invitation download uses only stored Invitation metadata", async () => {
  projectResult = {
    documents: {
      invitation: {
        status: "available",
        fileId: "invitation-id",
        fileName: "invitation.zip",
        downloadMethod: "file_id",
      },
      draftEbidding: {
        status: "available",
        fileId: "draft-id",
        fileName: "draft.zip",
      },
    },
  };
  const response = createResponse();

  await downloadInvitationDocument(
    { params: { projectId: "67079622362" } },
    response
  );

  assert.equal(receivedMetadata.fileId, "invitation-id");
  assert.notEqual(receivedMetadata.fileId, "draft-id");
  assert.equal(response.headers["Content-Type"], "application/zip");
});

test("category downloads sanitize stored filenames before response headers", async () => {
  projectResult = {
    documents: {
      invitation: {
        status: "available",
        fileId: "invitation-id",
        fileName: "../unsafe\r\nname.zip",
        downloadMethod: "file_id",
      },
    },
  };
  const response = createResponse();

  await downloadInvitationDocument(
    { params: { projectId: "67079622362" } },
    response
  );

  assert.equal(
    response.headers["Content-Disposition"],
    'attachment; filename="unsafe__name.zip"'
  );
  assert.equal(response.headers["Content-Disposition"].includes("\r"), false);
  assert.equal(response.headers["Content-Disposition"].includes("\n"), false);
});

test("Draft e-Bidding download rediscovery starts when stored metadata is unavailable", async () => {
  projectResult = {
    documents: {
      draftEbidding: {
        status: "ambiguous",
        fileId: null,
        fileName: null,
      },
    },
  };
  const response = createResponse();

  await downloadDraftEbiddingDocument(
    { params: { projectId: "67079622362" } },
    response
  );

  assert.deepEqual(receivedMetadata, {});
  assert.equal(
    response.headers["Content-Disposition"],
    'attachment; filename="draft-looked-up.zip"'
  );
});

test("downloadOriginalDocument returns 404 for an unknown project", async () => {
  projectResult = null;
  const response = createResponse();

  await downloadOriginalDocument(
    { params: { projectId: "67079622362" } },
    response
  );

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, {
    success: false,
    error: "Project not found",
  });
});
