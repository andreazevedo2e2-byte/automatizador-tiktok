function normalizeTikTokUrl(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("tiktok.com")) {
      throw new Error("Only TikTok URLs are supported.");
    }
    return parsed.toString();
  } catch {
    throw new Error("Invalid TikTok URL.");
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function splitHashtags(input) {
  if (!input) return [];
  const matches = String(input).match(/#[\p{L}\p{N}_]+/gu) || [];
  return [...new Set(matches)];
}

function normalizeHashtags(input) {
  if (Array.isArray(input)) {
    return [...new Set(input.map((entry) => String(entry).trim()).filter(Boolean))];
  }

  if (!input) return [];
  return [...new Set(String(input).split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean))];
}

function buildCaptionEnglish(input) {
  return String(input || "").trim();
}

function inferTextPositionFromOcrWords(words = []) {
  const centers = words
    .map((word) => {
      const y0 = Number(word?.bbox?.y0);
      const y1 = Number(word?.bbox?.y1);
      if (Number.isNaN(y0) || Number.isNaN(y1)) return null;
      return (y0 + y1) / 2;
    })
    .filter((value) => typeof value === "number");

  if (!centers.length) return "bottom";

  const averageY = centers.reduce((sum, value) => sum + value, 0) / centers.length;
  if (averageY < 520) return "top";
  if (averageY < 1240) return "center";
  return "bottom";
}

function getSlidePosition(index, totalSlides) {
  if (index === 0) return "center";
  if (index === totalSlides - 1) return "top";
  return "bottom";
}

function buildTranslatedSlides(slides = [], translatedTexts = []) {
  return slides.map((slide, index) => ({
    ...slide,
    ocrPortuguese: translatedTexts[index] || "",
    reviewedPortuguese: translatedTexts[index] || "",
  }));
}

module.exports = {
  buildCaptionEnglish,
  buildTranslatedSlides,
  getSlidePosition,
  inferTextPositionFromOcrWords,
  normalizeHashtags,
  normalizeTikTokUrl,
  splitHashtags,
  timestamp,
};
