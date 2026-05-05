const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const tokenEndpoint = "https://oauth2.googleapis.com/token";
const authEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const driveApi = "https://www.googleapis.com/drive/v3";
const driveUploadApi = "https://www.googleapis.com/upload/drive/v3/files";
const appRootFolderName = "tiktokapp";
const profileFolderNames = ["Perfil 1", "Perfil 2", "Perfil 3"];

function createGoogleDriveStore(rootDir) {
  const tokenPath = path.join(rootDir, "runs", "google-drive-token.json");
  const statePath = path.join(rootDir, "runs", "google-drive-state.json");

  async function writeJson(filePath, payload) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
  }

  return {
    async saveState(state) {
      await writeJson(statePath, { state, createdAt: new Date().toISOString() });
    },
    async consumeState(state) {
      try {
        const payload = JSON.parse(await fs.readFile(statePath, "utf8"));
        await fs.rm(statePath, { force: true });
        return payload.state === state;
      } catch {
        return false;
      }
    },
    async saveToken(token) {
      const current = await this.loadToken();
      await writeJson(tokenPath, { ...current, ...token, updatedAt: new Date().toISOString() });
    },
    async loadToken() {
      try {
        return JSON.parse(await fs.readFile(tokenPath, "utf8"));
      } catch {
        return null;
      }
    },
  };
}

