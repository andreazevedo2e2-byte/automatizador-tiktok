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

  try {
    await page.goto("https://snaptik.app/pt/download-tiktok-slide", {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

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

async function extractCaptionAndHashtags(sourceUrl) {
  const browser = await launchEphemeralBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(3000);

    const payload = await page.evaluate(() => {
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

      return { caption };
    });

    const caption = String(payload.caption || "").trim();
    return { caption };
  } catch {
    return { caption: "" };
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

module.exports = {
  captureSlidesDirectly,
  captureSlidesViaSnapTik,
  extractCaptionAndHashtags,
  findChromeExecutable,
  launchEphemeralBrowser,
  launchPersistentContext,
};
