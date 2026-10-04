// Manages temporary ZIP files, atomic .part writes, source sidecars,
// safe retry reuse, and post-publication cleanup. Failed ZIPs may remain for
// troubleshooting, while successfully processed ZIPs are removed.
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { extractionError } = require("./errors");

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function temporaryZipPaths(tempRoot, projectId, category) {
  const directory = path.join(tempRoot, "zips", projectId);
  const zipPath = path.join(directory, `${category}.zip`);
  return {
    directory,
    zipPath,
    sourcePath: `${zipPath}.source.json`,
    partPrefix: `${path.basename(zipPath)}.part-`,
    sourcePartPrefix: `${path.basename(zipPath)}.source.json.part-`,
  };
}

async function pathExists(targetPath, fileSystem = fs) {
  try {
    await fileSystem.lstat(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function cleanupPartFiles(paths, fileSystem = fs) {
  let names;
  try {
    names = await fileSystem.readdir(paths.directory);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  await Promise.all(
    names
      .filter(
        (name) =>
          name.startsWith(paths.partPrefix) ||
          name.startsWith(paths.sourcePartPrefix)
      )
      .map((name) =>
        fileSystem.rm(path.join(paths.directory, name), { force: true })
      )
  );
}

async function readReusableTemporaryZip(options, dependencies = {}) {
  const fileSystem = dependencies.fs || fs;
  const paths = temporaryZipPaths(
    options.tempRoot,
    options.projectId,
    options.category
  );
  await cleanupPartFiles(paths, fileSystem);
  if (
    !(await pathExists(paths.zipPath, fileSystem)) ||
    !(await pathExists(paths.sourcePath, fileSystem))
  ) {
    return null;
  }

  let source;
  let zipBuffer;
  try {
    source = JSON.parse(await fileSystem.readFile(paths.sourcePath, "utf8"));
    if (source.locatorIdentity !== options.locatorIdentity) return null;
    zipBuffer = await fileSystem.readFile(paths.zipPath);
  } catch {
    return null;
  }
  if (
    zipBuffer.length < 4 ||
    zipBuffer.subarray(0, 2).toString("ascii") !== "PK" ||
    source.sizeBytes !== zipBuffer.length ||
    source.sha256 !== sha256(zipBuffer)
  ) {
    return null;
  }
  return {
    ...paths,
    zipBuffer,
    zipSha256: source.sha256,
    zipSizeBytes: source.sizeBytes,
    reused: true,
  };
}

async function storeDownloadedZip(options, dependencies = {}) {
  if (!Buffer.isBuffer(options.zipBuffer)) {
    throw new TypeError("zipBuffer must be a Buffer");
  }
  if (
    options.zipBuffer.length < 4 ||
    options.zipBuffer.subarray(0, 2).toString("ascii") !== "PK"
  ) {
    throw extractionError("invalid_zip", "Downloaded file is not a ZIP archive", {
      stage: "download",
    });
  }

  const fileSystem = dependencies.fs || fs;
  const paths = temporaryZipPaths(
    options.tempRoot,
    options.projectId,
    options.category
  );
  const uniqueId = dependencies.randomId
    ? dependencies.randomId()
    : randomUUID();
  const partPath = `${paths.zipPath}.part-${uniqueId}`;
  const sourcePartPath = `${paths.sourcePath}.part-${uniqueId}`;
  const zipSha256 = sha256(options.zipBuffer);
  const source = {
    locatorIdentity: options.locatorIdentity,
    sha256: zipSha256,
    sizeBytes: options.zipBuffer.length,
  };

  await fileSystem.mkdir(paths.directory, { recursive: true });
  await cleanupPartFiles(paths, fileSystem);
  try {
    await fileSystem.rm(paths.zipPath, { force: true });
    await fileSystem.rm(paths.sourcePath, { force: true });
    await fileSystem.writeFile(partPath, options.zipBuffer, { flag: "wx" });
    await fileSystem.rename(partPath, paths.zipPath);
    await fileSystem.writeFile(
      sourcePartPath,
      `${JSON.stringify(source, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" }
    );
    await fileSystem.rename(sourcePartPath, paths.sourcePath);
  } catch (error) {
    try {
      await fileSystem.rm(partPath, { force: true });
      await fileSystem.rm(sourcePartPath, { force: true });
    } catch {
      // Preserve the original ZIP persistence failure.
    }
    throw extractionError(
      "temporary_zip_write_failed",
      `Unable to store the temporary ZIP: ${error.message}`,
      { stage: "download", zipPath: paths.zipPath }
    );
  }

  return {
    ...paths,
    zipBuffer: options.zipBuffer,
    zipSha256,
    zipSizeBytes: options.zipBuffer.length,
    reused: false,
  };
}

async function deleteTemporaryZip(options, dependencies = {}) {
  const fileSystem = dependencies.fs || fs;
  const paths = temporaryZipPaths(
    options.tempRoot,
    options.projectId,
    options.category
  );
  const warnings = [];
  for (const targetPath of [paths.zipPath, paths.sourcePath]) {
    try {
      await fileSystem.rm(targetPath, { force: true });
    } catch (error) {
      warnings.push({
        code: "temporary_zip_cleanup_failed",
        message: String(error?.message || "Unable to delete temporary ZIP data"),
        path: targetPath,
      });
    }
  }
  try {
    await cleanupPartFiles(paths, fileSystem);
  } catch (error) {
    warnings.push({
      code: "temporary_zip_cleanup_failed",
      message: String(error?.message || "Unable to delete incomplete ZIP data"),
      path: paths.directory,
    });
  }
  return { deleted: warnings.length === 0, warnings, ...paths };
}

module.exports = {
  deleteTemporaryZip,
  readReusableTemporaryZip,
  sha256,
  storeDownloadedZip,
  temporaryZipPaths,
};
