// Publishes a fully verified staging directory into its final category
// location. Existing successful artifacts are backed up and restored if the
// replacement cannot be verified.
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { extractionError } = require("./errors");
const {
  verifyCategoryArtifacts,
  writeManifestAtomic,
} = require("./manifestStore");

async function pathExists(targetPath, fileSystem = fs) {
  try {
    await fileSystem.lstat(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function cleanupPath(targetPath, fileSystem) {
  if (await pathExists(targetPath, fileSystem)) {
    await fileSystem.rm(targetPath, { recursive: true, force: true });
  }
}

async function publishStagedCategory(options, dependencies = {}) {
  const stagingDirectory = path.resolve(
    String(options?.stagingDirectory || "")
  );
  const categoryDirectory = path.resolve(
    String(options?.categoryDirectory || "")
  );
  if (!options?.stagingDirectory || !options?.categoryDirectory) {
    throw new TypeError("stagingDirectory and categoryDirectory are required");
  }
  if (stagingDirectory === categoryDirectory) {
    throw new TypeError("stagingDirectory and categoryDirectory must differ");
  }

  const fileSystem = dependencies.fs || fs;
  const verify = dependencies.verifyCategoryArtifacts || verifyCategoryArtifacts;
  const writeManifest = dependencies.writeManifestAtomic || writeManifestAtomic;
  const backupDirectory = path.join(
    path.dirname(categoryDirectory),
    `.${path.basename(categoryDirectory)}.backup-${
      dependencies.randomId ? dependencies.randomId() : randomUUID()
    }`
  );
  let previousMoved = false;
  let stagedPublished = false;

  try {
    await writeManifest(stagingDirectory, options.manifest, {
      fs: fileSystem,
      randomId: dependencies.randomId,
    });
    const stagedVerification = await verify(
      {
        categoryDirectory: stagingDirectory,
        expectedLocatorIdentity: options.manifest.source.locatorIdentity,
      },
      dependencies
    );
    if (!stagedVerification.verified) {
      throw extractionError(
        "staged_artifact_verification_failed",
        `Staged PDF verification failed: ${stagedVerification.reason}`,
        { stage: "verification", reason: stagedVerification.reason }
      );
    }

    await fileSystem.mkdir(path.dirname(categoryDirectory), { recursive: true });
    if (await pathExists(categoryDirectory, fileSystem)) {
      await fileSystem.rename(categoryDirectory, backupDirectory);
      previousMoved = true;
    }
    await fileSystem.rename(stagingDirectory, categoryDirectory);
    stagedPublished = true;

    const publishedVerification = await verify(
      {
        categoryDirectory,
        expectedLocatorIdentity: options.manifest.source.locatorIdentity,
      },
      dependencies
    );
    if (!publishedVerification.verified) {
      throw extractionError(
        "published_artifact_verification_failed",
        `Published PDF verification failed: ${publishedVerification.reason}`,
        { stage: "publish", reason: publishedVerification.reason }
      );
    }
  } catch (error) {
    const rollbackErrors = [];
    if (stagedPublished) {
      try {
        await cleanupPath(categoryDirectory, fileSystem);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (previousMoved) {
      try {
        await fileSystem.rename(backupDirectory, categoryDirectory);
        previousMoved = false;
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    try {
      await cleanupPath(stagingDirectory, fileSystem);
    } catch (cleanupError) {
      rollbackErrors.push(cleanupError);
    }
    if (rollbackErrors.length > 0 && error && typeof error === "object") {
      error.rollbackErrors = rollbackErrors;
    }
    throw error;
  }

  const cleanupWarnings = [];
  if (previousMoved) {
    try {
      await cleanupPath(backupDirectory, fileSystem);
    } catch (error) {
      cleanupWarnings.push({
        code: "previous_artifact_cleanup_failed",
        message: String(error?.message || "Unable to remove artifact backup"),
        path: backupDirectory,
      });
    }
  }

  return {
    status: "published",
    categoryDirectory,
    replacedExisting: previousMoved,
    cleanupWarnings,
  };
}

module.exports = {
  publishStagedCategory,
};
