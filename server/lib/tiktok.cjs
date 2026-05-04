const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

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
      // Ignore missing path.
    }
  }

  return null;
}

async function launchEphemeralBrowser() {
  const executablePath = await findChromeExecutable();
  return chromium.launch({
    executablePath: executablePath || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

const snaptikSlidePages = ["https://snaptik.app/pt/download-tiktok-slide", "https://snaptik.app/download-tiktok-slide"];

async function prepareSnapTikPage(page) {
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (["font", "image", "media"].includes(type)) {
      route.abort().catch(() => {});
      return;
    }
    route.continue().catch(() => {});
  });
}

async function gotoSnapTikSlidePage(page) {
  let lastError = null;
  for (const url of snaptikSlidePages) {
    try {
      await page.goto(url, { waitUntil: "commit", timeout: 30000 });
      await page.waitForSelector("#url", { timeout: 20000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("SnapTik did not load.");
}

async function launchPersistentContext(profileDir, isHeadless) {
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

async function captureSlidesViaSnapTik(sourceUrl, slidesDir) {
  const browser = await launchEphemeralBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await prepareSnapTikPage(page);

  try {
    await gotoSnapTikSlidePage(page);

    await page.fill("#url", sourceUrl);
    await page.click('button[type="submit"], input[type="submit"], .button-submit');
    await page.waitForSelector("#download .photo img, #download .download-box", {
      timeout: 30000,
    });
    await page.waitForTimeout(1500);

    const imageUrls = await page.evaluate(() => {
      const urls = [];
      document.querySelectorAll("#download .photo img").forEach((img) => {
        const src = img.getAttribute("src") || "";
        if (src && !urls.includes(src)) urls.push(src);
      });
      return urls;
    });

    if (!imageUrls.length) {
      throw new Error("SnapTik did not return any slideshow images.");
    }

    const slidePaths = [];
    for (const [index, imageUrl] of imageUrls.entries()) {
      try {
        const response = await page.request.get(imageUrl, {
          timeout: 30000,
          headers: {
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          },
        });
        if (!response.ok()) continue;
        const bytes = await response.body();
        if (bytes.length < 5000) continue;
        const slidePath = path.join(slidesDir, `slide-${String(index + 1).padStart(2, "0")}.jpg`);
        await fs.writeFile(slidePath, bytes);
        slidePaths.push(slidePath);
      } catch {
        // Some TikTok CDN hosts intermittently fail DNS or signed-url fetches.
        // Keep going so one bad slide host doesn't kill the whole slideshow run.
      }
    }

    if (!slidePaths.length) {
      throw new Error("SnapTik returned image entries, but download failed.");
    }

    return slidePaths;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function captureSlidesDirectly({ sourceUrl, slidesDir, sharedBrowserContext }) {
  const ownsBrowser = !sharedBrowserContext.current;
  const browserContext = sharedBrowserContext.current || (await launchPersistentContext(sharedBrowserContext.profileDir, sharedBrowserContext.isHeadless));
  if (!sharedBrowserContext.current) {
    sharedBrowserContext.current = browserContext;
    browserContext.on("close", () => {
      sharedBrowserContext.current = null;
    });
  }

  const page = await browserContext.newPage();
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

    return Array.from(urls).filter((url) => !url.includes("avatar") && !url.includes("tos-maliva-avt"));
  });

  const slidePaths = [];
  for (const [index, imageUrl] of [...new Set(detected)].slice(0, 12).entries()) {
    try {
      const response = await page.request.get(imageUrl, { timeout: 30000 });
      if (!response.ok()) continue;
      const bytes = await response.body();
      if (bytes.length < 5000) continue;
      const slidePath = path.join(slidesDir, `slide-${String(index + 1).padStart(2, "0")}.jpg`);
      await fs.writeFile(slidePath, bytes);
      slidePaths.push(slidePath);
    } catch {
      // Ignore locked URLs.
    }
  }

  const needsLogin = await page.evaluate(() => {
    const text = document.body.innerText || "";
    return /log in|sign up|entrar|continue with/i.test(text) || Boolean(document.querySelector('[data-e2e="top-login-button"]'));
  });

  if (slidePaths.length === 0 && needsLogin) {
    throw new Error("TikTok is showing a login/placeholder page. Use Connect TikTok Account only if SnapTik fails.");
  }

  await page.close();
  if (ownsBrowser) {
    await browserContext.close().catch(() => {});
    sharedBrowserContext.current = null;
  }
  return slidePaths;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHashtagCandidates(values = []) {
  const normalized = [];
  for (const value of values) {
    const tag = String(value || "")
      .trim()
      .replace(/^#/, "")
      .replace(/[^\p{L}\p{N}_]/gu, "");
    if (tag && !normalized.includes(`#${tag}`)) normalized.push(`#${tag}`);
  }
  return normalized;
}

function parseCaptionText(rawText) {
  const caption = cleanText(rawText);
  if (!caption) return { caption: "", hashtags: [] };

  const hashMatches = caption.match(/#[\p{L}\p{N}_]+/gu) || [];
  if (hashMatches.length) {
    return { caption, hashtags: normalizeHashtagCandidates(hashMatches) };
  }

  const words = caption.split(/\s+/).filter(Boolean);
  const hasSentencePunctuation = /[.!?]/.test(caption);
  const simpleWords = words.filter((word) => /^[\p{L}\p{N}_]+$/u.test(word));
  const looksLikeOnlyTags =
    words.length >= 2 &&
    words.length <= 18 &&
    !hasSentencePunctuation &&
    simpleWords.length === words.length &&
    words.every((word) => word.length >= 3 || /\d/.test(word));

  if (looksLikeOnlyTags) {
    return { caption: "", hashtags: normalizeHashtagCandidates(words) };
  }

  return { caption, hashtags: [] };
}

function mergeMetadata(...entries) {
  const caption = entries.map((entry) => cleanText(entry?.caption)).find(Boolean) || "";
  const hashtags = normalizeHashtagCandidates(entries.flatMap((entry) => entry?.hashtags || []));
  return { caption, hashtags };
}

async function extractTikTokPublicMetadata(sourceUrl) {
  const browser = await launchEphemeralBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(3000);

    const payload = await page.evaluate(() => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const selectors = [
        '[data-e2e="browse-video-desc"]',
        '[data-e2e="video-desc"]',
        'h1[data-e2e="browse-video-desc"]',
      ];

      let caption = "";
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const text = element?.textContent?.trim();
        if (text) {
          caption = text;
          break;
        }
      }

      if (!caption) {
        const script = document.querySelector("#__UNIVERSAL_DATA_FOR_REHYDRATION__");
        if (script?.textContent?.includes('"canonical"')) {
          const text = script.textContent;
          const match = text.match(/"seo\\.[^"]*desc[^"]*":"([^"]{10,220})"/i);
          if (match) {
            caption = match[1].replace(/\\u002F/g, "/");
          }
        }
      }

      const metaTexts = [];
      document.querySelectorAll('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]').forEach((meta) => {
        const content = clean(meta.getAttribute("content"));
        if (content && !/tiktok - make your day/i.test(content)) metaTexts.push(content);
      });

      const hashtags = new Set();
      const structuredCaptions = [];
      const walk = (value, depth = 0) => {
        if (!value || depth > 7) return;
        if (Array.isArray(value)) {
          value.forEach((item) => walk(item, depth + 1));
          return;
        }
        if (typeof value !== "object") return;
        Object.entries(value).forEach(([key, item]) => {
          if (typeof item === "string") {
            if (/^(desc|description|caption)$/i.test(key) && clean(item).length > 4) structuredCaptions.push(clean(item));
            if (/hashtag/i.test(key)) hashtags.add(item);
          } else if (item && typeof item === "object") {
            if (typeof item.hashtagName === "string") hashtags.add(item.hashtagName);
            walk(item, depth + 1);
          }
        });
      };

      document.querySelectorAll('script[type="application/ld+json"], #__UNIVERSAL_DATA_FOR_REHYDRATION__').forEach((script) => {
        try {
          walk(JSON.parse(script.textContent || "{}"));
        } catch {
        }
      });

      return {
        caption: caption || structuredCaptions.find((entry) => !/tiktok/i.test(entry)) || metaTexts.find(Boolean) || "",
        hashtags: Array.from(hashtags),
      };
    });

    const parsed = mergeMetadata(parseCaptionText(payload.caption), { hashtags: payload.hashtags });
    const caption = /^(legenda|caption|description)$/i.test(parsed.caption) ? "" : parsed.caption;
    const hashtags = parsed.hashtags.filter((tag) => {
      const body = tag.slice(1).toLowerCase();
      if (body.length < 3 || body.length > 32) return false;
      return !/(hashtag|tagtext|tiktok|vídeo|video|procurando|integrar|visite|popular|localizar)/i.test(body);
    });
    return { caption, hashtags };
  } catch {
    return { caption: "", hashtags: [] };
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function extractTikTokOEmbedMetadata(sourceUrl) {
  try {
    const response = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(sourceUrl)}`, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!response.ok) return { caption: "", hashtags: [] };
    const payload = await response.json();
    return parseCaptionText(payload.title || "");
  } catch {
    return { caption: "", hashtags: [] };
  }
}

async function extractSnapTikMetadata(sourceUrl) {
  const browser = await launchEphemeralBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await prepareSnapTikPage(page);

  try {
    await gotoSnapTikSlidePage(page);

    await page.fill("#url", sourceUrl);
    await page.click('button[type="submit"], input[type="submit"], .button-submit');
    await page.waitForSelector("#download .download-box, #download .photo img", {
      timeout: 45000,
    });
    await page.waitForTimeout(1000);

    const payload = await page.evaluate(() => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const title =
        clean(document.querySelector("#download .video-title")?.textContent) ||
        clean(document.querySelector("#download .info")?.textContent) ||
        "";
      const downloadText = clean(document.querySelector("#download")?.textContent || "");
      return { title, downloadText };
    });

    return parseCaptionText(payload.title || payload.downloadText);
  } catch {
    return { caption: "", hashtags: [] };
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function extractCaptionAndHashtags(sourceUrl) {
  const publicMetadata = await extractTikTokPublicMetadata(sourceUrl);
  if (publicMetadata.caption || publicMetadata.hashtags.length) return publicMetadata;

  const oEmbedMetadata = await extractTikTokOEmbedMetadata(sourceUrl);
  if (oEmbedMetadata.caption || oEmbedMetadata.hashtags.length) return oEmbedMetadata;

  return extractSnapTikMetadata(sourceUrl);
}

module.exports = {
  captureSlidesDirectly,
  captureSlidesViaSnapTik,
  extractCaptionAndHashtags,
  extractSnapTikMetadata,
  findChromeExecutable,
  launchEphemeralBrowser,
  launchPersistentContext,
};
