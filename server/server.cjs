require("dotenv").config();

const cors = require("cors");
const express = require("express");
const fs = require("node:fs/promises");
const multer = require("multer");
const path = require("node:path");
const { chromium } = require("playwright");
const { createWorker } = require("tesseract.js");

const app = express();
const port = Number(process.env.PORT || 4141);
const host = process.env.HOST || "0.0.0.0";
const rootDir = path.resolve(__dirname, "..");
const runsDir = path.join(rootDir, "runs");
const profileDir = path.join(rootDir, "browser-profile");
const isHeadless = String(process.env.HEADLESS || "false").toLowerCase() === "true";
const remoteLoginUrl = (process.env.REMOTE_LOGIN_URL || "").trim();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

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
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
let sharedBrowserContext = null;

async function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next installed browser path.
    }
  }
  return null;
}

async function launchBrowserContext() {
  const executablePath = await findChromeExecutable();
  return chromium.launchPersistentContext(profileDir, {
    executablePath: executablePath || undefined,
    headless: isHeadless,
    viewport: { width: 1320, height: 920 },
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function normalizeTikTokUrl(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("tiktok.com")) {
      throw new Error("Only TikTok URLs are supported.");
    }
    return parsed.toString();
  } catch (error) {
    throw new Error("Invalid TikTok URL.");
  }
}

async function ensureRunDir(runId) {
  const runDir = path.join(runsDir, runId);
  await fs.mkdir(path.join(runDir, "slides"), { recursive: true });
  return runDir;
}

async function captureSlides(sourceUrl, runDir) {
  const ownsBrowser = !sharedBrowserContext;
  const browser = sharedBrowserContext || (await launchBrowserContext());
  const page = await browser.newPage();
  await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(8000);

  const detected = await page.evaluate(() => {
    const urls = new Set();
    const add = (value) => {
      if (!value || typeof value !== "string") return;
      const cleaned = value.replace(/&amp;/g, "&");
      if (cleaned.includes("tiktokcdn") || cleaned.includes("p16-") || cleaned.includes("p19-")) {
        urls.add(cleaned);
      }
    };

    document.querySelectorAll("img").forEach((img) => {
      add(img.currentSrc || img.src);
      if (img.srcset) {
        img.srcset.split(",").forEach((part) => add(part.trim().split(/\s+/)[0]));
      }
    });

    const scripts = Array.from(document.querySelectorAll("script"))
      .map((script) => script.textContent || "")
      .join("\n");
    const matches = scripts.match(/https:\\\/\\\/[^"\\]+(?:tiktokcdn|p16-|p19-)[^"\\]+/g) || [];
    matches.forEach((match) => add(match.replace(/\\u002F/g, "/").replace(/\\\//g, "/")));

    return Array.from(urls).filter((url) => !url.includes("avatar") && !url.includes("tos-maliva-avt"));
  });

  const slidePaths = [];
  const uniqueUrls = [...new Set(detected)].slice(0, 12);

  for (const [index, imageUrl] of uniqueUrls.entries()) {
    try {
      const response = await page.request.get(imageUrl, { timeout: 30000 });
      if (!response.ok()) continue;
      const bytes = await response.body();
      if (bytes.length < 5000) continue;
      const slidePath = path.join(runDir, "slides", `slide-${String(index + 1).padStart(2, "0")}.jpg`);
      await fs.writeFile(slidePath, bytes);
      slidePaths.push(slidePath);
    } catch {
      // Skip images that TikTok signs too tightly for direct download.
    }
  }

  const needsLogin = await page.evaluate(() => {
    const text = document.body.innerText || "";
    return /log in|sign up|entrar|continue with/i.test(text) || Boolean(document.querySelector('[data-e2e="top-login-button"]'));
  });

  if (slidePaths.length === 0 && needsLogin) {
    const screenshotPath = path.join(runDir, "slides", "slide-01.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.close();
    if (ownsBrowser) await browser.close();
    throw new Error("TikTok is showing a login/placeholder page. Click Open Login Browser, log in, then run Extract Text again.");
  }

  if (slidePaths.length === 0) {
    const screenshotPath = path.join(runDir, "slides", "slide-01.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    slidePaths.push(screenshotPath);
  }

  await page.close();
  if (ownsBrowser) await browser.close();
  return slidePaths;
}

async function runOcr(slidePaths) {
  const worker = await createWorker("eng");
  const slides = [];
  try {
    for (const [index, slidePath] of slidePaths.entries()) {
      const result = await worker.recognize(slidePath);
      slides.push({
        slide: index + 1,
        imagePath: slidePath,
        imageUrl: `/runs/${path.basename(path.dirname(path.dirname(slidePath)))}/slides/${path.basename(slidePath)}`,
        text: (result.data.text || "").trim(),
        confidence: Math.round(result.data.confidence || 0),
      });
    }
  } finally {
    await worker.terminate();
  }
  return slides;
}

app.use("/runs", express.static(runsDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: "extract-only", headless: isHeadless, remoteLoginUrl });
});

app.post("/api/open-login", async (_req, res) => {
  try {
    if (!sharedBrowserContext) {
      sharedBrowserContext = await launchBrowserContext();
      sharedBrowserContext.on("close", () => {
        sharedBrowserContext = null;
      });
    }
    const page = sharedBrowserContext.pages()[0] || (await sharedBrowserContext.newPage());
    await page.goto("https://www.tiktok.com/login", { waitUntil: "domcontentloaded", timeout: 90000 });
    res.json({
      ok: true,
      message: remoteLoginUrl
        ? "TikTok login is ready. Open the remote login window, sign in there once, then use Extract Text."
        : "Login browser opened. Log in there, then run Extract Text again.",
      remoteLoginUrl,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not open login browser." });
  }
});

app.post("/api/extract", async (req, res) => {
  try {
    const sourceUrl = normalizeTikTokUrl(req.body.url);
    const runId = timestamp();
    const runDir = await ensureRunDir(runId);
    const slidePaths = await captureSlides(sourceUrl, runDir);
    const slides = await runOcr(slidePaths);
    const payload = {
      runId,
      sourceUrl,
      slides,
      combinedText: slides.map((slide) => `Slide ${slide.slide}\n${slide.text}`).join("\n\n"),
    };
    await fs.writeFile(path.join(runDir, "ocr.json"), JSON.stringify(payload, null, 2));
    res.json(payload);
  } catch (error) {
    res.status(400).json({ error: error.message || "Extraction failed." });
  }
});

app.post("/api/ocr-upload", upload.array("slides", 30), async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) throw new Error("Upload at least one slide image.");

    const runId = timestamp();
    const runDir = await ensureRunDir(runId);
    const slidePaths = [];

    for (const [index, file] of files.entries()) {
      const extension = path.extname(file.originalname || "") || ".png";
      const slidePath = path.join(runDir, "slides", `slide-${String(index + 1).padStart(2, "0")}${extension}`);
      await fs.writeFile(slidePath, file.buffer);
      slidePaths.push(slidePath);
    }

    const slides = await runOcr(slidePaths);
    const payload = {
      runId,
      sourceUrl: "local-upload",
      slides,
      combinedText: slides.map((slide) => `Slide ${slide.slide}\n${slide.text}`).join("\n\n"),
    };
    await fs.writeFile(path.join(runDir, "ocr.json"), JSON.stringify(payload, null, 2));
    res.json(payload);
  } catch (error) {
    res.status(400).json({ error: error.message || "Upload OCR failed." });
  }
});

app.listen(port, host, () => {
  console.log(`Automatizador API running on http://${host}:${port} (headless=${isHeadless})`);
});
