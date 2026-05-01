require("dotenv").config();

const cors = require("cors");
const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const multer = require("multer");
const JSZip = require("jszip");
const { createWorker } = require("tesseract.js");

const { compositeSlide } = require("./lib/compositor.cjs");
const { createRunStore } = require("./lib/run-store.cjs");
const {
  buildCaptionEnglish,
  buildTranslatedSlides,
  getSlidePosition,
  inferTextPositionFromOcrWords,
  normalizeHashtags,
  normalizeTikTokUrl,
  splitHashtags,
  timestamp,
} = require("./lib/text-tools.cjs");
const {
  captureSlidesDirectly,
  captureSlidesViaSnapTik,
  extractCaptionAndHashtags,
  launchPersistentContext,
} = require("./lib/tiktok.cjs");
const { translateTexts } = require("./lib/translate.cjs");

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
        const result = await worker.recognize(slidePath);
        slides.push({
          index: index + 1,
          sourceImagePath: slidePath,
          sourceImageUrl: `/runs/${runId}/slides/${path.basename(slidePath)}`,
          ocrEnglish: (result.data.text || "").trim(),
          reviewedEnglish: (result.data.text || "").trim(),
          confidence: Math.round(result.data.confidence || 0),
          preferredPosition: inferTextPositionFromOcrWords(result.data.words || []),
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

function buildRunResponse(run) {
  return {
    runId: run.runId,
    sourceUrl: run.sourceUrl,
    provider: run.provider,
    stage: run.stage,
    captionEnglish: run.captionEnglish,
    captionPortuguese: run.captionPortuguese,
    hashtags: run.hashtags || [],
    export: run.export || null,
    slides: run.slides,
  };
}

function createApp(config = {}) {
  const app = express();
  const rootDir = config.rootDir || path.resolve(__dirname, "..");
  const store = config.store || createRunStore(rootDir);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
  const port = Number(process.env.PORT || 4141);
  const host = process.env.HOST || "0.0.0.0";
  const profileDir = path.join(rootDir, "browser-profile");
  const isHeadless = String(process.env.HEADLESS || "false").toLowerCase() === "true";
  const remoteLoginUrl = (process.env.REMOTE_LOGIN_URL || "").trim();
  const allowDirectFallback = String(process.env.ALLOW_TIKTOK_DIRECT_FALLBACK || "false").toLowerCase() === "true";
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const services = {
    extractCaptionAndHashtags,
    captureSlidesDirectly,
    captureSlidesViaSnapTik,
    translateTexts,
    runOcr: createOcrRunner(rootDir),
    ...config.services,
  };

  const sharedBrowserContext = {
    current: null,
    profileDir,
    isHeadless,
  };

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (!allowedOrigins.length || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("CORS blocked for this origin."));
      },
    })
  );
  app.use(express.json({ limit: "25mb" }));
  app.use("/runs", express.static(store.runsDir));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mode: "preview-and-zip", headless: isHeadless, remoteLoginUrl, allowDirectFallback });
  });

  app.get("/api/runs/:runId", async (req, res) => {
    try {
      const run = await store.loadRun(req.params.runId);
      res.json(buildRunResponse(run));
    } catch {
      res.status(404).json({ error: "Run not found." });
    }
  });

  app.post("/api/open-login", async (_req, res) => {
    try {
      if (!sharedBrowserContext.current) {
        sharedBrowserContext.current = await launchPersistentContext(profileDir, isHeadless);
        sharedBrowserContext.current.on("close", () => {
          sharedBrowserContext.current = null;
        });
      }
      const page = sharedBrowserContext.current.pages()[0] || (await sharedBrowserContext.current.newPage());
      await page.goto("https://www.tiktok.com/login", { waitUntil: "domcontentloaded", timeout: 90000 });
      res.json({
        ok: true,
        message: remoteLoginUrl
          ? "A janela remota do TikTok está pronta para login."
          : "Navegador de login preparado.",
        remoteLoginUrl,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not open login browser." });
    }
  });

  app.post("/api/translate", async (req, res) => {
    try {
      const { texts = [], from = "en", to = "pt" } = req.body || {};
      const translated = await services.translateTexts({ texts, from, to });
      res.json({ translated });
    } catch (error) {
      res.status(400).json({ error: error.message || "Translation failed." });
    }
  });

  app.post("/api/extract", async (req, res) => {
    try {
      const sourceUrl = normalizeTikTokUrl(req.body.url);
      const runId = timestamp();
      await store.ensureRunDirs(runId);

      let slidePaths = [];
      let provider = "snaptik";
      try {
        slidePaths = await services.captureSlidesViaSnapTik(sourceUrl, store.getSlidesDir(runId));
      } catch (snapTikError) {
        console.error("[extract] SnapTik failed", snapTikError);

        if (!allowDirectFallback) {
          throw new Error(
            `A extração automática via SnapTik falhou. ${snapTikError?.message || "Tente novamente ou use OCR via imagens."}`
          );
        }

        provider = "tiktok-direct";

        try {
          slidePaths = await services.captureSlidesDirectly({
            sourceUrl,
            slidesDir: store.getSlidesDir(runId),
            sharedBrowserContext,
          });
        } catch (directError) {
          console.error("[extract] TikTok direct fallback failed", directError);
          throw new Error(
            `SnapTik falhou (${snapTikError?.message || "sem detalhe"}) e o fallback direto do TikTok também falhou (${directError?.message || "sem detalhe"}).`
          );
        }
      }

      const slides = await services.runOcr(slidePaths, runId);
      const slideTranslations = await services.translateTexts({
        texts: slides.map((slide) => slide.ocrEnglish),
        from: "en",
        to: "pt",
      });
      const localizedSlides = buildTranslatedSlides(slides, slideTranslations);

      const { caption: rawCaption = "" } = await services.extractCaptionAndHashtags(sourceUrl);
      const captionEnglish = buildCaptionEnglish(rawCaption);
      const [captionPortuguese = ""] = captionEnglish
        ? await services.translateTexts({ texts: [captionEnglish], from: "en", to: "pt" })
        : [""];

      const run = {
        runId,
        sourceUrl,
        provider,
        stage: "review",
        captionEnglish,
        captionPortuguese,
        hashtags: splitHashtags(captionEnglish),
        export: null,
        slides: localizedSlides,
      };

      await store.saveRun(run);
      res.json(buildRunResponse(run));
    } catch (error) {
      console.error("[extract] request failed", error);
      res.status(400).json({ error: error.message || "Extraction failed." });
    }
  });

  app.post("/api/ocr-upload", upload.array("slides", 30), async (req, res) => {
    try {
      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) throw new Error("Upload at least one slide image.");

      const runId = timestamp();
      await store.ensureRunDirs(runId);

      const slidePaths = [];
      for (const [index, file] of files.entries()) {
        const extension = path.extname(file.originalname || "") || ".png";
        const slidePath = path.join(store.getSlidesDir(runId), `slide-${String(index + 1).padStart(2, "0")}${extension}`);
        await fs.writeFile(slidePath, file.buffer);
        slidePaths.push(slidePath);
      }

      const slides = await services.runOcr(slidePaths, runId);
      const slideTranslations = await services.translateTexts({
        texts: slides.map((slide) => slide.ocrEnglish),
        from: "en",
        to: "pt",
      });

      const run = {
        runId,
        sourceUrl: "local-upload",
        provider: "upload",
        stage: "review",
        captionEnglish: "",
        captionPortuguese: "",
        hashtags: [],
        export: null,
        slides: buildTranslatedSlides(slides, slideTranslations),
      };

      await store.saveRun(run);
      res.json(buildRunResponse(run));
    } catch (error) {
      res.status(400).json({ error: error.message || "Upload OCR failed." });
    }
  });

  app.put("/api/runs/:runId/review", async (req, res) => {
    try {
      const { slides = [], captionEnglish = "", captionPortuguese = "", hashtags = [] } = req.body || {};
      const run = await store.loadRun(req.params.runId);
      const slideMap = new Map(slides.map((slide) => [Number(slide.index), slide]));

      const nextSlides = run.slides.map((slide) => {
        const incoming = slideMap.get(slide.index);
        if (!incoming) return slide;
        return {
          ...slide,
          reviewedEnglish: String(incoming.reviewedEnglish ?? slide.reviewedEnglish ?? "").trim(),
          reviewedPortuguese: String(incoming.reviewedPortuguese ?? slide.reviewedPortuguese ?? "").trim(),
          status: "reviewed",
        };
      });

      const nextRun = {
        ...run,
        stage: "images",
        captionEnglish: String(captionEnglish ?? run.captionEnglish ?? "").trim(),
        captionPortuguese: String(captionPortuguese ?? run.captionPortuguese ?? "").trim(),
        hashtags: normalizeHashtags(hashtags),
        slides: nextSlides,
      };

      await store.saveRun(nextRun);
      res.json(buildRunResponse(nextRun));
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not save review." });
    }
  });

  app.post("/api/runs/:runId/reconcile-review", async (req, res) => {
    try {
      const { slides = [], captionPortuguese = "" } = req.body || {};
      const slideTexts = slides.map((slide) => String(slide.reviewedPortuguese || ""));
      const translatedSlides = await services.translateTexts({ texts: slideTexts, from: "pt", to: "en" });
      const [translatedCaption = ""] = captionPortuguese
        ? await services.translateTexts({ texts: [captionPortuguese], from: "pt", to: "en" })
        : [""];

      res.json({
        slides: slides.map((slide, index) => ({
          index: slide.index,
          reviewedEnglish: translatedSlides[index] || "",
        })),
        captionEnglish: translatedCaption,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not reconcile translated review." });
    }
  });

  app.post("/api/runs/:runId/replacements", upload.array("images", 30), async (req, res) => {
    try {
      const run = await store.loadRun(req.params.runId);
      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) throw new Error("Upload at least one replacement image.");
      if (files.length !== run.slides.length) {
        throw new Error(`Send exactly ${run.slides.length} image(s) for this slideshow.`);
      }

      const nextSlides = [];
      for (const [index, slide] of run.slides.entries()) {
        const file = files[index];
        const extension = path.extname(file.originalname || "") || ".jpg";
        const uploadPath = path.join(store.getUploadsDir(run.runId), `replacement-${String(index + 1).padStart(2, "0")}${extension}`);
        await fs.writeFile(uploadPath, file.buffer);
        nextSlides.push({
          ...slide,
          replacementImagePath: uploadPath,
          replacementImageUrl: `/runs/${run.runId}/uploads/${path.basename(uploadPath)}`,
          status: "image-ready",
        });
      }

      const nextRun = { ...run, stage: "render", slides: nextSlides };
      await store.saveRun(nextRun);
      res.json(buildRunResponse(nextRun));
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not upload replacement images." });
    }
  });

  app.post("/api/runs/:runId/render", async (req, res) => {
    try {
      const run = await store.loadRun(req.params.runId);
      const missingImage = run.slides.find((slide) => !slide.replacementImagePath);
      if (missingImage) {
        throw new Error("Upload all replacement images before rendering.");
      }

      const nextSlides = [];
      for (const [index, slide] of run.slides.entries()) {
        const imageBuffer = await fs.readFile(slide.replacementImagePath);
        const outputPath = path.join(store.getRenderedDir(run.runId), `slide-${String(index + 1).padStart(2, "0")}.jpg`);
        await compositeSlide({
          imageBuffer,
          text: slide.reviewedEnglish || slide.ocrEnglish,
          outputPath,
          position: slide.preferredPosition || getSlidePosition(index, run.slides.length),
        });

        nextSlides.push({
          ...slide,
          renderedImagePath: outputPath,
          renderedImageUrl: `/runs/${run.runId}/rendered/${path.basename(outputPath)}`,
          status: "rendered",
        });
      }

      const nextRun = {
        ...run,
        stage: "preview",
        slides: nextSlides,
        export: {
          previewReady: true,
          downloadableSlides: nextSlides.map((slide) => slide.renderedImageUrl),
        },
      };

      await store.saveRun(nextRun);
      res.json(buildRunResponse(nextRun));
    } catch (error) {
      res.status(400).json({ error: error.message || "Render failed." });
    }
  });

  app.get("/api/runs/:runId/slides/:index/download", async (req, res) => {
    try {
      const run = await store.loadRun(req.params.runId);
      const slide = run.slides.find((entry) => entry.index === Number(req.params.index));
      if (!slide?.renderedImagePath) {
        throw new Error("Rendered slide not found.");
      }
      res.download(slide.renderedImagePath, path.basename(slide.renderedImagePath));
    } catch (error) {
      res.status(404).json({ error: error.message || "Download unavailable." });
    }
  });

  app.get("/api/runs/:runId/export.zip", async (req, res) => {
    try {
      const run = await store.loadRun(req.params.runId);
      if (!run.slides.every((slide) => slide.renderedImagePath)) {
        throw new Error("Render the slideshow before downloading the ZIP.");
      }

      const zip = new JSZip();
      const slidesFolder = zip.folder("slides");
      for (const slide of run.slides) {
        const bytes = await fs.readFile(slide.renderedImagePath);
        slidesFolder.file(path.basename(slide.renderedImagePath), bytes);
      }
      zip.file("caption.txt", run.captionEnglish || "");
      zip.file("hashtags.txt", (run.hashtags || []).join(" "));
      zip.file(
        "post.json",
        JSON.stringify(
          {
            runId: run.runId,
            sourceUrl: run.sourceUrl,
            captionEnglish: run.captionEnglish,
            captionPortuguese: run.captionPortuguese,
            hashtags: run.hashtags,
            slides: run.slides.map((slide) => ({
              index: slide.index,
              reviewedEnglish: slide.reviewedEnglish,
              reviewedPortuguese: slide.reviewedPortuguese,
              renderedImageUrl: slide.renderedImageUrl,
            })),
            postiz: {
              caption: run.captionEnglish,
              mediaFiles: run.slides.map((slide) => path.basename(slide.renderedImagePath)),
            },
          },
          null,
          2
        )
      );

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename=\"${run.runId}.zip\"`);
      res.send(buffer);
    } catch (error) {
      res.status(400).json({ error: error.message || "ZIP export failed." });
    }
  });

  app.locals.port = port;
  app.locals.host = host;
  return app;
}

module.exports = { createApp, buildRunResponse };
