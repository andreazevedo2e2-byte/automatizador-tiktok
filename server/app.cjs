require("dotenv").config();

const cors = require("cors");
const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const multer = require("multer");
const JSZip = require("jszip");

const { createAuth } = require("./lib/auth.cjs");
const { compositeSlide, createDefaultLayer, normalizeLayer } = require("./lib/compositor.cjs");
const { createOcrRunner } = require("./lib/ocr.cjs");
const { createRunStore } = require("./lib/run-store.cjs");
const {
  buildCaptionEnglish,
  buildTranslatedSlides,
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

function buildRunResponse(run) {
  return {
    runId: run.runId,
    ownerId: run.ownerId || "",
    projectName: run.projectName || "",
    sourceUrl: run.sourceUrl,
    provider: run.provider,
    stage: run.stage,
    captionEnglish: run.captionEnglish,
    captionPortuguese: run.captionPortuguese,
    hashtags: run.hashtags || [],
    export: run.export || null,
    driveTarget: run.driveTarget || null,
    driveExport: run.driveExport || null,
    slides: run.slides,
  };
}

function normalizeProjectName(value, fallback) {
  const normalized = String(value || "").trim();
  if (normalized) return normalized.slice(0, 120);
  return String(fallback || "Novo projeto").trim().slice(0, 120) || "Novo projeto";
}

function buildSlideLayers(slide) {
  const fallbackText = slide.reviewedEnglish || slide.ocrEnglish || "";
  const fallbackLayer = createDefaultLayer({ text: fallbackText, position: "center" });
  if (!Array.isArray(slide.textLayers) || !slide.textLayers.length) {
    return [fallbackLayer];
  }
  return slide.textLayers.map((layer) =>
    normalizeLayer(
      {
        ...layer,
        align: "center",
        x: 540,
        y: 960,
      },
      { ...fallbackLayer, y: 960 }
    )
  );
}

function normalizeDriveTarget(input = {}) {
  const folderId = String(input.folderId || "").trim();
  const folderName = String(input.folderName || "").trim();
  if (!folderId || !folderName) {
    throw new Error("Escolha uma pasta válida do Google Drive.");
  }
  return {
    folderId,
    folderName,
    savedAt: new Date().toISOString(),
  };
}

function normalizeDriveExport(input = {}) {
  const profileFolderId = String(input.profileFolderId || "").trim();
  const profileFolderName = String(input.profileFolderName || "").trim();
  const postFolderId = String(input.postFolderId || "").trim();
  const postFolderName = String(input.postFolderName || "").trim();
  const files = Array.isArray(input.files)
    ? input.files
        .map((file) => ({
          id: String(file.id || "").trim(),
          name: String(file.name || "").trim(),
          mimeType: String(file.mimeType || "").trim(),
          webViewLink: String(file.webViewLink || "").trim(),
          webContentLink: String(file.webContentLink || "").trim(),
        }))
        .filter((file) => file.id && file.name)
    : [];

  if (!profileFolderId || !profileFolderName || !postFolderId || !postFolderName) {
    throw new Error("O envio para o Google Drive voltou incompleto.");
  }

  return {
    profileFolderId,
    profileFolderName,
    postFolderId,
    postFolderName,
    postFolderUrl: String(input.postFolderUrl || `https://drive.google.com/drive/folders/${postFolderId}`).trim(),
    files,
    exportedAt: new Date().toISOString(),
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
  const isLocalDevOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  const isVercelOrigin = (origin) => {
    try {
      return new URL(origin).hostname.endsWith(".vercel.app");
    } catch {
      return false;
    }
  };

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
  const auth = config.auth || createAuth();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (!allowedOrigins.length || allowedOrigins.includes(origin) || isLocalDevOrigin(origin) || isVercelOrigin(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
    })
  );
  app.use(express.json({ limit: "25mb" }));
  app.use("/runs", express.static(store.runsDir));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mode: "preview-and-drive", headless: isHeadless, remoteLoginUrl, allowDirectFallback });
  });

  app.post("/api/auth/login", (req, res) => {
    const session = auth.authenticate(req.body?.email, req.body?.password);
    if (!session) {
      res.status(401).json({ error: "E-mail ou senha inválidos." });
      return;
    }
    res.json(session);
  });

  app.get("/api/auth/session", auth.requireAuth, (req, res) => {
    res.json({ user: req.auth.user });
  });

  app.get("/api/projects", auth.requireAuth, async (req, res) => {
    try {
      res.json({ items: await store.listRuns(req.auth.user.id) });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load projects." });
    }
  });

  app.get("/api/runs/:runId", auth.requireAuth, async (req, res) => {
    try {
      const run = await store.loadRun(req.params.runId, req.auth.user.id);
      res.json(buildRunResponse(run));
    } catch {
      res.status(404).json({ error: "Run not found." });
    }
  });

  app.delete("/api/runs/:runId", auth.requireAuth, async (req, res) => {
    try {
      await store.deleteRun(req.params.runId, req.auth.user.id);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not delete run." });
    }
  });

  app.post("/api/open-login", auth.requireAuth, async (_req, res) => {
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

  app.post("/api/translate", auth.requireAuth, async (req, res) => {
    try {
      const { texts = [], from = "en", to = "pt" } = req.body || {};
      const translated = await services.translateTexts({ texts, from, to });
      res.json({ translated });
    } catch (error) {
      res.status(400).json({ error: error.message || "Translation failed." });
    }
  });

  app.post("/api/extract", auth.requireAuth, async (req, res) => {
    try {
      const sourceUrl = normalizeTikTokUrl(req.body.url);
      const runId = timestamp();
      await store.ensureRunDirs(runId);

      let slidePaths = [];
      let provider = "snaptik";
      try {
        slidePaths = await services.captureSlidesViaSnapTik(sourceUrl, store.getSlidesDir(runId));
      } catch (snapTikError) {
        if (!allowDirectFallback) {
          throw new Error(
            `A extração automática via SnapTik falhou. ${snapTikError?.message || "Tente novamente ou use OCR via imagens."}`
          );
        }

        provider = "tiktok-direct";
        slidePaths = await services.captureSlidesDirectly({
          sourceUrl,
          slidesDir: store.getSlidesDir(runId),
          sharedBrowserContext,
        });
      }

      const slides = await services.runOcr(slidePaths, runId);
      const slideTranslations = await services.translateTexts({
        texts: slides.map((slide) => slide.ocrEnglish),
        from: "en",
        to: "pt",
      });
      const localizedSlides = buildTranslatedSlides(slides, slideTranslations);

      const { caption: rawCaption = "", hashtags: extractedHashtags = [] } = await services.extractCaptionAndHashtags(sourceUrl);
      const captionEnglish = buildCaptionEnglish(rawCaption);
      const [captionPortuguese = ""] = captionEnglish
        ? await services.translateTexts({ texts: [captionEnglish], from: "en", to: "pt" })
        : [""];

      const defaultProjectName = normalizeProjectName(req.body?.projectName, captionPortuguese || captionEnglish || sourceUrl);
      const run = {
        runId,
        ownerId: req.auth.user.id,
        projectName: defaultProjectName,
        sourceUrl,
        provider,
        stage: "review",
        captionEnglish,
        captionPortuguese,
        hashtags: normalizeHashtags([...splitHashtags(captionEnglish), ...extractedHashtags]),
        export: null,
        driveTarget: null,
        driveExport: null,
        slides: localizedSlides,
      };

      await store.saveRun(run);
      res.json(buildRunResponse(run));
    } catch (error) {
      res.status(400).json({ error: error.message || "Extraction failed." });
    }
  });

  app.post("/api/ocr-upload", auth.requireAuth, upload.array("slides", 30), async (req, res) => {
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
        ownerId: req.auth.user.id,
        projectName: normalizeProjectName(req.body?.projectName, "Novo projeto por imagens"),
        sourceUrl: "local-upload",
        provider: "upload",
        stage: "review",
        captionEnglish: "",
        captionPortuguese: "",
        hashtags: [],
        export: null,
        driveTarget: null,
        driveExport: null,
        slides: buildTranslatedSlides(slides, slideTranslations),
      };

      await store.saveRun(run);
      res.json(buildRunResponse(run));
    } catch (error) {
      res.status(400).json({ error: error.message || "Upload OCR failed." });
    }
  });

  app.put("/api/runs/:runId/meta", auth.requireAuth, async (req, res) => {
    try {
      const run = await store.loadRun(req.params.runId, req.auth.user.id);
      const nextRun = {
        ...run,
        projectName: normalizeProjectName(req.body?.projectName, run.projectName || run.captionPortuguese || run.captionEnglish || run.sourceUrl),
      };
      await store.saveRun(nextRun);
      res.json(buildRunResponse(nextRun));
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not save project metadata." });
    }
  });

  app.put("/api/runs/:runId/review", auth.requireAuth, async (req, res) => {
    try {
      const { slides = [], captionEnglish = "", captionPortuguese = "", hashtags = [] } = req.body || {};
      const run = await store.loadRun(req.params.runId, req.auth.user.id);
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

  app.post("/api/runs/:runId/reconcile-review", auth.requireAuth, async (req, res) => {
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

  app.post("/api/runs/:runId/replacements", auth.requireAuth, upload.array("images", 30), async (req, res) => {
    try {
      const run = await store.loadRun(req.params.runId, req.auth.user.id);
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

  app.post("/api/runs/:runId/slides/:index/replacement", auth.requireAuth, upload.single("image"), async (req, res) => {
    try {
      const run = await store.loadRun(req.params.runId, req.auth.user.id);
      const slideIndex = Number(req.params.index);
      if (!Number.isInteger(slideIndex) || slideIndex < 1) throw new Error("Slide inválido.");
      const slide = run.slides.find((entry) => entry.index === slideIndex);
      if (!slide) throw new Error("Slide não encontrado.");
      if (!req.file) throw new Error("Envie uma imagem para trocar o fundo.");

      const extension = path.extname(req.file.originalname || "") || ".jpg";
      const uploadPath = path.join(store.getUploadsDir(run.runId), `replacement-${String(slideIndex).padStart(2, "0")}${extension}`);
      await fs.writeFile(uploadPath, req.file.buffer);

      const nextSlides = run.slides.map((entry) =>
        entry.index === slideIndex
          ? {
              ...entry,
              replacementImagePath: uploadPath,
              replacementImageUrl: `/runs/${run.runId}/uploads/${path.basename(uploadPath)}`,
              status: "image-ready",
            }
          : entry
      );

      const nextRun = { ...run, slides: nextSlides };
      await store.saveRun(nextRun);
      res.json(buildRunResponse(nextRun));
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not replace slide background." });
    }
  });

  app.post("/api/runs/:runId/render", auth.requireAuth, async (req, res) => {
    try {
      const run = await store.loadRun(req.params.runId, req.auth.user.id);
      const missingImage = run.slides.find((slide) => !slide.replacementImagePath);
      if (missingImage) {
        throw new Error("Upload all replacement images before rendering.");
      }

      const nextSlides = [];
      for (const [index, slide] of run.slides.entries()) {
        const imageBuffer = await fs.readFile(slide.replacementImagePath);
        const outputPath = path.join(store.getRenderedDir(run.runId), `slide-${String(index + 1).padStart(2, "0")}.jpg`);
        const textLayers = buildSlideLayers(slide);
        await compositeSlide({
          imageBuffer,
          text: slide.reviewedEnglish || slide.ocrEnglish,
          outputPath,
          position: "center",
          textLayers,
        });

        nextSlides.push({
          ...slide,
          textLayers,
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

  app.put("/api/runs/:runId/slides/:index/layers", auth.requireAuth, async (req, res) => {
    try {
      const run = await store.loadRun(req.params.runId, req.auth.user.id);
      const slideIndex = Number(req.params.index);
      if (!Number.isInteger(slideIndex) || slideIndex < 1) throw new Error("Slide inválido.");
      const layers = Array.isArray(req.body?.layers) ? req.body.layers : [];
      if (!layers.length) throw new Error("Envie pelo menos uma camada de texto.");

      const nextSlides = run.slides.map((slide) => {
        if (slide.index !== slideIndex) return slide;
        const normalized = buildSlideLayers({ ...slide, textLayers: layers });
        return {
          ...slide,
          textLayers: normalized,
          status: slide.renderedImagePath ? "render-ready" : slide.status,
        };
      });

      const nextRun = {
        ...run,
        stage: run.stage === "publish" ? "preview" : run.stage,
        slides: nextSlides,
      };

      await store.saveRun(nextRun);
      res.json(buildRunResponse(nextRun));
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not save text layers." });
    }
  });

  app.put("/api/runs/:runId/drive-target", auth.requireAuth, async (req, res) => {
    try {
      const run = await store.loadRun(req.params.runId, req.auth.user.id);
      const driveTarget = normalizeDriveTarget(req.body || {});
      const nextRun = {
        ...run,
        stage: "publish",
        driveTarget,
      };
      await store.saveRun(nextRun);
      res.json(buildRunResponse(nextRun));
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not save the Drive folder." });
    }
  });

  app.put("/api/runs/:runId/drive-export", auth.requireAuth, async (req, res) => {
    try {
      const run = await store.loadRun(req.params.runId, req.auth.user.id);
      const driveExport = normalizeDriveExport(req.body || {});
      const nextRun = {
        ...run,
        stage: "publish",
        driveTarget: {
          folderId: driveExport.profileFolderId,
          folderName: driveExport.profileFolderName,
          savedAt: new Date().toISOString(),
        },
        driveExport,
      };
      await store.saveRun(nextRun);
      res.json(buildRunResponse(nextRun));
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not save the Drive export." });
    }
  });

  app.get("/api/runs/:runId/slides/:index/download", auth.requireAuth, async (req, res) => {
    try {
      const run = await store.loadRun(req.params.runId, req.auth.user.id);
      const slide = run.slides.find((entry) => entry.index === Number(req.params.index));
      if (!slide?.renderedImagePath) {
        throw new Error("Rendered slide not found.");
      }
      res.download(slide.renderedImagePath, path.basename(slide.renderedImagePath));
    } catch (error) {
      res.status(404).json({ error: error.message || "Download unavailable." });
    }
  });

  app.get("/api/runs/:runId/export.zip", auth.requireAuth, async (req, res) => {
    try {
      const run = await store.loadRun(req.params.runId, req.auth.user.id);
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
          },
          null,
          2
        )
      );

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${run.runId}.zip"`);
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
