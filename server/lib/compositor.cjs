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

function normalizeLayer(layer = {}, fallback = {}) {
  const text = String(layer.text ?? fallback.text ?? "").trim();
  return {
    id: String(layer.id || fallback.id || `layer-${Math.random().toString(36).slice(2, 8)}`),
    text,
    x: Number.isFinite(Number(layer.x)) ? Number(layer.x) : Number(fallback.x ?? 540),
    y: Number.isFinite(Number(layer.y)) ? Number(layer.y) : Number(fallback.y ?? 1520),
    width: Number.isFinite(Number(layer.width)) ? Number(layer.width) : Number(fallback.width ?? 900),
    fontSize: Number.isFinite(Number(layer.fontSize)) ? Number(layer.fontSize) : Number(fallback.fontSize ?? 62),
    fontFamily: String(layer.fontFamily || fallback.fontFamily || "sans-serif"),
    color: String(layer.color || fallback.color || "#f8f3eb"),
    strokeColor: String(layer.strokeColor || fallback.strokeColor || "rgba(5, 6, 8, 0.55)"),
    strokeWidth: Number.isFinite(Number(layer.strokeWidth)) ? Number(layer.strokeWidth) : Number(fallback.strokeWidth ?? 14),
    align: ["left", "center", "right"].includes(String(layer.align)) ? String(layer.align) : String(fallback.align || "center"),
    hidden: Boolean(layer.hidden),
  };
}

function createDefaultLayer({ text, position = "bottom" }) {
  const defaultsByPosition = {
    top: { x: 540, y: 400 },
    center: { x: 540, y: 960 },
    bottom: { x: 540, y: 1520 },
  };
  const base = defaultsByPosition[position] || defaultsByPosition.bottom;
  return normalizeLayer(
    {
      id: "main",
      text,
      x: base.x,
      y: base.y,
      width: 900,
      fontSize: 62,
      fontFamily: "sans-serif",
      color: "#f8f3eb",
      strokeColor: "rgba(5, 6, 8, 0.55)",
      strokeWidth: 14,
      align: "center",
      hidden: false,
    },
    {}
  );
}

function renderEditableTextLayer({ width, height, layers = [] }) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  for (const rawLayer of layers) {
    const layer = normalizeLayer(rawLayer);
    if (layer.hidden || !layer.text) continue;
    ctx.textAlign = layer.align;
    const fit = fitTextBlock(ctx, layer.text, Math.max(200, layer.width + 140));
    const fontSize = Math.max(20, Math.min(140, layer.fontSize || fit.fontSize));
    ctx.font = `700 ${fontSize}px ${layer.fontFamily}`;
    const lines = wrapText(ctx, layer.text, Math.max(180, layer.width));
    const lineHeight = 1.1;
    const totalHeight = lines.length * fontSize * lineHeight;

    let textX = layer.x;
    if (layer.align === "left") textX = layer.x - layer.width / 2;
    if (layer.align === "right") textX = layer.x + layer.width / 2;

    ctx.fillStyle = layer.color;
    ctx.strokeStyle = layer.strokeColor;
    ctx.lineWidth = Math.max(0, layer.strokeWidth);

    lines.forEach((line, index) => {
      const y = layer.y - totalHeight / 2 + index * fontSize * lineHeight;
      if (ctx.lineWidth > 0) ctx.strokeText(line, textX, y);
      ctx.fillText(line, textX, y);
    });
  }

  return canvas.toBuffer("image/png");
}

async function compositeSlide({ imageBuffer, text, outputPath, position, textLayers = [] }) {
  const width = 1080;
  const height = 1920;
  const base = await sharp(imageBuffer).resize(width, height, { fit: "cover", position: "center" }).jpeg().toBuffer();
  const gradient = createGradientOverlay(width, height, position);
  const effectiveLayers = Array.isArray(textLayers) && textLayers.length ? textLayers : [createDefaultLayer({ text, position })];
  const textLayer = renderEditableTextLayer({ width, height, layers: effectiveLayers });

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
  createDefaultLayer,
  normalizeLayer,
  renderEditableTextLayer,
  renderTextLayer,
  fitTextBlock,
  wrapText,
};
