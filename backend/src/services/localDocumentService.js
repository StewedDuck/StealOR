const fs = require("fs/promises");
const { get } = require("http");
const path = require("path");
const PDF_ROOT = process.env.GOV_PROJECT_PDF_DIR || path.resolve(process.cwd(), "temp", "pdfs");
const DOCUMENT_CATEGORIES = {
    priceEstimate: "priceEstimate",
    invitation: "invitation",
    draftEbidding: "draftEbidding",
};

function validateLocalProjectId(projectId) {
    const normalized = String(projectId || "").trim();

    if(!/^[a-zA-Z0-9_-]+$/.test(normalized)) {
        const error = new Error("Invalid projectId");
        error.status = 400;
        throw error;
    }
    return normalized;
}

function validateCategory(category) {
    if (!Object.hasOwn(DOCUMENT_CATEGORIES, category)) {
        const error = new Error("Invalid document category");
        error.status = 400;
        throw error;
    }
    return DOCUMENT_CATEGORIES[category];
}

async function getPdfFiles(directory) {
    try {
        const entries = await fs.readdir(directory, { withFileTypes: true });

        return entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
            .map((entry) => entry.name).sort();
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}

async function getLocalProjectDocuments(projectId) {
    const safeProjectId = validateLocalProjectId(projectId);
    const encodedProjectId = encodeURIComponent(safeProjectId);

    const result = {};

    for (const [key, folderName] of Object.entries(
        DOCUMENT_CATEGORIES
    )) {
        const filesDirectory = path.join(
            PDF_ROOT,
            safeProjectId, 
            folderName, 
            "files"
        );

        const fileNames = await getPdfFiles(filesDirectory);

        result[key] = {
            available: fileNames.length > 0,
            files: fileNames.map((fileName) => ({
                fileName,
                url: `/api/gov-projects/${encodedProjectId}/documents/local/${key}/${encodeURIComponent(fileName)}`,
            })),
        };
    }

    return {
        projectId: safeProjectId,
        documents: result,
    };
}

function getLocalPdfPath(projectId, category, fileName) {
    const safeProjectId = validateLocalProjectId(projectId);
    const folderName = validateCategory(category);
    const safeFileName = path.basename(fileName);

    if (safeFileName !== fileName || !safeFileName.toLowerCase().endsWith(".pdf")) {
        const error = new Error("Invalid PDF file name");
        error.status = 400;
        throw error;
    }

    return path.join(
        PDF_ROOT,
        safeProjectId,
        folderName,
        "files",
        safeFileName
    );
}

module.exports = { 
    getLocalProjectDocuments, 
    getLocalPdfPath 
};