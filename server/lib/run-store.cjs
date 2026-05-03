const fs = require("node:fs/promises");
const path = require("node:path");

function createRunStore(rootDir) {
  const runsDir = path.join(rootDir, "runs");

  function normalizeOwnerIds(ownerId) {
    if (!ownerId) return [];
    if (Array.isArray(ownerId)) {
      return ownerId.map((value) => String(value || "").trim()).filter(Boolean);
    }
    return [String(ownerId || "").trim()].filter(Boolean);
  }

  function matchesOwner(run, ownerId) {
    const ownerIds = normalizeOwnerIds(ownerId);
    if (!ownerIds.length) return true;
    const runOwners = [
      String(run.ownerId || "").trim(),
      String(run.ownerEmail || "").trim(),
    ].filter(Boolean);
    if (!runOwners.length) return true;
    return ownerIds.some((value) => runOwners.includes(value));
  }

  function getRunDir(runId) {
    return path.join(runsDir, runId);
  }

  function getManifestPath(runId) {
    return path.join(getRunDir(runId), "run.json");
  }

  function getSlidesDir(runId) {
    return path.join(getRunDir(runId), "slides");
  }

  function getUploadsDir(runId) {
    return path.join(getRunDir(runId), "uploads");
  }

  function getRenderedDir(runId) {
    return path.join(getRunDir(runId), "rendered");
  }

  async function ensureRunDirs(runId) {
    await fs.mkdir(getSlidesDir(runId), { recursive: true });
    await fs.mkdir(getUploadsDir(runId), { recursive: true });
    await fs.mkdir(getRenderedDir(runId), { recursive: true });
  }

  async function saveRun(run) {
    await ensureRunDirs(run.runId);
    await fs.writeFile(getManifestPath(run.runId), JSON.stringify(run, null, 2));
    return run;
  }

  async function loadRun(runId, ownerId) {
    const raw = await fs.readFile(getManifestPath(runId), "utf8");
    const run = JSON.parse(raw);
    if (!matchesOwner(run, ownerId)) {
      const error = new Error("Run not found.");
      error.code = "RUN_NOT_FOUND";
      throw error;
    }
    return run;
  }

  async function listRuns(ownerId) {
    let entries = [];
    try {
      entries = await fs.readdir(runsDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const runs = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
      try {
        const manifestPath = getManifestPath(entry.name);
        const [run, stats] = await Promise.all([loadRun(entry.name), fs.stat(manifestPath)]);
        if (!matchesOwner(run, ownerId)) {
          continue;
        }
        runs.push({
          runId: run.runId,
          ownerId: run.ownerId || "",
          projectName: run.projectName || "",
          sourceUrl: run.sourceUrl,
          stage: run.stage,
          captionPortuguese: run.captionPortuguese || "",
          captionEnglish: run.captionEnglish || "",
          hashtags: run.hashtags || [],
          driveTarget: run.driveTarget || null,
          driveExport: run.driveExport || null,
          slideCount: Array.isArray(run.slides) ? run.slides.length : 0,
          updatedAt: stats.mtime.toISOString(),
          createdAt: run.createdAt || run.runId,
        });
      } catch {
        // Ignore incomplete run folders.
      }
    }

    return runs.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async function deleteRun(runId, ownerId) {
    if (ownerId) {
      await loadRun(runId, ownerId);
    }
    await fs.rm(getRunDir(runId), { recursive: true, force: true });
  }

  async function updateRun(runId, updater, ownerId) {
    const current = await loadRun(runId, ownerId);
    const next = typeof updater === "function" ? await updater(current) : { ...current, ...updater };
    await saveRun(next);
    return next;
  }

  return {
    ensureRunDirs,
    getManifestPath,
    getRenderedDir,
    getRunDir,
    getSlidesDir,
    getUploadsDir,
    deleteRun,
    listRuns,
    loadRun,
    runsDir,
    saveRun,
    updateRun,
  };
}

module.exports = { createRunStore };
