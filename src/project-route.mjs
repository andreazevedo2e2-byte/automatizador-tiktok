const projectStages = ["review", "images", "preview", "publish"];

export function buildProjectRoute(runId) {
  return runId ? `/projeto/${encodeURIComponent(runId)}` : "/";
}

export function parseProjectRoute(pathname = "") {
  const match = pathname.match(/^\/projeto\/([^/]+)\/?$/i);
  if (match) {
    return {
      view: "project",
      runId: decodeURIComponent(match[1]),
    };
  }

  return { view: "home" };
}

export function getUnlockedProjectStages(activeStage = "review") {
  const stageIndex = projectStages.indexOf(activeStage);
  if (stageIndex === -1) return ["extract"];
  return projectStages.slice(0, stageIndex + 1);
}
