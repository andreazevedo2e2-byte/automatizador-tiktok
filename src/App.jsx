import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Globe2,
  ImagePlus,
  Loader2,
  ScanText,
  Sparkles,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

const envApiBase = import.meta.env.VITE_API_BASE?.trim();
const productionApiBase = "https://zapspark-tiktok-extractor.te7sty.easypanel.host";
const apiBase = envApiBase || (window.location.hostname === "127.0.0.1" ? "http://127.0.0.1:4141" : productionApiBase);
const sampleUrl =
  "https://www.tiktok.com/@landon.vaughn17/photo/7633592588674551053?is_from_webapp=1&sender_device=pc&web_id=7634388741662869010";

const steps = [
  { key: "extract", label: "Extrair post" },
  { key: "review", label: "Revisar conteúdo" },
  { key: "images", label: "Enviar imagens" },
  { key: "render", label: "Gerar slideshow" },
  { key: "preview", label: "Visualizar e exportar" },
];

const stageToStepIndex = {
  review: 1,
  images: 2,
  render: 3,
  preview: 4,
};

function copyToClipboard(value) {
  return navigator.clipboard.writeText(value || "");
}

function hashtagsToText(hashtags = []) {
  return hashtags.join(" ").trim();
}

function textToHashtags(input) {
  return String(input || "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeStage(run) {
  if (!run) return 0;
  return stageToStepIndex[run.stage] ?? 1;
}

function SlideReviewCard({ slide, languageMode, onChange }) {
  const textValue = languageMode === "pt" ? slide.reviewedPortuguese : slide.reviewedEnglish;
  const setText = (value) => {
    if (languageMode === "pt") {
      onChange({
        ...slide,
        reviewedPortuguese: value,
      });
      return;
    }

    onChange({
      ...slide,
      reviewedEnglish: value,
    });
  };

  return (
    <article className="slide-review-card">
      <div className="slide-review-media">
        <img src={`${apiBase}${slide.sourceImageUrl}`} alt={`Slide ${slide.index}`} />
        <span>Slide {slide.index}</span>
      </div>
      <div className="slide-review-body">
        <div className="slide-review-meta">
          <strong>OCR {slide.confidence}%</strong>
          <small>{languageMode === "pt" ? "Modo traduzido" : "Modo original (inglês)"}</small>
        </div>
        <textarea
          value={textValue || ""}
          onChange={(event) => setText(event.target.value)}
          placeholder={languageMode === "pt" ? "Revise o texto em português" : "Revise o texto em inglês"}
        />
        <div className="slide-review-foot">
          <div>
            <span className="mini-label">Inglês final</span>
            <p>{slide.reviewedEnglish || "—"}</p>
          </div>
          <div>
            <span className="mini-label">Português de apoio</span>
            <p>{slide.reviewedPortuguese || "—"}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function PreviewCarousel({ run, currentIndex, onMove }) {
  const currentSlide = run.slides[currentIndex];
  if (!currentSlide) return null;

  return (
    <section className="preview-shell">
      <div className="preview-stage">
        <button onClick={() => onMove(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>
          <ChevronLeft size={18} />
        </button>
        <div className="preview-frame">
          <img src={`${apiBase}${currentSlide.renderedImageUrl}`} alt={`Preview slide ${currentSlide.index}`} />
          <span className="preview-chip">
            {currentSlide.index}/{run.slides.length}
          </span>
        </div>
        <button onClick={() => onMove(Math.min(run.slides.length - 1, currentIndex + 1))} disabled={currentIndex === run.slides.length - 1}>
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="preview-sidebar">
        <div className="summary-card">
          <span className="mini-label">Caption final</span>
          <p>{run.captionEnglish || "Sem caption detectado."}</p>
          <div className="inline-actions">
            <button onClick={() => copyToClipboard(run.captionEnglish)}>Copiar caption</button>
          </div>
        </div>

        <div className="summary-card">
          <span className="mini-label">Hashtags</span>
          <p>{hashtagsToText(run.hashtags) || "Sem hashtags detectadas."}</p>
          <div className="inline-actions">
            <button onClick={() => copyToClipboard(hashtagsToText(run.hashtags))}>Copiar hashtags</button>
          </div>
        </div>

        <div className="summary-card">
          <span className="mini-label">Downloads</span>
          <div className="download-stack">
            <a href={`${apiBase}/api/runs/${run.runId}/slides/${currentSlide.index}/download`} target="_blank" rel="noreferrer">
              Baixar slide atual
            </a>
            <a href={`${apiBase}/api/runs/${run.runId}/export.zip`} target="_blank" rel="noreferrer">
              Baixar ZIP completo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function App() {
  const [url, setUrl] = useState(sampleUrl);
  const [status, setStatus] = useState("Pronto para extrair um slideshow.");
  const [error, setError] = useState("");
  const [run, setRun] = useState(null);
  const [languageMode, setLanguageMode] = useState("pt");
  const [extracting, setExtracting] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [draftSlides, setDraftSlides] = useState([]);
  const [draftCaptionEnglish, setDraftCaptionEnglish] = useState("");
  const [draftCaptionPortuguese, setDraftCaptionPortuguese] = useState("");
  const [draftHashtags, setDraftHashtags] = useState("");
  const [replacementFiles, setReplacementFiles] = useState([]);
  const fileInputRef = useRef(null);

  const activeStep = normalizeStage(run);
  const canRender = run?.slides?.every((slide) => slide.replacementImageUrl);

  const progressText = useMemo(() => {
    if (!run) return "Cole um link, extraia, revise e gere o slideshow final.";
    return `Run ${run.runId} · provedor ${run.provider} · etapa ${run.stage}`;
  }, [run]);

  function hydrateRun(nextRun) {
    setRun(nextRun);
    setDraftSlides(nextRun.slides.map((slide) => ({ ...slide })));
    setDraftCaptionEnglish(nextRun.captionEnglish || "");
    setDraftCaptionPortuguese(nextRun.captionPortuguese || "");
    setDraftHashtags(hashtagsToText(nextRun.hashtags));
    setPreviewIndex(0);
  }

  async function extractPost() {
    setError("");
    setExtracting(true);
    setStatus("Extraindo slides, OCR e metadados do post...");

    try {
      const response = await fetch(`${apiBase}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha na extração.");
      hydrateRun(data);
      setStatus(`Extração concluída com ${data.slides.length} slide(s).`);
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Não foi possível extrair este post.");
    } finally {
      setExtracting(false);
    }
  }

  function updateDraftSlide(nextSlide) {
    setDraftSlides((current) => current.map((slide) => (slide.index === nextSlide.index ? nextSlide : slide)));
  }

  async function saveReviewAndContinue() {
    if (!run) return;

    setSavingReview(true);
    setError("");
    setStatus("Salvando revisão do conteúdo...");

    try {
      let slidesToSave = draftSlides;
      let captionEnglishToSave = draftCaptionEnglish;

      if (languageMode === "pt") {
        const reconcileResponse = await fetch(`${apiBase}/api/runs/${run.runId}/reconcile-review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slides: draftSlides.map((slide) => ({
              index: slide.index,
              reviewedPortuguese: slide.reviewedPortuguese,
            })),
            captionPortuguese: draftCaptionPortuguese,
          }),
        });

        const reconciled = await reconcileResponse.json();
        if (!reconcileResponse.ok) throw new Error(reconciled.error || "Falha ao sincronizar tradução.");

        slidesToSave = draftSlides.map((slide) => {
          const match = reconciled.slides.find((entry) => entry.index === slide.index);
          return {
            ...slide,
            reviewedEnglish: match?.reviewedEnglish || slide.reviewedEnglish,
          };
        });
        captionEnglishToSave = reconciled.captionEnglish || draftCaptionEnglish;
        setDraftSlides(slidesToSave);
        setDraftCaptionEnglish(captionEnglishToSave);
      }

      const response = await fetch(`${apiBase}/api/runs/${run.runId}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slides: slidesToSave,
          captionEnglish: captionEnglishToSave,
          captionPortuguese: draftCaptionPortuguese,
          hashtags: textToHashtags(draftHashtags),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao salvar a revisão.");
      hydrateRun(data);
      setStatus("Conteúdo revisado. Agora envie as novas imagens.");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Não foi possível salvar a revisão.");
    } finally {
      setSavingReview(false);
    }
  }

  function selectReplacementFiles(fileList) {
    const selected = Array.from(fileList || []);
    setReplacementFiles(selected);
  }

  async function uploadReplacementImages() {
    if (!run) return;
    if (replacementFiles.length !== run.slides.length) {
      setError(`Envie exatamente ${run.slides.length} imagens para continuar.`);
      return;
    }

    setUploadingImages(true);
    setError("");
    setStatus("Enviando imagens novas para o slideshow...");

    try {
      const formData = new FormData();
      replacementFiles.forEach((file) => formData.append("images", file));

      const response = await fetch(`${apiBase}/api/runs/${run.runId}/replacements`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao enviar imagens.");
      hydrateRun(data);
      setStatus("Imagens novas prontas. Agora podemos renderizar.");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Não foi possível enviar as imagens.");
    } finally {
      setUploadingImages(false);
    }
  }

  async function renderSlideshow() {
    if (!run) return;
    setRendering(true);
    setError("");
    setStatus("Gerando preview final do slideshow...");

    try {
      const response = await fetch(`${apiBase}/api/runs/${run.runId}/render`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao renderizar.");
      hydrateRun(data);
      setStatus("Preview pronto. Você já pode revisar e baixar.");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("A renderização falhou.");
    } finally {
      setRendering(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">TikTok slideshow system</p>
          <h1>Automatizador TikTok</h1>
          <p className="hero-copy">
            Extraia o post, revise em português sem perder o inglês final e gere um preview pronto para baixar slide por slide ou em ZIP.
          </p>
        </div>
        <div className="hero-status">
          <span className="status-label">Status atual</span>
          <strong>{status}</strong>
          <small>{progressText}</small>
        </div>
      </section>

      <section className="stepper">
        {steps.map((step, index) => {
          const state = index < activeStep ? "done" : index === activeStep ? "active" : "idle";
          return (
            <div className={`step-item ${state}`} key={step.key}>
              <div className="step-badge">{state === "done" ? <CheckCircle2 size={16} /> : index + 1}</div>
              <div>
                <span>{step.label}</span>
              </div>
            </div>
          );
        })}
      </section>

      <section className="workspace-grid">
        <div className="main-column">
          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="mini-label">Etapa 1</span>
                <h2>Extrair o post</h2>
              </div>
              <span className="soft-badge">SnapTik primeiro · TikTok fallback</span>
            </div>

            <label className="field">
              <span>Link do slideshow</span>
              <input value={url} onChange={(event) => setUrl(event.target.value)} />
            </label>

            <div className="action-row">
              <button className="primary" onClick={extractPost} disabled={extracting}>
                {extracting ? <Loader2 className="spin" size={18} /> : <ScanText size={18} />}
                Extrair post
              </button>
              <button onClick={() => fileInputRef.current?.click()}>
                <Upload size={18} />
                OCR via imagens
              </button>
              <input
                hidden
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={async (event) => {
                  const selected = Array.from(event.target.files || []);
                  if (!selected.length) return;
                  setExtracting(true);
                  setError("");
                  setStatus("Rodando OCR nas imagens enviadas...");
                  try {
                    const formData = new FormData();
                    selected.forEach((file) => formData.append("slides", file));
                    const response = await fetch(`${apiBase}/api/ocr-upload`, { method: "POST", body: formData });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || "Falha no OCR.");
                    hydrateRun(data);
                    setStatus(`OCR concluído com ${data.slides.length} slide(s).`);
                  } catch (requestError) {
                    setError(requestError.message);
                    setStatus("Falha ao rodar OCR.");
                  } finally {
                    setExtracting(false);
                  }
                }}
              />
            </div>
          </section>

          {run && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="mini-label">Etapa 2</span>
                  <h2>Revisar conteúdo</h2>
                </div>
                <div className="inline-actions">
                  <button className={languageMode === "pt" ? "active-tab" : ""} onClick={() => setLanguageMode("pt")}>
                    <Globe2 size={16} />
                    Português
                  </button>
                  <button className={languageMode === "en" ? "active-tab" : ""} onClick={() => setLanguageMode("en")}>
                    <Sparkles size={16} />
                    Inglês
                  </button>
                </div>
              </div>

              <div className="review-grid">
                <label className="field">
                  <span>{languageMode === "pt" ? "Caption de apoio" : "Caption final em inglês"}</span>
                  <textarea
                    value={languageMode === "pt" ? draftCaptionPortuguese : draftCaptionEnglish}
                    onChange={(event) =>
                      languageMode === "pt"
                        ? setDraftCaptionPortuguese(event.target.value)
                        : setDraftCaptionEnglish(event.target.value)
                    }
                  />
                </label>

                <label className="field">
                  <span>Hashtags</span>
                  <textarea value={draftHashtags} onChange={(event) => setDraftHashtags(event.target.value)} />
                </label>
              </div>

              <div className="slides-stack">
                {draftSlides.map((slide) => (
                  <SlideReviewCard key={slide.index} slide={slide} languageMode={languageMode} onChange={updateDraftSlide} />
                ))}
              </div>

              <div className="action-row">
                <button className="primary" onClick={saveReviewAndContinue} disabled={savingReview}>
                  {savingReview ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
                  Salvar revisão
                </button>
              </div>
            </section>
          )}

          {run && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="mini-label">Etapa 3</span>
                  <h2>Enviar novas imagens</h2>
                </div>
                <span className="soft-badge">{run.slides.length} imagem(ns) necessária(s)</span>
              </div>

              <label className="upload-dropzone">
                <ImagePlus size={22} />
                <strong>Selecione as novas imagens na ordem correta</strong>
                <span>O sistema valida a quantidade antes de renderizar.</span>
                <input type="file" accept="image/*" multiple onChange={(event) => selectReplacementFiles(event.target.files)} />
              </label>

              {replacementFiles.length > 0 && (
                <div className="replacement-list">
                  {replacementFiles.map((file, index) => (
                    <div className="replacement-card" key={`${file.name}-${index}`}>
                      <span>Imagem {index + 1}</span>
                      <strong>{file.name}</strong>
                    </div>
                  ))}
                </div>
              )}

              <div className="action-row">
                <button className="primary" onClick={uploadReplacementImages} disabled={uploadingImages || !replacementFiles.length}>
                  {uploadingImages ? <Loader2 className="spin" size={18} /> : <Upload size={18} />}
                  Enviar imagens
                </button>
              </div>
            </section>
          )}

          {run && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="mini-label">Etapa 4</span>
                  <h2>Gerar slideshow</h2>
                </div>
                <span className="soft-badge">{canRender ? "Pronto para renderizar" : "Aguardando imagens"}</span>
              </div>

              <div className="render-card">
                <p>
                  O compositor vai gerar slides 1080×1920 com overlay de texto, quebra automática de linha e preview pronto para revisão.
                </p>
                <button className="primary" onClick={renderSlideshow} disabled={!canRender || rendering}>
                  {rendering ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
                  Gerar preview final
                </button>
              </div>
            </section>
          )}

          {run?.stage === "preview" && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span className="mini-label">Etapa 5</span>
                  <h2>Visualizar e exportar</h2>
                </div>
                <span className="soft-badge">Preview + downloads</span>
              </div>
              <PreviewCarousel run={run} currentIndex={previewIndex} onMove={setPreviewIndex} />
            </section>
          )}
        </div>

        <aside className="side-column">
          <section className="panel side-panel">
            <span className="mini-label">Checklist desta run</span>
            <ul className="status-list">
              <li className={run ? "done" : ""}>Link extraído</li>
              <li className={run?.stage === "images" || run?.stage === "render" || run?.stage === "preview" ? "done" : ""}>Texto revisado</li>
              <li className={run?.stage === "render" || run?.stage === "preview" ? "done" : ""}>Novas imagens enviadas</li>
              <li className={run?.stage === "preview" ? "done" : ""}>Preview final gerado</li>
            </ul>
          </section>

          {run && (
            <section className="panel side-panel">
              <span className="mini-label">Dados detectados</span>
              <div className="summary-stack">
                <div>
                  <strong>Provider</strong>
                  <p>{run.provider}</p>
                </div>
                <div>
                  <strong>Slides</strong>
                  <p>{run.slides.length}</p>
                </div>
                <div>
                  <strong>Hashtags</strong>
                  <p>{hashtagsToText(run.hashtags) || "Nenhuma por enquanto"}</p>
                </div>
                <div className="inline-actions">
                  <button onClick={() => copyToClipboard(draftCaptionEnglish)}>
                    <Copy size={16} />
                    Copiar caption EN
                  </button>
                  <button onClick={() => copyToClipboard(draftCaptionPortuguese)}>
                    <Copy size={16} />
                    Copiar tradução PT
                  </button>
                </div>
              </div>
            </section>
          )}

          {error && (
            <section className="panel error-panel">
              <strong>Algo precisa de atenção</strong>
              <p>{error}</p>
            </section>
          )}

          <section className="panel side-panel help-panel">
            <span className="mini-label">Próxima fase</span>
            <p>
              O ZIP final já sai estruturado para um handoff futuro com o <strong>Postiz</strong>, sem prender esta v1 à publicação automática.
            </p>
            <a href="https://postiz.com" target="_blank" rel="noreferrer">
              Conhecer o Postiz
            </a>
          </section>

          {run?.stage === "preview" && (
            <section className="panel side-panel">
              <span className="mini-label">Exportação rápida</span>
              <div className="download-stack">
                <a href={`${apiBase}/api/runs/${run.runId}/export.zip`} target="_blank" rel="noreferrer">
                  <Download size={16} />
                  Baixar ZIP
                </a>
              </div>
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}
