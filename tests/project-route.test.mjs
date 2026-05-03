import { describe, expect, it } from "vitest";
import { buildProjectRoute, getUnlockedProjectStages, parseProjectRoute } from "../src/project-route.mjs";

describe("project routes", () => {
  it("builds the project URL from the run id", () => {
    expect(buildProjectRoute("run_123")).toBe("/projeto/run_123");
  });

  it("parses a project URL", () => {
    expect(parseProjectRoute("/projeto/run_123")).toEqual({
      view: "project",
      runId: "run_123",
    });
  });

  it("falls back to the dashboard for unknown paths", () => {
    expect(parseProjectRoute("/qualquer-coisa")).toEqual({ view: "home" });
  });

});

describe("unlocked stages", () => {
  it("unlocks all previous project stages", () => {
    expect(getUnlockedProjectStages("preview")).toEqual(["review", "images", "preview"]);
    expect(getUnlockedProjectStages("publish")).toEqual(["review", "images", "preview", "publish"]);
  });

  it("returns extract fallback for invalid stages", () => {
    expect(getUnlockedProjectStages("inexistente")).toEqual(["extract"]);
  });
});