function createGoogleDriveClient({ rootDir, store = createGoogleDriveStore(rootDir), config = {} }) {
  const clientId = config.clientId || process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = config.clientSecret || process.env.GOOGLE_CLIENT_SECRET || "";
  const configuredRedirectUri = config.redirectUri || process.env.GOOGLE_REDIRECT_URI || "";

  function requireConfig(redirectUri) {
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI para conectar o Drive.");
    }
  }

  async function startOAuth({ redirectUri }) {
    const finalRedirectUri = configuredRedirectUri || redirectUri;
    requireConfig(finalRedirectUri);
    const state = crypto.randomBytes(18).toString("hex");
    await store.saveState(state);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: finalRedirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `${authEndpoint}?${params.toString()}`;
  }

  async function completeOAuth({ code, state, redirectUri }) {
    const finalRedirectUri = configuredRedirectUri || redirectUri;
    requireConfig(finalRedirectUri);
    const validState = await store.consumeState(state);
    if (!validState) throw new Error("Conexão do Drive expirada. Clique em conectar novamente.");

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: finalRedirectUri,
      }),
    });
    const token = await response.json();
    if (!response.ok) throw new Error(token.error_description || token.error || "Não consegui conectar o Google Drive.");
    token.expires_at = Date.now() + Number(token.expires_in || 3600) * 1000;
    await store.saveToken(token);
    return token;
  }

  async function getAccessToken() {
    const token = await store.loadToken();
    if (!token?.refresh_token && !token?.access_token) throw new Error("Google Drive ainda não está conectado.");
    if (token.access_token && token.expires_at && Date.now() < token.expires_at - 60_000) return token.access_token;
    if (!token.refresh_token) return token.access_token;

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
      }),
    });
    const refreshed = await response.json();
    if (!response.ok) throw new Error(refreshed.error_description || refreshed.error || "Não consegui renovar o acesso ao Drive.");
    const nextToken = {
      ...token,
      ...refreshed,
      expires_at: Date.now() + Number(refreshed.expires_in || 3600) * 1000,
    };
    await store.saveToken(nextToken);
    return nextToken.access_token;
  }

  async function driveFetch(url, options = {}) {
    const accessToken = await getAccessToken();
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Google Drive falhou ${response.status}: ${detail.slice(0, 240)}`);
    }
    return response;
  }

  function escapeQueryValue(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  async function listFolders({ parentId } = {}) {
    const query = [
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
      parentId ? `'${parentId}' in parents` : null,
    ]
      .filter(Boolean)
      .join(" and ");
    const params = new URLSearchParams({
      q: query,
      fields: "files(id,name,modifiedTime,parents,webViewLink)",
      orderBy: "name",
      pageSize: "100",
    });
    const response = await driveFetch(`${driveApi}/files?${params.toString()}`);
    const payload = await response.json();
    return payload.files || [];
  }

  async function findFolderByName({ name, parentId }) {
    const query = [
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
      `name = '${escapeQueryValue(name)}'`,
      parentId ? `'${parentId}' in parents` : "'root' in parents",
    ].join(" and ");
    const params = new URLSearchParams({
      q: query,
      fields: "files(id,name,modifiedTime,parents,webViewLink)",
      pageSize: "10",
    });
    const response = await driveFetch(`${driveApi}/files?${params.toString()}`);
    const payload = await response.json();
    return payload.files?.[0] || null;
  }

  async function createFolder({ name, parentId }) {
    const response = await driveFetch(`${driveApi}/files`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: parentId ? [parentId] : undefined,
      }),
    });
    return response.json();
  }

  async function ensureFolder({ name, parentId }) {
    return (await findFolderByName({ name, parentId })) || createFolder({ name, parentId });
  }

  async function listDestinationFolders() {
    const rootFolder = await ensureFolder({ name: appRootFolderName });
    const folders = [];
    for (const name of profileFolderNames) {
      folders.push(await ensureFolder({ name, parentId: rootFolder.id }));
    }
    return { connected: true, rootFolder, folders };
  }

  async function nextPostFolderName(parentId) {
    const folders = await listFolders({ parentId });
    const highest = folders.reduce((max, folder) => {
      const match = String(folder.name || "").match(/^post\s+(\d+)$/i);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `post ${highest + 1}`;
  }

  async function uploadFile({ filePath, name, mimeType, parentId, content }) {
    const boundary = `tt-${crypto.randomBytes(12).toString("hex")}`;
    const metadata = {
      name,
      parents: parentId ? [parentId] : undefined,
    };
    const bytes = content ? Buffer.from(content) : await fs.readFile(filePath);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const response = await driveFetch(`${driveUploadApi}?uploadType=multipart&fields=id,name,webViewLink`, {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    });
    return response.json();
  }

  async function exportRun({ run, parentFolderId }) {
    if (!run.slides?.every((slide) => slide.renderedImagePath)) {
      throw new Error("Gere o slideshow antes de enviar ao Drive.");
    }
    const folderName = await nextPostFolderName(parentFolderId);
    const folder = await createFolder({ name: folderName, parentId: parentFolderId });
    const uploads = [];

    for (const slide of run.slides) {
      uploads.push(
        await uploadFile({
          filePath: slide.renderedImagePath,
          name: `slide-${String(slide.index).padStart(2, "0")}.jpg`,
          mimeType: "image/jpeg",
          parentId: folder.id,
        })
      );
    }

    uploads.push(
      await uploadFile({
        name: "post.md",
        mimeType: "text/markdown",
        parentId: folder.id,
        content: [
          "# Post",
          "",
          "## Caption",
          "",
          run.captionEnglish || "",
          "",
          "## Hashtags",
          "",
          (run.hashtags || []).join(" "),
          "",
          "## Slides",
          "",
          ...run.slides.map((slide) => `- slide-${String(slide.index).padStart(2, "0")}.jpg: ${slide.reviewedEnglish || slide.ocrEnglish || ""}`),
          "",
        ].join("\n"),
      })
    );
    uploads.push(
      await uploadFile({
        name: "post.json",
        mimeType: "application/json",
        parentId: folder.id,
        content: JSON.stringify(
          {
            runId: run.runId,
            sourceUrl: run.sourceUrl,
            captionEnglish: run.captionEnglish,
            hashtags: run.hashtags || [],
            slides: run.slides.map((slide) => ({
              index: slide.index,
              text: slide.reviewedEnglish || slide.ocrEnglish,
              file: `slide-${String(slide.index).padStart(2, "0")}.jpg`,
            })),
          },
          null,
          2
        ),
      })
    );

    return { folder, files: uploads };
  }

  return {
    completeOAuth,
    exportRun,
    listDestinationFolders,
    listFolders,
    startOAuth,
  };
}

module.exports = { createGoogleDriveClient, createGoogleDriveStore };
