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
    loadRun,
    runsDir,
    saveRun,
    updateRun,
  };
}

module.exports = { createRunStore };
