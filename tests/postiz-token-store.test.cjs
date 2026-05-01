const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createPostizTokenStore } = require("../server/lib/postiz-token-store.cjs");

describe("postiz token store", () => {
  it("persists oauth state and token in the configured root", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "postiz-token-"));
    const store = createPostizTokenStore(rootDir);

    await store.saveState("state-1");
    expect(await store.consumeState("state-1")).toBe(true);
    expect(await store.consumeState("state-1")).toBe(false);

    await store.saveToken({ accessToken: "pos_token", organizationId: "org_1" });
    expect(await store.loadToken()).toMatchObject({ accessToken: "pos_token", organizationId: "org_1" });
  });
});
