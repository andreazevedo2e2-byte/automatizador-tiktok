const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { compositeSlide, wrapText } = require("../server/lib/compositor.cjs");

describe("compositor", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tt-compositor-"));
  });

  it("wraps text into multiple lines when width is limited", async () => {
    const { createCanvas } = require("@napi-rs/canvas");
    const canvas = createCanvas(1080, 1920);
    const ctx = canvas.getContext("2d");
    ctx.font = "700 72px sans-serif";
    const lines = wrapText(ctx, "This is a deliberately long sentence for wrapping", 400);
    expect(lines.length).toBeGreaterThan(1);
  });

  it("renders a full-size vertical slide", async () => {
    const base = await sharp({
      create: {
        width: 1200,
        height: 1200,
        channels: 3,
        background: "#114488",
      },
    })
      .jpeg()
      .toBuffer();

    const outputPath = path.join(tempDir, "slide.jpg");
    await compositeSlide({
      imageBuffer: base,
      text: "5 tips to actually change your body",
      outputPath,
      position: "center",
    });

    const metadata = await sharp(outputPath).metadata();
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1920);
  });
});
