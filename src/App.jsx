import { Download, FileText, ImagePlus, Loader2, LogIn, ScanText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const envApiBase = import.meta.env.VITE_API_BASE?.trim();
const productionApiBase = "https://zapspark-tiktok-extractor.te7sty.easypanel.host";
const defaultApiBase =
  envApiBase || (window.location.hostname === "127.0.0.1" ? "http://127.0.0.1:4141" : productionApiBase);
const sampleUrl =
  "https://www.tiktok.com/@landon.vaughn17/photo/7633592588674551053?is_from_webapp=1&sender_device=pc&web_id=7634388741662869010";

function downloadJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `tiktok-slideshow-${data.runId || Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function App() {
  const [apiBase, setApiBase] = useState(() => window.localStorage.getItem("tiktok-api-base") || defaultApiBase);
  const [url, setUrl] = useState(sampleUrl);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [openingLogin, setOpeningLogin] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [remoteLoginUrl, setRemoteLoginUrl] = useState("");

  useEffect(() => {
    window.localStorage.setItem("tiktok-api-base", apiBase);
  }, [apiBase]);

  useEffect(() => {
    if (!apiBase.trim()) return;
    fetch(`${apiBase}/api/health`)
      .then((response) => response.json())
      .then((data) => setRemoteLoginUrl(data.remoteLoginUrl || ""))
      .catch(() => {});
  }, [apiBase]);

  const exportPayload = useMemo(() => {
    if (!result) return null;
    return {
      runId: result.runId,
      sourceUrl: result.sourceUrl,
      slides: result.slides.map(({ slide, text, confidence, imageUrl }) => ({
        image: slide,
        copy: text,
        confidence,
        imageUrl,
      })),
    };
  }, [result]);

  async function extractText() {
    if (!apiBase.trim()) {
      setError("Set the Backend URL first.");
      setStatus("Backend URL required");
      return;
    }

    setError("");
    setExtracting(true);
    setStatus("Opening TikTok and capturing slides...");
    try {
      const response = await fetch(`${apiBase}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Extraction failed.");
      setResult(data);
      setStatus(`Extracted ${data.slides.length} image${data.slides.length === 1 ? "" : "s"}.`);
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Extraction stopped");
    } finally {
      setExtracting(false);
    }
  }

  async function openLoginBrowser() {
    if (!apiBase.trim()) {
      setError("Set the Backend URL first.");
      setStatus("Backend URL required");
      return;
    }

    setError("");
    setOpeningLogin(true);
    setStatus("Preparing TikTok login...");
    try {
      const response = await fetch(`${apiBase}/api/open-login`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not open login browser.");
      if (data.remoteLoginUrl) {
        setRemoteLoginUrl(data.remoteLoginUrl);
        window.open(data.remoteLoginUrl, "_blank", "noopener,noreferrer");
      }
      setStatus(data.message);
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Login browser stopped");
    } finally {
      setOpeningLogin(false);
    }
  }

  async function uploadSlides(files) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    if (!apiBase.trim()) {
      setError("Set the Backend URL first.");
      setStatus("Backend URL required");
      return;
    }

    setError("");
    setUploading(true);
    setStatus(`Running OCR on ${selected.length} uploaded image${selected.length === 1 ? "" : "s"}...`);
    try {
      const formData = new FormData();
      selected.forEach((file) => formData.append("slides", file));
      const response = await fetch(`${apiBase}/api/ocr-upload`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload OCR failed.");
      setResult(data);
      setStatus(`Extracted ${data.slides.length} uploaded image${data.slides.length === 1 ? "" : "s"}.`);
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Upload OCR stopped");
    } finally {
      setUploading(false);
    }
  }

  function updateSlideText(slideNumber, text) {
    setResult((current) => ({
      ...current,
      slides: current.slides.map((slide) => (slide.slide === slideNumber ? { ...slide, text } : slide)),
    }));
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">TikTok Slideshow OCR</p>
          <h1>Automatizador TikTok</h1>
        </div>
        <div className="status-pill">{status}</div>
      </section>

      <section className="control-strip">
        <label className="url-field">
          <span>Backend URL</span>
          <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} placeholder="https://api.seudominio.com" />
        </label>
        <label className="url-field">
          <span>TikTok slideshow URL</span>
          <input value={url} onChange={(event) => setUrl(event.target.value)} />
        </label>
        <button className="primary" onClick={extractText} disabled={extracting || uploading}>
          {extracting ? <Loader2 className="spin" size={18} /> : <ScanText size={18} />}
          Extract Text
        </button>
        <button onClick={openLoginBrowser} disabled={extracting || openingLogin || uploading}>
          {openingLogin ? <Loader2 className="spin" size={18} /> : <LogIn size={18} />}
          Connect TikTok Account
        </button>
        <label className="upload-button">
          {uploading ? <Loader2 className="spin" size={18} /> : <ImagePlus size={18} />}
          Upload Images
          <input type="file" accept="image/*" multiple onChange={(event) => uploadSlides(event.target.files)} />
        </label>
        <button onClick={() => exportPayload && downloadJson(exportPayload)} disabled={!exportPayload}>
          <Download size={18} />
          Export JSON
        </button>
      </section>

      {error && <div className="error-panel">{error}</div>}

      {remoteLoginUrl && (
        <div className="error-panel info-panel">
          Remote TikTok login window:{" "}
          <a href={remoteLoginUrl} target="_blank" rel="noreferrer">
            {remoteLoginUrl}
          </a>
        </div>
      )}

      {!result && (
        <section className="empty-state">
          <FileText size={42} />
          <p>Connect the TikTok account once, then paste a TikTok slideshow link or upload screenshots for OCR.</p>
        </section>
      )}

      {result && (
        <section className="slides-grid">
          {result.slides.map((slide) => (
            <article className="slide-card" key={slide.slide}>
              <div className="slide-media">
                {slide.imageUrl ? <img src={`${apiBase}${slide.imageUrl}`} alt={`Imagem ${slide.slide}`} /> : null}
                <span>Imagem {slide.slide}</span>
              </div>
              <div className="copy-columns">
                <label className="copy-panel">
                  <span>Copy {slide.slide} · OCR confidence {slide.confidence ?? 0}%</span>
                  <textarea value={slide.text} onChange={(event) => updateSlideText(slide.slide, event.target.value)} />
                </label>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
