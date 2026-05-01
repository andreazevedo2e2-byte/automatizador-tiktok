import { describe, expect, it } from "vitest";
import { computeLayerDelta, estimateLayerFrameHeight } from "../src/editor-math.mjs";

describe("editor-math", () => {
  it("scales drag delta by current preview size", () => {
    const { deltaX, deltaY } = computeLayerDelta({
      startClientX: 100,
      startClientY: 80,
      clientX: 160,
      clientY: 200,
      previewWidth: 300,
      previewHeight: 600,
    });

    expect(Math.round(deltaX)).toBe(216);
    expect(Math.round(deltaY)).toBe(384);
  });

  it("estimates a bounded layer frame height", () => {
    const low = estimateLayerFrameHeight({ text: "a", fontSize: 20 });
    const high = estimateLayerFrameHeight({ text: "a\nb\nc\nd\ne", fontSize: 180 });

    expect(low).toBeGreaterThanOrEqual(5);
    expect(high).toBeLessThanOrEqual(38);
  });
});
