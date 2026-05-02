const request = require("supertest");
const { createApp } = require("../server/app.cjs");

describe("postiz status", () => {
  const previousApiKey = process.env.POSTIZ_API_KEY;
  const previousClientId = process.env.POSTIZ_CLIENT_ID;
  const previousClientSecret = process.env.POSTIZ_CLIENT_SECRET;

  afterEach(() => {
    process.env.POSTIZ_API_KEY = previousApiKey;
    process.env.POSTIZ_CLIENT_ID = previousClientId;
    process.env.POSTIZ_CLIENT_SECRET = previousClientSecret;
  });

  it("reports self-hosted api-key mode and blocks oauth start", async () => {
    process.env.POSTIZ_API_KEY = "pos_self_hosted_key";
    process.env.POSTIZ_CLIENT_ID = "cloud_client_id";
    process.env.POSTIZ_CLIENT_SECRET = "cloud_client_secret";

    const app = createApp();

    const status = await request(app).get("/api/postiz/status").expect(200);
    expect(status.body.mode).toBe("api-key");
    expect(status.body.usingSelfHostedApiKey).toBe(true);
    expect(status.body.canStartOAuth).toBe(false);

    const oauthStart = await request(app).get("/api/postiz/oauth/start").expect(409);
    expect(oauthStart.body.error).toContain("POSTIZ_API_KEY");
  });
});
