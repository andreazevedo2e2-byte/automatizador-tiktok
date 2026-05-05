const {
  createPostizClient,
  buildTikTokDraftPayload,
  buildPostizAuthorizeUrl,
  exchangePostizOAuthCode,
} = require("../server/lib/postiz-client.cjs");

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("postiz client", () => {
  it("lists only active TikTok integrations", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        { id: "tt-1", identifier: "tiktok", name: "One", profile: "one", disabled: false },
        { id: "x-1", identifier: "x", name: "X", profile: "x", disabled: false },
        { id: "tt-2", identifier: "tiktok", name: "Two", profile: "two", disabled: true },
      ])
    );
    const client = createPostizClient({ baseUrl: "https://postiz.test", apiKey: "key", fetchImpl });

    const accounts = await client.listTikTokAccounts();

    expect(accounts).toEqual([
      {
        id: "tt-1",
        provider: "tiktok",
        name: "One",
        handle: "one",
        picture: "",
        disabled: false,
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith("https://postiz.test/public/v1/integrations", {
      headers: { Authorization: "key" },
    });
  });

  it("uploads media and creates a safe TikTok draft payload", async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init = {}) => {
      calls.push({ url, init });
      if (String(url).endsWith("/upload")) {
        return jsonResponse({ id: `media-${calls.length}`, path: `https://cdn.test/${calls.length}.jpg`, name: "slide.jpg" });
      }
      return jsonResponse([{ postId: "post-1", integration: "tt-1" }]);
    });
    const client = createPostizClient({ baseUrl: "https://postiz.test/public/v1", apiKey: "key", fetchImpl });

    const result = await client.createTikTokDraft({
      accountId: "tt-1",
      caption: "caption #tag",
      tags: ["fitness", "edited"],
      scheduledAt: "2026-05-01T18:00:00.000Z",
      mediaFiles: [
        { filename: "slide-01.jpg", contentType: "image/jpeg", buffer: Buffer.from("one") },
        { filename: "slide-02.jpg", contentType: "image/jpeg", buffer: Buffer.from("two") },
      ],
    });

    expect(result.uploads).toHaveLength(2);
    expect(result.posts).toEqual([{ postId: "post-1", integration: "tt-1" }]);
    expect(calls[2].url).toBe("https://postiz.test/public/v1/posts");
    expect(JSON.parse(calls[2].init.body)).toEqual(
      buildTikTokDraftPayload({
        accountId: "tt-1",
        caption: "caption #tag",
        date: "2026-05-01T18:00:00.000Z",
        tags: ["fitness", "edited"],
        media: [
          { id: "media-1", path: "https://cdn.test/1.jpg" },
          { id: "media-2", path: "https://cdn.test/2.jpg" },
        ],
      })
    );
  });

  it("builds OAuth authorize URL and exchanges code for a pos token", async () => {
    const authorizeUrl = buildPostizAuthorizeUrl({
      frontendUrl: "https://platform.postiz.com",
      clientId: "pca_123",
      state: "state-1",
    });
    expect(authorizeUrl).toBe("https://platform.postiz.com/oauth/authorize?client_id=pca_123&response_type=code&state=state-1");

    const fetchImpl = vi.fn(async () => jsonResponse({ access_token: "pos_token", id: "org_1" }));
    const token = await exchangePostizOAuthCode({
      apiUrl: "https://api.postiz.com",
      clientId: "pca_123",
      clientSecret: "pcs_secret",
      code: "abc",
      fetchImpl,
    });

    expect(token.accessToken).toBe("pos_token");
    expect(fetchImpl).toHaveBeenCalledWith("https://api.postiz.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: "abc",
        client_id: "pca_123",
        client_secret: "pcs_secret",
      }),
    });
  });
});
