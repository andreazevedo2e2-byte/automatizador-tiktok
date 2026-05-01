const fs = require("node:fs/promises");
const path = require("node:path");

function createRunStore(rootDir) {
  const runsDir = path.join(rootDir, "runs");

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

  async function loadRun(runId) {
    const raw = await fs.readFile(getManifestPath(runId), "utf8");
    return JSON.parse(raw);
  }

  async function listRuns() {
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
        runs.push({
          runId: run.runId,
          sourceUrl: run.sourceUrl,
          stage: run.stage,
          captionPortuguese: run.captionPortuguese || "",
          captionEnglish: run.captionEnglish || "",
          hashtags: run.hashtags || [],
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

  async function deleteRun(runId) {
    await fs.rm(getRunDir(runId), { recursive: true, force: true });
  }

  async function updateRun(runId, updater) {
    const current = await loadRun(runId);
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
