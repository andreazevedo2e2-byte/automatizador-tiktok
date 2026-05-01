import { describe, expect, it } from "vitest";
import { mergeReplacementFiles } from "../src/replacement-files.js";

function file(name, type = "image/jpeg") {
  return { name, type };
}

describe("replacement image queue", () => {
  it("keeps existing files when adding the missing images later", () => {
    const firstBatch = [file("01.jpg"), file("02.jpg")];
    const result = mergeReplacementFiles(firstBatch, [file("03.jpg")], 3);

    expect(result.files.map((entry) => entry.name)).toEqual(["01.jpg", "02.jpg", "03.jpg"]);
    expect(result.acceptedCount).toBe(1);
    expect(result.remainingSlots).toBe(0);
  });

  it("caps the queue at the expected slide count", () => {
    const result = mergeReplacementFiles([file("01.jpg")], [file("02.jpg"), file("03.jpg"), file("04.jpg")], 3);

    expect(result.files.map((entry) => entry.name)).toEqual(["01.jpg", "02.jpg", "03.jpg"]);
    expect(result.ignoredCount).toBe(1);
  });

  it("ignores non-image files", () => {
    const result = mergeReplacementFiles([], [file("slide.jpg"), file("notes.txt", "text/plain")], 2);

    expect(result.files.map((entry) => entry.name)).toEqual(["slide.jpg"]);
    expect(result.invalidCount).toBe(1);
  });
});
