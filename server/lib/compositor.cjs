const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const { createCanvas } = require("@napi-rs/canvas");

function wrapText(ctx, text, maxWidth) {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (!words.length) return [""];
  const lines = [];
  let currentLine = words[0];

  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${currentLine} ${words[index]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = words[index];
    }
  }

  lines.push(currentLine);
  return lines;
}

function fitTextBlock(ctx, text, width) {
  let fontSize = 72;
  let lines = [];
  const minFontSize = 44;
  const maxWidth = width - 148;

  while (fontSize >= minFontSize) {
    ctx.font = `700 ${fontSize}px sans-serif`;
    lines = wrapText(ctx, text, maxWidth);
    const longestLine = Math.max(...lines.map((line) => ctx.measureText(line).width), 0);
    if (lines.length <= 6 && longestLine <= maxWidth) {
      return { lines, fontSize };
    }
    fontSize -= 4;
  }

  ctx.font = `700 ${minFontSize}px sans-serif`;
  return {
    lines: wrapText(ctx, text, maxWidth),
    fontSize: minFontSize,
  };
}

function createGradientOverlay(width, height, position) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  let gradient;

  if (position === "top") {
    gradient = ctx.createLinearGradient(0, 0, 0, height * 0.5);
    gradient.addColorStop(0, "rgba(6, 7, 11, 0.84)");
    gradient.addColorStop(1, "rgba(6, 7, 11, 0)");
  } else if (position === "center") {
    gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(6, 7, 11, 0.26)");
    gradient.addColorStop(0.5, "rgba(6, 7, 11, 0.56)");
    gradient.addColorStop(1, "rgba(6, 7, 11, 0.26)");
  } else {
    gradient = ctx.createLinearGradient(0, height * 0.45, 0, height);
    gradient.addColorStop(0, "rgba(6, 7, 11, 0)");
    gradient.addColorStop(1, "rgba(6, 7, 11, 0.84)");
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer("image/png");
}

function renderTextLayer({ width, height, text, position = "bottom" }) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const lineHeight = 1.1;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const { lines, fontSize } = fitTextBlock(ctx, text, width);
  const totalHeight = lines.length * fontSize * lineHeight;

  let centerY = height * 0.8;
  if (position === "center") centerY = height * 0.5;
  if (position === "top") centerY = height * 0.22;

  ctx.fillStyle = "#f8f3eb";
  ctx.strokeStyle = "rgba(5, 6, 8, 0.55)";
  ctx.lineWidth = 14;
  ctx.lineJoin = "round";

  lines.forEach((line, index) => {
    const y = centerY - totalHeight / 2 + index * fontSize * lineHeight;
    ctx.strokeText(line, width / 2, y);
    ctx.fillText(line, width / 2, y);
  });

  return canvas.toBuffer("image/png");
}

async function compositeSlide({ imageBuffer, text, outputPath, position }) {
  const width = 1080;
  const height = 1920;
  const base = await sharp(imageBuffer).resize(width, height, { fit: "cover", position: "center" }).jpeg().toBuffer();
  const gradient = createGradientOverlay(width, height, position);
  const textLayer = renderTextLayer({ width, height, text, position });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(base)
    .composite([
      { input: gradient, top: 0, left: 0 },
      { input: textLayer, top: 0, left: 0 },
    ])
    .jpeg({ quality: 92 })
    .toFile(outputPath);

  return outputPath;
}

module.exports = {
  compositeSlide,
  createGradientOverlay,
  renderTextLayer,
  fitTextBlock,
  wrapText,
};
