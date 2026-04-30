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
  normalizeHashtags,
  normalizeTikTokUrl,
  splitHashtags,
  timestamp,
};
