const {
  normalizeHashtags,
  splitHashtags,
  getSlidePosition,
  inferTextPositionFromOcrWords,
} = require("../server/lib/text-tools.cjs");

describe("text tools", () => {
  it("extracts unique hashtags from caption text", () => {
    expect(splitHashtags("Hello #fitness #fitness #gym")).toEqual(["#fitness", "#gym"]);
  });

  it("normalizes hashtag arrays and strings", () => {
    expect(normalizeHashtags(["#one", " #two ", "", "#one"])).toEqual(["#one", "#two"]);
    expect(normalizeHashtags("#one, #two #three")).toEqual(["#one", "#two", "#three"]);
  });

  it("assigns slide positions by role", () => {
    expect(getSlidePosition(0, 7)).toBe("center");
    expect(getSlidePosition(3, 7)).toBe("bottom");
    expect(getSlidePosition(6, 7)).toBe("top");
  });

  it("infers text position from OCR word boxes", () => {
    expect(
      inferTextPositionFromOcrWords([
        { bbox: { y0: 80, y1: 180 } },
        { bbox: { y0: 130, y1: 230 } },
      ])
    ).toBe("top");

    expect(
      inferTextPositionFromOcrWords([
        { bbox: { y0: 820, y1: 920 } },
        { bbox: { y0: 900, y1: 1000 } },
      ])
    ).toBe("center");

    expect(
      inferTextPositionFromOcrWords([
        { bbox: { y0: 1500, y1: 1650 } },
        { bbox: { y0: 1620, y1: 1760 } },
      ])
    ).toBe("bottom");
  });
});
