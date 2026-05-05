const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function normalizeBaseUrl(input) {
  const base = String(input || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  if (base.endsWith("/public/v1")) return base;
  return `${base}/public/v1`;
}

function normalizeOrigin(input, fallback) {
  return String(input || fallback || "").trim().replace(/\/+$/, "");
}

function ensureConfigured(baseUrl, apiKey) {
  if (!baseUrl || !apiKey) {
    throw new Error("Configure POSTIZ_URL and POSTIZ_API_KEY before publishing.");
  }
}

async function parseResponse(response, label) {
  if (!response.ok) {
    throw new Error(`${label} failed ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function buildTikTokSettings(overrides = {}) {
  return {
    __type: "tiktok",
    privacy_level: "SELF_ONLY",
    duet: false,
    stitch: false,
    comment: true,
    autoAddMusic: "no",
    brand_content_toggle: false,
    brand_organic_toggle: false,
    video_made_with_ai: false,
    content_posting_method: "UPLOAD",
    ...overrides,
  };
}

function buildPostizAuthorizeUrl({ frontendUrl, clientId, state }) {
  const origin = normalizeOrigin(frontendUrl, "https://platform.postiz.com");
  if (!clientId) throw new Error("Configure POSTIZ_CLIENT_ID before connecting Postiz.");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
  });
  if (state) params.set("state", state);
  return `${origin}/oauth/authorize?${params.toString()}`;
}

async function exchangePostizOAuthCode({ apiUrl, clientId, clientSecret, code, fetchImpl = fetch }) {
  const origin = normalizeOrigin(apiUrl, "https://api.postiz.com");
  if (!clientId || !clientSecret) throw new Error("Configure POSTIZ_CLIENT_ID and POSTIZ_CLIENT_SECRET.");
  if (!code) throw new Error("Missing Postiz OAuth code.");
  const response = await fetchImpl(`${origin}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const payload = await parseResponse(response, "Postiz OAuth token exchange");
  return {
    accessToken: payload.access_token,
    organizationId: payload.id || "",
    customerId: payload.cus || "",
    tokenType: payload.token_type || "bearer",
  };
}

function buildTikTokDraftPayload({ accountId, caption, media = [], date, tags = [], settings = {} }) {
  return {
    type: "draft",
    date: date || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    shortLink: false,
    tags: tags.map((tag) => ({ value: String(tag).replace(/^#/, "") })),
    posts: [
      {
        integration: { id: accountId },
        value: [
          {
            content: caption || "",
            image: media.map((item) => ({ id: item.id, path: item.path })),
          },
        ],
        settings: buildTikTokSettings(settings),
      },
    ],
  };
}

function createPostizClient(config = {}) {
  const baseUrl = normalizeBaseUrl(config.baseUrl || process.env.POSTIZ_URL || "");
  const apiKey = config.apiKey || process.env.POSTIZ_API_KEY || "";
  const fetchImpl = config.fetchImpl || fetch;
  const tokenStore = config.tokenStore;

  async function getAuthToken() {
    if (apiKey) return apiKey;
    const saved = tokenStore ? await tokenStore.loadToken() : null;
    return saved?.accessToken || "";
  }

  async function request(endpoint, options = {}) {
    const authToken = await getAuthToken();
    ensureConfigured(baseUrl, authToken);
    return fetchImpl(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: authToken,
        ...(options.headers || {}),
      },
    });
  }

  async function listIntegrations() {
    return parseResponse(await request("/integrations"), "Postiz integrations");
  }

  async function listTikTokAccounts() {
    const integrations = await listIntegrations();
    return integrations
      .filter((entry) => entry.identifier === "tiktok" && !entry.disabled)
      .map((entry) => ({
        id: entry.id,
        provider: "tiktok",
        name: entry.name || entry.profile || "TikTok",
        handle: entry.profile || "",
        picture: entry.picture || "",
        disabled: Boolean(entry.disabled),
      }));
  }

  async function uploadMediaFile({ filename, contentType = "image/jpeg", buffer }) {
    const authToken = await getAuthToken();
    ensureConfigured(baseUrl, authToken);
    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type: contentType }), filename);
    return parseResponse(
      await fetchImpl(`${baseUrl}/upload`, {
        method: "POST",
        headers: { Authorization: authToken },
        body: formData,
      }),
      "Postiz upload"
    );
  }

  async function uploadLocalFile(filePath) {
    const buffer = await fs.readFile(filePath);
    return uploadMediaFile({
      filename: path.basename(filePath),
      contentType: "image/jpeg",
      buffer,
    });
  }

  async function createTikTokDraft({ accountId, caption, mediaFiles = [], scheduledAt, tags = [], settings = {} }) {
    const uploads = [];
    for (const mediaFile of mediaFiles) {
      if (mediaFile.path) {
        uploads.push(mediaFile);
      } else if (mediaFile.buffer) {
        uploads.push(await uploadMediaFile(mediaFile));
      } else if (mediaFile.filePath) {
        uploads.push(await uploadLocalFile(mediaFile.filePath));
      }
    }

    const payload = buildTikTokDraftPayload({
      accountId,
      caption,
      date: scheduledAt,
      tags,
      media: uploads,
      settings,
    });

    const posts = await parseResponse(
      await request("/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      "Postiz post create"
    );

    return { uploads, posts, payload };
  }

  return {
    baseUrl,
    createTikTokDraft,
    listIntegrations,
    listTikTokAccounts,
    uploadLocalFile,
    uploadMediaFile,
  };
}

module.exports = {
  buildPostizAuthorizeUrl,
  buildTikTokDraftPayload,
  buildTikTokSettings,
  createPostizClient,
  exchangePostizOAuthCode,
  randomOAuthState: () => crypto.randomBytes(16).toString("hex"),
  normalizeBaseUrl,
};
