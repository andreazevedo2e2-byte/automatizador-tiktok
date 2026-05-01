const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");
const { createApp } = require("../server/app.cjs");

describe("cors", () => {
  const previousAllowedOrigins = process.env.ALLOWED_ORIGINS;

  afterEach(() => {
    if (previousAllowedOrigins === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = previousAllowedOrigins;
    }
  });

  it("allows Vercel and local browser origins when the app is locked down", async () => {
    process.env.ALLOWED_ORIGINS = "https://automatizador-tiktok.vercel.app";
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "tt-cors-"));
    const app = createApp({ rootDir, publishStoreConfig: { disableSupabase: true } });

    await request(app)
      .get("/api/health")
      .set("Origin", "http://127.0.0.1:5173")
      .expect("access-control-allow-origin", "http://127.0.0.1:5173")
      .expect(200);

    await request(app)
      .get("/api/health")
      .set("Origin", "https://automatizador-tiktok.vercel.app")
      .expect("access-control-allow-origin", "https://automatizador-tiktok.vercel.app")
      .expect(200);
  });
});
