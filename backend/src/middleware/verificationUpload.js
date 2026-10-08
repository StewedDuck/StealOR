const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDirectory = path.resolve(
    process.cwd(),
    "uploads",
    "verifications"
);

fs.mkdirSync(uploadDirectory, {
    recursive: true,
});

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, uploadDirectory);
    },

    filename: (req, file, callback) => {
        const extension =
            path.extname(file.originalname).toLowerCase();

        const uniqueName =
            `${Date.now()}-${Math.round(
                Math.random() * 1e9
            )}${extension}`;

        callback(null, uniqueName);
    },
});

const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "application/pdf",
];

const fileFilter = (req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
        return callback(
            new Error(
                "Only JPG, PNG, and PDF files are allowed"
            )
        );
    }

    callback(null, true);
};

const verificationUpload = multer({
    storage,
    fileFilter,

    limits: {
        fileSize: 10 * 1024 * 1024,
    },
});

module.exports = verificationUpload;