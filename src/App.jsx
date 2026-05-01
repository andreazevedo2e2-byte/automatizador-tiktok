import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
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
  { key: "extract", label: "Extrair" },
  { key: "review", label: "Revisar" },
  { key: "images", label: "Imagens" },
  { key: "render", label: "Gerar" },
  { key: "preview", label: "Baixar" },
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

function stepMessage(run) {
  if (!run) return "Cole o link e clique em extrair.";
  if (run.stage === "review") return "Revise um slide por vez em português.";
  if (run.stage === "images") return "Envie as novas imagens na mesma ordem.";
  if (run.stage === "render") return "Agora gere o slideshow final.";
  if (run.stage === "preview") return "Preview pronto. Baixe slide por slide ou em ZIP.";
  return "Continue o fluxo.";
}

function SlideDots({ total, current, onSelect }) {
  return (
    <div className="slide-dots">
      {Array.from({ length: total }).map((_, index) => (
        <button
          key={index}
          type="button"
          className={`dot ${index === current ? "active" : ""}`}
          onClick={() => onSelect(index)}
          aria-label={`Ir para slide ${index + 1}`}
        />
      ))}
    </div>
  );
}

function ReviewWorkspace({ run, slide, currentIndex, onPrev, onNext, onSelect, onSlideChange, draftCaptionPortuguese, setDraftCaptionPortuguese, draftHashtags, setDraftHashtags }) {
  return (
    <section className="panel">
      <div className="panel-head compact">
        <div>
          <span className="mini-label">Etapa 2</span>
          <h2>Revise o texto</h2>
        </div>
        <span className="friendly-tip">Ajuste só o português. O sistema converte internamente para inglês.</span>
      </div>

      <div className="review-shell">
        <div className="phone-card">
          <div className="phone-card__head">
            <span>Slide {slide.index}</span>
            <span>{currentIndex + 1}/{run.slides.length}</span>
          </div>
          <div className="phone-card__frame">
            <img src={`${apiBase}${slide.sourceImageUrl}`} alt={`Slide ${slide.index}`} />
          </div>
          <div className="phone-card__nav">
            <button type="button" onClick={onPrev} disabled={currentIndex === 0}>
              <ChevronLeft size={18} />
              Anterior
            </button>
            <SlideDots total={run.slides.length} current={currentIndex} onSelect={onSelect} />
            <button type="button" onClick={onNext} disabled={currentIndex === run.slides.length - 1}>
              Próximo
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="editor-stack">
          <div className="editor-card">
            <label className="field">
              <span>Texto do slide {slide.index}</span>
              <textarea
                value={slide.reviewedPortuguese || ""}
                onChange={(event) =>
                  onSlideChange({
                    ...slide,
                    reviewedPortuguese: event.target.value,
                  })
                }
                placeholder="Edite o texto deste slide em português"
              />
            </label>
          </div>

          <div className="editor-card compact-card">
            <label className="field">
              <span>Legenda do post</span>
              <textarea
                value={draftCaptionPortuguese}
                onChange={(event) => setDraftCaptionPortuguese(event.target.value)}
                placeholder="Legenda em português para você revisar"
              />
            </label>

            <label className="field">
              <span>Hashtags</span>
              <textarea value={draftHashtags} onChange={(event) => setDraftHashtags(event.target.value)} placeholder="#fitness #motivation" />
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalPreview({ run, currentIndex, onMove }) {
  const currentSlide = run.slides[currentIndex];
  if (!currentSlide) return null;

  return (
    <section className="panel">
      <div className="panel-head compact">
        <div>
          <span className="mini-label">Etapa 5</span>
          <h2>Preview final</h2>
        </div>
        <div className="download-row">
          <a href={`${apiBase}/api/runs/${run.runId}/slides/${currentSlide.index}/download`} target="_blank" rel="noreferrer">
            <Download size={16} />
            Baixar slide
          </a>
          <a href={`${apiBase}/api/runs/${run.runId}/export.zip`} target="_blank" rel="noreferrer">
            <Download size={16} />
            Baixar ZIP completo
          </a>
        </div>
      </div>

      <div className="preview-layout">
        <div className="phone-card preview-card">
          <div className="phone-card__head">
            <span>Slide {currentSlide.index}</span>
            <span>{currentIndex + 1}/{run.slides.length}</span>
          </div>
          <div className="phone-card__frame">
            <img src={`${apiBase}${currentSlide.renderedImageUrl}`} alt={`Preview do slide ${currentSlide.index}`} />
          </div>
          <div className="phone-card__nav">
            <button type="button" onClick={() => onMove(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>
              <ChevronLeft size={18} />
              Anterior
            </button>
            <SlideDots total={run.slides.length} current={currentIndex} onSelect={onMove} />
            <button type="button" onClick={() => onMove(Math.min(run.slides.length - 1, currentIndex + 1))} disabled={currentIndex === run.slides.length - 1}>
              Próximo
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="preview-notes">
          <div className="summary-card">
            <span className="mini-label">Texto aplicado neste slide</span>
            <p>{currentSlide.reviewedPortuguese || "Sem texto revisado."}</p>
          </div>
          <div className="summary-card">
            <span className="mini-label">Legenda final</span>
            <p>{run.captionPortuguese || "Sem legenda detectada."}</p>
            <button type="button" onClick={() => copyToClipboard(run.captionPortuguese || run.captionEnglish)}>
              <Copy size={16} />
              Copiar legenda
            </button>
          </div>
          <div className="summary-card">
            <span className="mini-label">Hashtags</span>
            <p>{hashtagsToText(run.hashtags) || "Sem hashtags detectadas."}</p>
            <button type="button" onClick={() => copyToClipboard(hashtagsToText(run.hashtags))}>
              <Copy size={16} />
              Copiar hashtags
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function StepSummary({ title, text }) {
  return (
    <section className="panel summary-panel">
      <span className="mini-label">{title}</span>
      <p>{text}</p>
    </section>
  );
}

export function App() {
  const [url, setUrl] = useState(sampleUrl);
  const [status, setStatus] = useState("Pronto para começar.");
  const [error, setError] = useState("");
  const [run, setRun] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [draftSlides, setDraftSlides] = useState([]);
  const [draftCaptionEnglish, setDraftCaptionEnglish] = useState("");
  const [draftCaptionPortuguese, setDraftCaptionPortuguese] = useState("");
  const [draftHashtags, setDraftHashtags] = useState("");
  const [replacementFiles, setReplacementFiles] = useState([]);
  const fileInputRef = useRef(null);

  const activeStep = normalizeStage(run);
  const canRender = run?.slides?.every((slide) => slide.replacementImageUrl);
  const currentReviewSlide = draftSlides[currentReviewIndex];

  function hydrateRun(nextRun) {
    setRun(nextRun);
    setDraftSlides(nextRun.slides.map((slide) => ({ ...slide })));
    setDraftCaptionEnglish(nextRun.captionEnglish || "");
    setDraftCaptionPortuguese(nextRun.captionPortuguese || "");
    setDraftHashtags(hashtagsToText(nextRun.hashtags));
    setPreviewIndex(0);
    setCurrentReviewIndex(0);
  }

  async function extractPost() {
    setError("");
    setExtracting(true);
    setStatus("Extraindo slides e organizando o texto...");

    try {
      const response = await fetch(`${apiBase}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha na extração.");
      hydrateRun(data);
      setStatus(`Pronto. Encontramos ${data.slides.length} slides para revisar.`);
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Não conseguimos extrair esse post.");
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
    setStatus("Salvando sua revisão...");

    try {
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
      if (!reconcileResponse.ok) throw new Error(reconciled.error || "Falha ao converter sua revisão.");

      const slidesToSave = draftSlides.map((slide) => {
        const match = reconciled.slides.find((entry) => entry.index === slide.index);
        return {
          ...slide,
          reviewedEnglish: match?.reviewedEnglish || slide.reviewedEnglish,
        };
      });

      const captionEnglishToSave = reconciled.captionEnglish || draftCaptionEnglish;
      setDraftSlides(slidesToSave);
      setDraftCaptionEnglish(captionEnglishToSave);

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
      if (!response.ok) throw new Error(data.error || "Falha ao salvar sua revisão.");
      hydrateRun(data);
      setStatus("Texto salvo. Agora envie as novas imagens.");
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
    setStatus("Enviando as novas imagens...");

    try {
      const formData = new FormData();
      replacementFiles.forEach((file) => formData.append("images", file));

      const response = await fetch(`${apiBase}/api/runs/${run.runId}/replacements`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao enviar as imagens.");
      hydrateRun(data);
      setStatus("Imagens recebidas. Agora já podemos gerar o preview.");
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
    setStatus("Gerando o slideshow final...");

    try {
      const response = await fetch(`${apiBase}/api/runs/${run.runId}/render`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao gerar o slideshow.");
      hydrateRun(data);
      setStatus("Tudo certo. Seu preview final está pronto.");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("A geração do preview falhou.");
    } finally {
      setRendering(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel hero-panel--compact">
        <div className="hero-copy-block">
          <p className="eyebrow">TikTok slideshow system</p>
          <h1>Automatizador TikTok</h1>
          <p className="hero-copy">
            Um fluxo simples: extrair, revisar em português, trocar as imagens e gerar o slideshow final.
          </p>
        </div>

        <div className="hero-status hero-status--soft">
          <span className="status-label">Agora estamos em</span>
          <strong>{steps[activeStep]?.label || "Extrair"}</strong>
          <small>{stepMessage(run)}</small>
        </div>
      </section>

      <section className="stepper stepper--compact">
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

      <section className="workspace-grid simplified-grid">
        <div className="main-column">
          <section className="panel">
            <div className="panel-head compact">
              <div>
                <span className="mini-label">Etapa 1</span>
                <h2>Extrair o post</h2>
              </div>
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
              <button type="button" onClick={() => fileInputRef.current?.click()}>
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
                  setStatus("Lendo as imagens enviadas...");
                  try {
                    const formData = new FormData();
                    selected.forEach((file) => formData.append("slides", file));
                    const response = await fetch(`${apiBase}/api/ocr-upload`, { method: "POST", body: formData });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || "Falha no OCR.");
                    hydrateRun(data);
                    setStatus(`Pronto. Encontramos ${data.slides.length} slides para revisar.`);
                  } catch (requestError) {
                    setError(requestError.message);
                    setStatus("Não foi possível ler essas imagens.");
                  } finally {
                    setExtracting(false);
                  }
                }}
              />
            </div>
          </section>

          {run && activeStep === 1 && currentReviewSlide && (
            <ReviewWorkspace
              run={run}
              slide={currentReviewSlide}
              currentIndex={currentReviewIndex}
              onPrev={() => setCurrentReviewIndex((current) => Math.max(0, current - 1))}
              onNext={() => setCurrentReviewIndex((current) => Math.min(run.slides.length - 1, current + 1))}
              onSelect={setCurrentReviewIndex}
              onSlideChange={updateDraftSlide}
              draftCaptionPortuguese={draftCaptionPortuguese}
              setDraftCaptionPortuguese={setDraftCaptionPortuguese}
              draftHashtags={draftHashtags}
              setDraftHashtags={setDraftHashtags}
            />
          )}

          {run && activeStep === 1 && (
            <section className="panel compact-panel">
              <div className="action-row">
                <button className="primary" onClick={saveReviewAndContinue} disabled={savingReview}>
                  {savingReview ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
                  Salvar e continuar
                </button>
              </div>
            </section>
          )}

          {run && activeStep > 1 && <StepSummary title="Texto revisado" text="Sua revisão foi salva. Você pode seguir sem ficar lendo tudo de novo." />}

          {run && activeStep >= 2 && (
            <section className="panel">
              <div className="panel-head compact">
                <div>
                  <span className="mini-label">Etapa 3</span>
                  <h2>Trocar as imagens</h2>
                </div>
                <span className="friendly-tip">{run.slides.length} imagens necessárias</span>
              </div>

              <label className="upload-dropzone">
                <ImagePlus size={22} />
                <strong>Selecione as novas imagens na ordem correta</strong>
                <span>Exemplo: a primeira imagem vai para o slide 1, a segunda vai para o slide 2 e assim por diante.</span>
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

          {run && activeStep >= 3 && (
            <section className="panel">
              <div className="panel-head compact">
                <div>
                  <span className="mini-label">Etapa 4</span>
                  <h2>Gerar o preview</h2>
                </div>
              </div>

              <div className="render-card">
                <p>Quando você clicar abaixo, eu vou aplicar o texto ajustado nas novas imagens e montar o slideshow final.</p>
                <button className="primary" onClick={renderSlideshow} disabled={!canRender || rendering}>
                  {rendering ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
                  Gerar preview final
                </button>
              </div>
            </section>
          )}

          {run?.stage === "preview" && <FinalPreview run={run} currentIndex={previewIndex} onMove={setPreviewIndex} />}
        </div>

        <aside className="side-column">
          <section className="panel side-panel">
            <span className="mini-label">Progresso</span>
            <ul className="status-list">
              <li className={run ? "done" : ""}>Post extraído</li>
              <li className={run?.stage === "images" || run?.stage === "render" || run?.stage === "preview" ? "done" : ""}>Texto revisado</li>
              <li className={run?.stage === "render" || run?.stage === "preview" ? "done" : ""}>Novas imagens enviadas</li>
              <li className={run?.stage === "preview" ? "done" : ""}>Preview pronto</li>
            </ul>
          </section>

          {error && (
            <section className="panel error-panel">
              <strong>Algo precisa de atenção</strong>
              <p>{error}</p>
            </section>
          )}

          <section className="panel side-panel help-panel">
            <span className="mini-label">Próxima fase</span>
            <p>Quando esta etapa estiver redonda, o próximo passo é ligar a saída ao fluxo de postagem.</p>
          </section>
        </aside>
      </section>
    </main>
  );
}
