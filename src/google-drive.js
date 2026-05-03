const GOOGLE_IDENTITY_URL = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

let googleScriptPromise = null;

function loadGoogleScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Drive só funciona no navegador."));
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve(window.google);
  }
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_IDENTITY_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google), { once: true });
      existing.addEventListener("error", () => reject(new Error("Não consegui carregar o login do Google.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("Não consegui carregar o login do Google."));
    document.head.appendChild(script);
  });

  return googleScriptPromise;
}

export function restoreDriveSession(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken || !parsed?.expiresAt) return null;
    if (Date.now() >= parsed.expiresAt) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function persistDriveSession(storageKey, session) {
  if (!session?.accessToken || !session?.expiresAt) return;
  localStorage.setItem(storageKey, JSON.stringify(session));
}

export function clearDriveSession(storageKey) {
  localStorage.removeItem(storageKey);
}

export async function requestDriveAccess(clientId, previousSession) {
  if (!clientId) {
    throw new Error("Falta configurar `VITE_GOOGLE_CLIENT_ID` para conectar o Google Drive.");
  }

  const google = await loadGoogleScript();

  return new Promise((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response?.error) {
          reject(new Error(response.error_description || response.error || "Não consegui autorizar o Google Drive."));
          return;
        }
        resolve({
          accessToken: response.access_token,
          expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000,
        });
      },
    });

    tokenClient.requestAccessToken({
      prompt: previousSession?.accessToken ? "" : "consent",
    });
  });
}

async function driveRequest(accessToken, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.error_description ||
      payload?.message ||
      "A requisição ao Google Drive falhou.";
    throw new Error(message);
  }

  return payload;
}

export async function listRootFolders(accessToken) {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false");
  const fields = encodeURIComponent("files(id,name,modifiedTime)");
  const orderBy = encodeURIComponent("name_natural");
  const url = `${DRIVE_API_BASE}/files?q=${query}&fields=${fields}&orderBy=${orderBy}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const payload = await driveRequest(accessToken, url);
  return Array.isArray(payload.files) ? payload.files : [];
}

export async function listChildFolders(accessToken, parentId) {
  const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`);
  const fields = encodeURIComponent("files(id,name)");
  const orderBy = encodeURIComponent("name_natural");
  const url = `${DRIVE_API_BASE}/files?q=${query}&fields=${fields}&orderBy=${orderBy}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const payload = await driveRequest(accessToken, url);
  return Array.isArray(payload.files) ? payload.files : [];
}

export function nextPostFolderName(children = []) {
  const usedNumbers = children
    .map((entry) => String(entry.name || "").trim().match(/^post\s+(\d+)$/i))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value > 0);

  const next = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1;
  return `post ${next}`;
}

export async function createDriveFolder(accessToken, name, parentId) {
  return driveRequest(accessToken, `${DRIVE_API_BASE}/files?fields=id,name,webViewLink&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  });
}

export async function createDriveFile(accessToken, { name, parentId, mimeType }) {
  return driveRequest(accessToken, `${DRIVE_API_BASE}/files?fields=id,name,webViewLink,webContentLink,mimeType&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      parents: parentId ? [parentId] : undefined,
      mimeType,
    }),
  });
}

export async function uploadDriveFileContent(accessToken, fileId, body, mimeType) {
  const response = await fetch(`${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": mimeType,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }
    throw new Error(payload?.error?.message || "Não consegui enviar o arquivo para o Google Drive.");
  }
}

export async function uploadTextFile(accessToken, { parentId, name, content }) {
  const file = await createDriveFile(accessToken, {
    name,
    parentId,
    mimeType: "text/plain",
  });
  await uploadDriveFileContent(accessToken, file.id, new Blob([content], { type: "text/plain" }), "text/plain");
  return file;
}

export async function uploadBlobFile(accessToken, { parentId, name, blob, mimeType }) {
  const file = await createDriveFile(accessToken, {
    name,
    parentId,
    mimeType,
  });
  await uploadDriveFileContent(accessToken, file.id, blob, mimeType);
  return file;
}
