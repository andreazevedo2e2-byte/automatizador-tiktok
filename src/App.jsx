import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  ImagePlus,
  Loader2,
  Play,
  ScanText,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const envApiBase = import.meta.env.VITE_API_BASE?.trim();
const productionApiBase = "https://zapspark-tiktok-extractor.te7sty.easypanel.host";
const apiBase = envApiBase || (window.location.hostname === "127.0.0.1" ? "http://127.0.0.1:4141" : productionApiBase);
const sampleUrl =
  "https://www.tiktok.com/@landon.vaughn17/photo/7633592588674551053?is_from_webapp=1&sender_device=pc&web_id=7634388741662869010";

const steps = [
  { key: "extract", number: "01", title: "Extrair", hint: "Link ou prints" },
  { key: "review", number: "02", title: "Revisar", hint: "Texto em português" },
  { key: "images", number: "03", title: "Imagens", hint: "Substituir na ordem" },
  { key: "generate", number: "04", title: "Gerar", hint: "Aplicar legendas" },
  { key: "download", number: "05", title: "Baixar", hint: "Slides e ZIP" },
];

const stageByRun = {
  review: "review",
  images: "images",
  render: "generate",
  preview: "download",
};

const stageIndex = Object.fromEntries(steps.map((step, index) => [step.key, index]));

