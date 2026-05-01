const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

const MODEL_FILES = [
  {
    name: "PP-OCRv5_mobile_det_infer.onnx",
    url: "https://raw.githubusercontent.com/x3zvawq/paddleocr.js/main/assets/PP-OCRv5_mobile_det_infer.onnx",
    minBytes: 4_000_000,
  },
  {
    name: "PP-OCRv5_mobile_rec_infer.onnx",
    url: "https://raw.githubusercontent.com/x3zvawq/paddleocr.js/main/assets/PP-OCRv5_mobile_rec_infer.onnx",
    minBytes: 15_000_000,
  },
  {
    name: "ppocrv5_dict.txt",
    url: "https://raw.githubusercontent.com/x3zvawq/paddleocr.js/main/assets/ppocrv5_dict.txt",
    minBytes: 50_000,
  },
];

const COMMON_WORDS = new Set(
  [
    "a",
    "an",
    "and",
    "are",
    "as",
    "be",
    "body",
    "beginner",
    "build",
    "calorie",
    "calories",
    "daily",
    "do",
    "every",
    "day",
    "days",
    "failure",
    "feel",
    "find",
    "goal",
    "habits",
    "have",
    "hypertrophie",
    "if",
    "important",
    "is",
    "it",
    "knew",
    "last",
    "macros",
    "muscles",
    "must",
    "necessary",
    "one",
    "out",
    "protein",
    "progress",
    "recover",
    "rir",
    "set",
    "split",
    "soooo",
    "that",
    "the",
    "things",
    "till",
    "to",
    "want",
    "wish",
    "with",
    "you",
    "your",
    "useful",
    "supplement",
    "creatine",
  ].sort((a, b) => b.length - a.length)
);

