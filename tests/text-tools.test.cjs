const { normalizeHashtags, splitHashtags, getSlidePosition } = require("../server/lib/text-tools.cjs");

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
});