function assetUrl(pathname) {
  if (!pathname) return "";
  if (/^https?:\/\//i.test(pathname)) return pathname;
  return `${apiBase}${pathname}`;
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

function getActiveStage(run) {
  if (!run) return "extract";
  return stageByRun[run.stage] || "review";
}

function copyText(value) {
  return navigator.clipboard.writeText(value || "");
}

function LoadingIcon({ active }) {
  return active ? <Loader2 className="spin" size={18} /> : null;
}

function StepRail({ activeStage }) {
  const activeIndex = stageIndex[activeStage] || 0;

  return (
    <aside className="step-rail" aria-label="Etapas do fluxo">
      <div className="brand-mark">
        <span>TT</span>
      </div>
      <div className="step-list">
        {steps.map((step, index) => {
          const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "locked";
          return (
            <div className={`rail-step ${state}`} key={step.key}>
              <div className="rail-step__number">{state === "done" ? <Check size={15} /> : step.number}</div>
              <div>
                <strong>{step.title}</strong>
                <span>{step.hint}</span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function StudioHeader({ activeStage, status }) {
  const activeStep = steps[stageIndex[activeStage] || 0];

  return (
    <header className="studio-header">
      <div>
        <p className="kicker">Slideshow Studio</p>
        <h1>Automatizador TikTok</h1>
      </div>
      <div className="status-pill">
        <span>{activeStep.number}</span>
        <strong>{activeStep.title}</strong>
        <small>{status}</small>
      </div>
    </header>
  );
}

function SlideRail({ slides, activeIndex, onSelect, rendered = false }) {
  if (!slides?.length) return null;

  return (
    <div className="slide-rail" aria-label="Escolha um slide">
      {slides.map((slide, index) => (
        <button
          type="button"
          className={`slide-chip ${activeIndex === index ? "active" : ""}`}
          key={slide.index}
          onClick={() => onSelect(index)}
        >
          <img src={assetUrl(rendered ? slide.renderedImageUrl : slide.sourceImageUrl)} alt={`Slide ${slide.index}`} />
          <span>{String(slide.index).padStart(2, "0")}</span>
        </button>
      ))}
    </div>
  );
}

function PhonePreview({ slide, slideIndex, total, rendered = false, onPrev, onNext }) {
  const imageUrl = assetUrl(rendered ? slide?.renderedImageUrl : slide?.sourceImageUrl);

  return (
    <div className="phone-preview">
      <div className="phone-preview__top">
        <span>{slide ? `Slide ${slide.index}` : "Preview"}</span>
        <span>{total ? `${slideIndex + 1}/${total}` : "0/0"}</span>
      </div>
      <div className="phone-screen">
        {imageUrl ? (
          <img src={imageUrl} alt={slide ? `Preview do slide ${slide.index}` : "Preview vazio"} />
        ) : (
          <div className="empty-screen">
            <Sparkles size={30} />
            <p>O preview aparece aqui.</p>
          </div>
        )}
      </div>
      {total > 1 && (
        <div className="phone-controls">
          <button type="button" onClick={onPrev} disabled={slideIndex === 0} aria-label="Slide anterior">
            <ChevronLeft size={18} />
          </button>
          <div className="progress-dots">
            {Array.from({ length: total }).map((_, index) => (
              <span className={index === slideIndex ? "active" : ""} key={index} />
            ))}
          </div>
          <button type="button" onClick={onNext} disabled={slideIndex === total - 1} aria-label="Próximo slide">
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

function ExtractStage({ url, setUrl, onExtract, extracting, onUploadScreenshots }) {
  const uploadRef = useRef(null);

  return (
    <section className="stage-card extract-stage">
      <div className="stage-copy">
        <p className="stage-label">Etapa 01</p>
        <h2>Comece pelo link do slideshow</h2>
        <p>
          Cole o link do post. A ferramenta baixa os slides, lê o texto das imagens e já prepara tudo para você revisar
          em português.
        </p>
      </div>

      <div className="extract-box">
        <label className="input-group">
          <span>Link do post</span>
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.tiktok.com/@perfil/photo/..." />
        </label>

        <div className="primary-actions">
          <button className="action-button main-action" type="button" onClick={onExtract} disabled={extracting}>
            {extracting ? <Loader2 className="spin" size={20} /> : <ScanText size={20} />}
            Extrair post
          </button>
          <button className="action-button ghost-action" type="button" onClick={() => uploadRef.current?.click()} disabled={extracting}>
            <UploadCloud size={20} />
            Usar prints dos slides
          </button>
          <input
            hidden
            ref={uploadRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => onUploadScreenshots(event.target.files)}
          />
        </div>
      </div>

      <div className="soft-note">
        <Sparkles size={18} />
        <span>Se o link falhar, mande os prints dos slides. O fluxo continua igual.</span>
      </div>
    </section>
  );
}

function ReviewStage({
  run,
  slides,
  activeIndex,
  setActiveIndex,
  onSlideChange,
  captionPortuguese,
  setCaptionPortuguese,
  hashtags,
  setHashtags,
  onSave,
  saving,
}) {
  const slide = slides[activeIndex];

  return (
    <section className="stage-card review-stage">
      <div className="stage-split">
        <div className="preview-stack">
          <div className="stage-copy compact">
            <p className="stage-label">Etapa 02</p>
            <h2>Revise como se fosse um roteiro</h2>
            <p>Você só vê português aqui. Na próxima etapa, o sistema converte sua revisão para inglês por baixo.</p>
          </div>

          <PhonePreview
            slide={slide}
            slideIndex={activeIndex}
            total={slides.length}
            onPrev={() => setActiveIndex(Math.max(0, activeIndex - 1))}
            onNext={() => setActiveIndex(Math.min(slides.length - 1, activeIndex + 1))}
          />
          <SlideRail slides={slides} activeIndex={activeIndex} onSelect={setActiveIndex} />
        </div>

        <div className="editor-panel">
          <label className="input-group tall">
            <span>Texto do slide {slide?.index}</span>
            <textarea
              value={slide?.reviewedPortuguese || ""}
              onChange={(event) => onSlideChange({ ...slide, reviewedPortuguese: event.target.value })}
              placeholder="Corrija o texto deste slide em português..."
            />
          </label>

          <div className="mini-grid">
            <label className="input-group">
              <span>Legenda do post</span>
              <textarea
                value={captionPortuguese}
                onChange={(event) => setCaptionPortuguese(event.target.value)}
                placeholder="Legenda para revisar"
              />
            </label>
            <label className="input-group">
              <span>Hashtags</span>
              <textarea value={hashtags} onChange={(event) => setHashtags(event.target.value)} placeholder="#fitness #gym #motivation" />
            </label>
          </div>

          <div className="editor-footer">
            <span>
              {run.slides.length} slides carregados. Revise no seu ritmo e avance quando estiver ok.
            </span>
            <button className="action-button main-action" type="button" onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
              Salvar e continuar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ImageStage({ run, selectedFiles, onSelectFiles, previews, onUpload, uploading }) {
  const inputRef = useRef(null);
  const expected = run.slides.length;
  const ready = selectedFiles.length === expected;

  return (
    <section className="stage-card image-stage">
      <div className="stage-copy">
        <p className="stage-label">Etapa 03</p>
        <h2>Envie suas novas imagens</h2>
        <p>
          Selecione exatamente {expected} imagens. A ordem importa: a primeira imagem vira o slide 1, a segunda vira o
          slide 2, e assim por diante.
        </p>
      </div>

      <button className="upload-zone" type="button" onClick={() => inputRef.current?.click()}>
        <ImagePlus size={34} />
        <strong>{selectedFiles.length ? `${selectedFiles.length}/${expected} imagens selecionadas` : "Escolher imagens"}</strong>
        <span>{ready ? "Tudo certo para enviar." : `Faltam ${Math.max(0, expected - selectedFiles.length)} imagens.`}</span>
      </button>
      <input hidden ref={inputRef} type="file" accept="image/*" multiple onChange={(event) => onSelectFiles(event.target.files)} />

      {previews.length > 0 && (
        <div className="image-order-grid">
          {previews.map((preview, index) => (
            <article className="image-order-card" key={`${preview.name}-${index}`}>
              <img src={preview.url} alt={`Nova imagem ${index + 1}`} />
              <div>
                <span>Imagem {index + 1}</span>
                <strong>{preview.name}</strong>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="stage-footer">
        <button className="action-button main-action" type="button" onClick={onUpload} disabled={!ready || uploading}>
          {uploading ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
          Enviar imagens
        </button>
      </div>
    </section>
  );
}

function GenerateStage({ run, onRender, rendering }) {
  return (
    <section className="stage-card generate-stage">
      <div className="stage-copy">
        <p className="stage-label">Etapa 04</p>
        <h2>Gerar slideshow final</h2>
        <p>Agora eu aplico o texto revisado nas imagens novas, mantendo formato vertical e texto legível para TikTok.</p>
      </div>

      <div className="generate-board">
        <div>
          <strong>{run.slides.length}</strong>
          <span>slides prontos para renderizar</span>
        </div>
        <div>
          <strong>{hashtagsToText(run.hashtags) || "Sem hashtags"}</strong>
          <span>hashtags salvas</span>
        </div>
      </div>

      <button className="action-button main-action huge-action" type="button" onClick={onRender} disabled={rendering}>
        {rendering ? <Loader2 className="spin" size={20} /> : <Play size={20} />}
        Gerar preview final
      </button>
    </section>
  );
}

function DownloadStage({ run, activeIndex, setActiveIndex }) {
  const slide = run.slides[activeIndex];
  const caption = run.captionPortuguese || run.captionEnglish || "";
  const hashtags = hashtagsToText(run.hashtags);

  return (
    <section className="stage-card download-stage">
      <div className="stage-split">
        <div className="preview-stack">
          <div className="stage-copy compact">
            <p className="stage-label">Etapa 05</p>
            <h2>Preview final</h2>
            <p>Confira o slideshow como ele vai sair. Baixe um slide específico ou tudo em ZIP.</p>
          </div>
          <PhonePreview
            rendered
            slide={slide}
            slideIndex={activeIndex}
            total={run.slides.length}
            onPrev={() => setActiveIndex(Math.max(0, activeIndex - 1))}
            onNext={() => setActiveIndex(Math.min(run.slides.length - 1, activeIndex + 1))}
          />
          <SlideRail rendered slides={run.slides} activeIndex={activeIndex} onSelect={setActiveIndex} />
        </div>

        <div className="download-panel">
          <div className="download-actions">
            <a className="action-button main-action" href={`${apiBase}/api/runs/${run.runId}/slides/${slide.index}/download`} target="_blank" rel="noreferrer">
              <Download size={18} />
              Baixar slide atual
            </a>
            <a className="action-button ghost-action" href={`${apiBase}/api/runs/${run.runId}/export.zip`} target="_blank" rel="noreferrer">
              <Download size={18} />
              Baixar ZIP completo
            </a>
          </div>

          <article className="script-card">
            <span>Legenda</span>
            <p>{caption || "Nenhuma legenda detectada."}</p>
            <button type="button" onClick={() => copyText(caption)}>
              <Clipboard size={16} />
              Copiar legenda
            </button>
          </article>

          <article className="script-card">
            <span>Hashtags</span>
            <p>{hashtags || "Nenhuma hashtag detectada."}</p>
            <button type="button" onClick={() => copyText(hashtags)}>
              <Clipboard size={16} />
              Copiar hashtags
            </button>
          </article>
        </div>
      </div>
    </section>
  );
}

export function App() {
  const [url, setUrl] = useState(sampleUrl);
  const [status, setStatus] = useState("Pronto para começar.");
  const [error, setError] = useState("");
  const [run, setRun] = useState(null);
  const [draftSlides, setDraftSlides] = useState([]);
  const [draftCaptionEnglish, setDraftCaptionEnglish] = useState("");
  const [draftCaptionPortuguese, setDraftCaptionPortuguese] = useState("");
  const [draftHashtags, setDraftHashtags] = useState("");
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [replacementFiles, setReplacementFiles] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [rendering, setRendering] = useState(false);

  const activeStage = getActiveStage(run);
  const replacementPreviews = useMemo(
    () =>
      replacementFiles.map((file) => ({
        file,
        name: file.name,
        url: URL.createObjectURL(file),
      })),
    [replacementFiles]
  );

  useEffect(() => {
    return () => {
      replacementPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [replacementPreviews]);

  function hydrateRun(nextRun) {
    setRun(nextRun);
    setDraftSlides(nextRun.slides.map((slide) => ({ ...slide })));
    setDraftCaptionEnglish(nextRun.captionEnglish || "");
    setDraftCaptionPortuguese(nextRun.captionPortuguese || "");
    setDraftHashtags(hashtagsToText(nextRun.hashtags));
    setCurrentReviewIndex(0);
    setPreviewIndex(0);
  }

  async function extractPost() {
    setError("");
    setExtracting(true);
    setStatus("Extraindo slides e lendo o texto...");

    try {
      const response = await fetch(`${apiBase}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui extrair esse post.");
      hydrateRun(data);
      setStatus(`${data.slides.length} slides prontos para revisar.`);
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Extração não concluída.");
    } finally {
      setExtracting(false);
    }
  }

  async function uploadScreenshots(fileList) {
    const selected = Array.from(fileList || []);
    if (!selected.length) return;

    setError("");
    setExtracting(true);
    setStatus("Lendo os prints enviados...");

    try {
      const formData = new FormData();
      selected.forEach((file) => formData.append("slides", file));
      const response = await fetch(`${apiBase}/api/ocr-upload`, { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui ler esses prints.");
      hydrateRun(data);
      setStatus(`${data.slides.length} slides prontos para revisar.`);
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Leitura dos prints não concluída.");
    } finally {
      setExtracting(false);
    }
  }

  function updateDraftSlide(nextSlide) {
    setDraftSlides((current) => current.map((slide) => (slide.index === nextSlide.index ? nextSlide : slide)));
  }

  async function saveReview() {
    if (!run) return;

    setError("");
    setSavingReview(true);
    setStatus("Salvando revisão e preparando inglês final...");

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
      if (!reconcileResponse.ok) throw new Error(reconciled.error || "Não consegui converter sua revisão.");

      const slidesToSave = draftSlides.map((slide) => {
        const match = reconciled.slides.find((entry) => entry.index === slide.index);
        return {
          ...slide,
          reviewedEnglish: match?.reviewedEnglish || slide.reviewedEnglish,
        };
      });
      const captionEnglishToSave = reconciled.captionEnglish || draftCaptionEnglish;

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
      if (!response.ok) throw new Error(data.error || "Não consegui salvar a revisão.");
      hydrateRun(data);
      setStatus("Revisão salva. Agora envie suas imagens.");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Revisão não salva.");
    } finally {
      setSavingReview(false);
    }
  }

  function selectReplacementFiles(fileList) {
    setReplacementFiles(Array.from(fileList || []));
  }

  async function uploadReplacementImages() {
    if (!run) return;
    if (replacementFiles.length !== run.slides.length) {
      setError(`Escolha exatamente ${run.slides.length} imagens.`);
      return;
    }

    setError("");
    setUploadingImages(true);
    setStatus("Enviando imagens novas...");

    try {
      const formData = new FormData();
      replacementFiles.forEach((file) => formData.append("images", file));
      const response = await fetch(`${apiBase}/api/runs/${run.runId}/replacements`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui enviar as imagens.");
      hydrateRun(data);
      setStatus("Imagens salvas. Pode gerar o preview.");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Upload não concluído.");
    } finally {
      setUploadingImages(false);
    }
  }

  async function renderSlideshow() {
    if (!run) return;

    setError("");
    setRendering(true);
    setStatus("Gerando slideshow final...");

    try {
      const response = await fetch(`${apiBase}/api/runs/${run.runId}/render`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui gerar o preview.");
      hydrateRun(data);
      setStatus("Preview pronto para baixar.");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Preview não gerado.");
    } finally {
      setRendering(false);
    }
  }

  return (
    <main className="app-shell">
      <StepRail activeStage={activeStage} />

      <section className="studio">
        <StudioHeader activeStage={activeStage} status={status} />

        {error && (
          <div className="error-banner" role="alert">
            <strong>Precisa de atenção</strong>
            <span>{error}</span>
          </div>
        )}

        {activeStage === "extract" && (
          <ExtractStage
            url={url}
            setUrl={setUrl}
            extracting={extracting}
            onExtract={extractPost}
            onUploadScreenshots={uploadScreenshots}
          />
        )}

        {activeStage === "review" && run && (
          <ReviewStage
            run={run}
            slides={draftSlides}
            activeIndex={currentReviewIndex}
            setActiveIndex={setCurrentReviewIndex}
            onSlideChange={updateDraftSlide}
            captionPortuguese={draftCaptionPortuguese}
            setCaptionPortuguese={setDraftCaptionPortuguese}
            hashtags={draftHashtags}
            setHashtags={setDraftHashtags}
            onSave={saveReview}
            saving={savingReview}
          />
        )}

        {activeStage === "images" && run && (
          <ImageStage
            run={run}
            selectedFiles={replacementFiles}
            onSelectFiles={selectReplacementFiles}
            previews={replacementPreviews}
            onUpload={uploadReplacementImages}
            uploading={uploadingImages}
          />
        )}

        {activeStage === "generate" && run && <GenerateStage run={run} onRender={renderSlideshow} rendering={rendering} />}

        {activeStage === "download" && run && <DownloadStage run={run} activeIndex={previewIndex} setActiveIndex={setPreviewIndex} />}

        {(extracting || savingReview || uploadingImages || rendering) && (
          <div className="work-overlay">
            <LoadingIcon active />
            <span>{status}</span>
          </div>
        )}
      </section>
    </main>
  );
}
