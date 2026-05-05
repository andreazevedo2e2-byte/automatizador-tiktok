const fs = require("node:fs/promises");
const path = require("node:path");

function createPostizTokenStore(rootDir) {
  const dir = path.join(rootDir, "runs", "_secrets");
  const statePath = path.join(dir, "postiz-oauth-state.json");
  const tokenPath = path.join(dir, "postiz-token.json");

  async function ensureDir() {
    await fs.mkdir(dir, { recursive: true });
  }

  async function readJson(filePath, fallback) {
    try {
      return JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch {
      return fallback;
    }
  }

  return {
    async saveState(state) {
      await ensureDir();
      await fs.writeFile(statePath, JSON.stringify({ state, createdAt: new Date().toISOString() }, null, 2));
    },
    async consumeState(state) {
      const current = await readJson(statePath, {});
      if (!state || current.state !== state) return false;
      await fs.rm(statePath, { force: true });
      return true;
    },
    async saveToken(token) {
      await ensureDir();
      const payload = {
        accessToken: token.accessToken,
        organizationId: token.organizationId || "",
        customerId: token.customerId || "",
        createdAt: new Date().toISOString(),
      };
      await fs.writeFile(tokenPath, JSON.stringify(payload, null, 2));
      return payload;
    },
    async loadToken() {
      return readJson(tokenPath, null);
    },
  };
}

module.exports = { createPostizTokenStore };