const PHRASE_REPAIRS = [
  [/thingsiwishiknew/gi, "things I wish I knew"],
  [/asabeginner/gi, "as a beginner"],
  [/haveasplitisnecessary/gi, "have a split is necessary"],
  [/youmustrecoverthe/gi, "you must recover the"],
  [/ifyouwant/gi, "if you want"],
  [/doeverysetaiming/gi, "do every set aiming"],
  [/andlastonetill/gi, "and last one till"],
  [/yourmacros/gi, "your macros"],
  [/r['’]?s[e3o0]{3,}/gi, "are soooo"],
  [/findoutyourdailyprotein/gi, "find out your daily protein"],
  [/finddotyourdailyprotein/gi, "find out your daily protein"],
  [/calor(?:ies|les|fes|fies|fles)goal/gi, "calories goal"],
  [/everydayshouldfeeljust/gi, "every day should feel just"],
  [/astoughaslegday/gi, "as tough as leg day"],
  [/creatineistheonly/gi, "creatine is the only"],
  [/usefulsupplement/gi, "useful supplement"],
  [/trackyourprogressis/gi, "track your progress is"],
  [/rest(\d+)minutesibetween/gi, "rest $1 minutes between"],
  [/\bIwish\b/g, "I wish"],
  [/\bIknew\b/g, "I knew"],
];

let paddleServicePromise = null;

async function downloadFile(url, targetPath) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "automatizador-tiktok-ocr",
    },
  });

  if (!response.ok) {
    throw new Error(`Model download failed with ${response.status}.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, bytes);
  return bytes;
}

async function readOrDownloadModel(modelDir, file) {
  const targetPath = path.join(modelDir, file.name);
  try {
    const stats = await fs.stat(targetPath);
    if (stats.size >= file.minBytes) {
      return fs.readFile(targetPath);
    }
  } catch {
    // Download below.
  }

  await fs.mkdir(modelDir, { recursive: true });
  return downloadFile(file.url, targetPath);
}

async function getPaddleService(rootDir) {
  if (!paddleServicePromise) {
    paddleServicePromise = (async () => {
      const { PaddleOcrService } = require("paddleocr");
      const ort = require("onnxruntime-node");
      const modelDir = path.join(rootDir, "ocr-models", "paddle");
      const [detectionModel, recognitionModel, dictionaryText] = await Promise.all(
        MODEL_FILES.map((file) => readOrDownloadModel(modelDir, file))
      );

      const charactersDictionary = [
        "",
        "",
        ...dictionaryText
          .toString("utf8")
          .split(/\r?\n/)
          .map((entry) => entry.trim())
          .filter(Boolean),
      ];

      return PaddleOcrService.createInstance({
        ort,
        detection: {
          modelBuffer: detectionModel,
          minimumAreaThreshold: 8,
          textPixelThreshold: 0.45,
          dilationKernelSize: 2,
          paddingBoxVertical: 0.35,
          paddingBoxHorizontal: 0.45,
        },
        recognition: {
          modelBuffer: recognitionModel,
          charactersDictionary,
          imageHeight: 48,
        },
      });
    })().catch((error) => {
      paddleServicePromise = null;
      throw error;
    });
  }

  return paddleServicePromise;
}

function splitReadableToken(token) {
  const normalized = token.toLowerCase();
  if (normalized.length < 8 || !/^[a-z]+$/.test(normalized)) return token;

  const scores = new Array(normalized.length + 1).fill(-Infinity);
  const previous = new Array(normalized.length + 1).fill(null);
  scores[0] = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    if (scores[index] === -Infinity) continue;
    for (const word of COMMON_WORDS) {
      if (!normalized.startsWith(word, index)) continue;
      const nextIndex = index + word.length;
      const nextScore = scores[index] + word.length * word.length + (word.length <= 2 ? -2 : 0);
      if (nextScore > scores[nextIndex]) {
        scores[nextIndex] = nextScore;
        previous[nextIndex] = { index, word };
      }
    }
  }

  if (!previous[normalized.length]) return token;

  const parts = [];
  let cursor = normalized.length;
  while (cursor > 0) {
    const match = previous[cursor];
    if (!match) return token;
    parts.unshift(match.word);
    cursor = match.index;
  }

  if (parts.length < 2) return token;
  const rebuilt = parts.join(" ");
  return /^[A-Z]/.test(token) ? rebuilt.replace(/^\w/, (entry) => entry.toUpperCase()) : rebuilt;
}

function restoreGluedEnglish(input) {
  let output = String(input || "")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .replace(/([0-9])\.([A-Za-z])/g, "$1. $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2");

  for (const [pattern, replacement] of PHRASE_REPAIRS) {
    output = output.replace(pattern, replacement);
  }

  output = output
    .split(/(\s+|[^A-Za-z]+)/)
    .map((part) => (/^[A-Za-z]{8,}$/.test(part) ? splitReadableToken(part) : part))
    .join("");

  for (const [pattern, replacement] of PHRASE_REPAIRS) {
    output = output.replace(pattern, replacement);
  }

  return output;
}

function cleanOcrText(input) {
  const repaired = restoreGluedEnglish(input)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[|]/g, " I ")
    .replace(/[\\{}<>~=]+/g, " ")
    .replace(/\b([A-Za-z])\s+(?=[A-Za-z]\b)/g, "$1")
    .replace(/\s+([,.:;!?])/g, "$1")
    .replace(/([,.:;!?])(?=\S)/g, "$1 ")
    .trim();

  const lines = repaired
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/\s+/g, " ")
        .replace(/^[^\w#@]+/, "")
        .replace(/[^\w#@.,:;!?'"%+\-/()]+$/g, "")
        .trim()
    )
    .filter((line) => {
      if (!line) return false;
      const alphaNumeric = (line.match(/[A-Za-z0-9]/g) || []).length;
      const junk = (line.match(/[^A-Za-z0-9\s.,:;!?'"#@&%+\-/()]/g) || []).length;
      if (line.length <= 2 && !/\d/.test(line)) return false;
      return alphaNumeric >= Math.max(2, junk * 3);
    });

  const firstLine = lines[0] || "";
  const firstLineAlphaNumeric = (firstLine.match(/[A-Za-z0-9]/g) || []).length;
  const firstLinePunctuation = (firstLine.match(/[^A-Za-z0-9\s]/g) || []).length;
  const polishedLines =
    lines.length > 1 && (/^[A-Za-z\s'"-]{1,7}$/.test(firstLine) || (firstLineAlphaNumeric <= 7 && firstLinePunctuation >= 2))
      ? lines.slice(1)
      : lines;

  const joined = polishedLines.length ? polishedLines.join("\n") : repaired.replace(/\s+/g, " ");
  return joined
    .replace(/\bwaht\b/gi, "want")
    .replace(/\bcalofies\b/gi, "calories")
    .replace(/\bWimportant\b/g, "important")
    .replace(/\basa\b/gi, "as a")
    .replace(/\bto a tv\b/gi, "to a")
    .replace(/^[A-Z]\s+(?=\d)/, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function cleanlinessScore(text) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return -Infinity;
  const alphaNumeric = (compact.match(/[A-Za-z0-9]/g) || []).length;
  const junk = (compact.match(/[^A-Za-z0-9\s.,:;!?'"#@&%+\-/()]/g) || []).length;
  const words = compact.match(/[A-Za-z]+/g) || [];
  const commonWordHits = words.filter((word) => COMMON_WORDS.has(word.toLowerCase())).length;
  const shortNoise = words.filter((word) => word.length <= 2 && !["a", "as", "i", "if", "is", "to"].includes(word.toLowerCase())).length;
  return alphaNumeric + commonWordHits * 16 - junk * 25 - shortNoise * 10;
}

function scoreOcrCandidate(candidate) {
  const text = candidate.text || "";
  if (!text.trim()) return -Infinity;

  const compact = text.replace(/\s+/g, " ").trim();
  const alphaNumeric = (compact.match(/[A-Za-z0-9]/g) || []).length;
  const junk = (compact.match(/[^A-Za-z0-9\s.,:;!?'"#@&%+\-/()]/g) || []).length;
  const commonWordHits = (compact.toLowerCase().match(/[a-z]+/g) || []).filter((word) => COMMON_WORDS.has(word)).length;
  const impossibleRuns = (compact.match(/[bcdfghjklmnpqrstvwxyz]{6,}/gi) || []).length;
  const lengthPenalty = Math.max(0, compact.length - 180) * 0.65;

  return (candidate.confidence || 0) + alphaNumeric * 0.7 + commonWordHits * 18 - junk * 18 - impossibleRuns * 22 - lengthPenalty;
}

function chooseBestCandidate(candidates) {
  const sorted = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreOcrCandidate(candidate),
      cleanliness: cleanlinessScore(candidate.text),
    }))
    .sort((a, b) => b.score - a.score);

  const best = sorted[0];
  if (!best) {
    return { source: "empty", text: "", confidence: 0 };
  }

  const paddle = sorted.find((candidate) => candidate.source === "paddle");
  if (!paddle || best.source === "paddle") return best;

  const bestIsNoisy =
    best.confidence < 62 ||
    best.text.length > paddle.text.length * 1.4 ||
    best.cleanliness < paddle.cleanliness - 18;

  if (bestIsNoisy && paddle.score >= best.score - 85) return paddle;
  if (paddle.score >= best.score - 70 && paddle.cleanliness >= best.cleanliness - 4) return paddle;

  return best;
}

function buildPaddleText(rawRecognition, service) {
  if (!rawRecognition?.length) return "";
  const processed = service.processRecognition(rawRecognition, { lineMergeThresholdRatio: 0.8 });
  return cleanOcrText(processed.text);
}

function inferPositionFromBoxes(boxes = [], imageHeight = 1920) {
  const usableBoxes = boxes.filter((box) => box?.height && box?.width && box.width * box.height > 500);
  if (!usableBoxes.length) return "bottom";

  const weightedY =
    usableBoxes.reduce((sum, box) => sum + (box.y + box.height / 2) * box.width * box.height, 0) /
    usableBoxes.reduce((sum, box) => sum + box.width * box.height, 0);

  if (weightedY < imageHeight * 0.34) return "top";
  if (weightedY < imageHeight * 0.66) return "center";
  return "bottom";
}

function getTextCropFromBoxes(boxes = [], metadata) {
  const usableBoxes = boxes.filter((box) => box?.height && box?.width && box.width * box.height > 500);
  if (!usableBoxes.length) return null;

  const left = Math.max(0, Math.min(...usableBoxes.map((box) => box.x)) - 72);
  const top = Math.max(0, Math.min(...usableBoxes.map((box) => box.y)) - 72);
  const right = Math.min(metadata.width, Math.max(...usableBoxes.map((box) => box.x + box.width)) + 72);
  const bottom = Math.min(metadata.height, Math.max(...usableBoxes.map((box) => box.y + box.height)) + 72);

  if (right - left < 20 || bottom - top < 20) return null;
  return { left, top, width: right - left, height: bottom - top };
}

async function preprocessForTesseract(imagePath, crop, variant) {
  let pipeline = sharp(imagePath);
  if (crop) pipeline = pipeline.extract(crop);

  const cropWidth = crop?.width || (await sharp(imagePath).metadata()).width || 1080;
  pipeline = pipeline
    .resize({ width: Math.min(Math.max(cropWidth * 3, 1400), 2600), withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen();

  if (variant === "threshold") return pipeline.threshold(145).png().toBuffer();
  if (variant === "soft-threshold") return pipeline.threshold(170).png().toBuffer();
  return pipeline.png().toBuffer();
}

async function runTesseractCandidates(worker, imagePath, crop) {
  const candidates = [];
  const psmModes = ["6", "11"];
  const variants = ["threshold", "normal", "soft-threshold"];

  for (const psmMode of psmModes) {
    await worker.setParameters({
      tessedit_pageseg_mode: psmMode,
      preserve_interword_spaces: "1",
    });

    for (const variant of variants) {
      const imageBuffer = await preprocessForTesseract(imagePath, crop, variant);
      const result = await worker.recognize(imageBuffer);
      const text = cleanOcrText(result.data.text || "");
      if (!text) continue;
      candidates.push({
        source: `tesseract-${crop ? "paddle-crop" : "full"}-${variant}-${psmMode}`,
        text,
        confidence: Math.max(0, Math.round(result.data.confidence || 0)),
      });
    }
  }

  return candidates;
}

async function runPaddleCandidates(rootDir, imagePath) {
  try {
    const service = await getPaddleService(rootDir);
    const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const rawRecognition = await service.recognize(
      {
        width: info.width,
        height: info.height,
        data: new Uint8Array(data),
      },
      {
        ordering: {
          sortByReadingOrder: true,
          sameLineThresholdRatio: 0.45,
        },
      }
    );

    const boxes = rawRecognition.map((entry) => entry.box).filter(Boolean);
    const text = buildPaddleText(rawRecognition, service);
    const confidence = rawRecognition.length
      ? Math.round((rawRecognition.reduce((sum, entry) => sum + (entry.confidence || 0), 0) / rawRecognition.length) * 100)
      : 0;

    return {
      boxes,
      candidate: text ? { source: "paddle", text, confidence } : null,
    };
  } catch (error) {
    console.warn("[ocr] PaddleOCR unavailable; using enhanced Tesseract fallback.", error.message);
    return { boxes: [], candidate: null };
  }
}

async function recognizeSlide({ rootDir, worker, slidePath }) {
  const metadata = await sharp(slidePath).metadata();
  const paddle = await runPaddleCandidates(rootDir, slidePath);
  const crop = getTextCropFromBoxes(paddle.boxes, metadata);
  const candidates = [];

  if (paddle.candidate) candidates.push(paddle.candidate);
  candidates.push(...(await runTesseractCandidates(worker, slidePath, crop)));

  if (!crop) {
    candidates.push(...(await runTesseractCandidates(worker, slidePath, null)));
  }

  const best = chooseBestCandidate(candidates);

  return {
    text: best.text,
    confidence: best.confidence,
    preferredPosition: inferPositionFromBoxes(paddle.boxes, metadata.height || 1920),
    ocrSource: best.source,
  };
}

function createOcrRunner(rootDir) {
  return async function runOcr(slidePaths, runId) {
    const worker = await createWorker("eng", 1, {
      langPath: rootDir,
      cachePath: path.join(rootDir, ".tesseract-cache"),
      gzip: false,
    });

    const slides = [];
    try {
      for (const [index, slidePath] of slidePaths.entries()) {
        const recognized = await recognizeSlide({ rootDir, worker, slidePath });
        slides.push({
          index: index + 1,
          sourceImagePath: slidePath,
          sourceImageUrl: `/runs/${runId}/slides/${path.basename(slidePath)}`,
          ocrEnglish: recognized.text,
          reviewedEnglish: recognized.text,
          confidence: recognized.confidence,
          preferredPosition: recognized.preferredPosition,
          ocrSource: recognized.ocrSource,
          status: "ocr-complete",
          replacementImagePath: "",
          replacementImageUrl: "",
          renderedImagePath: "",
          renderedImageUrl: "",
        });
      }
    } finally {
      await worker.terminate();
    }

    return slides;
  };
}

module.exports = {
  cleanOcrText,
  createOcrRunner,
  restoreGluedEnglish,
  scoreOcrCandidate,
};
