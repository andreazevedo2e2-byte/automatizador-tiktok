const projectStages = ["review", "images", "publish"];

export function buildProjectRoute(runId) {
  return runId ? `/projeto/${encodeURIComponent(runId)}` : "/";
}

export function parseProjectRoute(pathname = "") {
  if (pathname === "/callback") {
    return { view: "callback" };
  }

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
