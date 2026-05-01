import {
  ArrowRight,
  CalendarClock,
  Check,
  Clipboard,
  Download,
  ImagePlus,
  Loader2,
  Play,
  ScanText,
  Send,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { mergeReplacementFiles, moveReplacementFile } from "./replacement-files.js";

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
  { key: "publish", number: "06", title: "Publicar", hint: "Postiz e contas" },
];

const stageByRun = {
  review: "review",
  images: "images",
  render: "generate",
  preview: "download",
  publish: "publish",
};

const stageIndex = Object.fromEntries(steps.map((step, index) => [step.key, index]));

function assetUrl(pathname) {
  if (!pathname) return "";
  if (/^https?:\/\//i.test(pathname)) return pathname;
  return `${apiBase}${pathname}`;
}

function hasContent(value) {
  return String(value || "").trim().length > 0;
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
  const canGoBack = total > 1 && slideIndex > 0;
  const canGoNext = total > 1 && slideIndex < total - 1;

  return (
    <div className="phone-preview">
      <div className="phone-preview__top">
        <span>{slide ? `Slide ${slide.index}` : "Preview"}</span>
        <span>{total ? `${slideIndex + 1}/${total}` : "0/0"}</span>
      </div>
      <div className="phone-screen">
        {total > 1 && (
          <div className="story-progress" aria-hidden="true">
            {Array.from({ length: total }).map((_, index) => (
              <span className={index <= slideIndex ? "active" : ""} key={index} />
            ))}
          </div>
        )}
        {imageUrl ? (
          <img src={imageUrl} alt={slide ? `Preview do slide ${slide.index}` : "Preview vazio"} />
        ) : (
          <div className="empty-screen">
            <Sparkles size={30} />
            <p>O preview aparece aqui.</p>
          </div>
        )}
        {total > 1 && (
          <>
            <button
              className="story-tap-zone story-tap-zone--left"
              type="button"
              onClick={onPrev}
              disabled={!canGoBack}
              aria-label="Slide anterior"
            >
              <span>Anterior</span>
            </button>
            <button
              className="story-tap-zone story-tap-zone--right"
              type="button"
              onClick={onNext}
              disabled={!canGoNext}
              aria-label="Próximo slide"
            >
              <span>Próximo</span>
            </button>
            <div className="story-hint" aria-hidden="true">
              Clique nas laterais para passar
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ExtractStage({ url, setUrl, onExtract, extracting, onUploadScreenshots }) {
  const uploadRef = useRef(null);

  return (
    <section className="stage-card extract-stage">
      <div className="stage-copy">
        <p className="stage-label">Etapa 01</p>
        <h2>Cole o link do slideshow</h2>
        <p>
          Eu baixo os slides, leio o texto das imagens e preparo a revisão em português. Se o link travar, envie os
          prints e siga o mesmo fluxo.
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
        <span>O fluxo é local: extrai, revisa, troca as imagens, gera preview e baixa ZIP.</span>
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
  const showPostMeta = hasContent(captionPortuguese) || hasContent(hashtags);

  return (
    <section className="stage-card review-stage">
      <div className="review-toolbar">
        <div>
          <p className="stage-label">Etapa 02</p>
          <h2>Revise o texto do slide</h2>
          <p>Você edita em português. Na geração, eu transformo essa revisão em inglês por baixo.</p>
        </div>
        <div className="review-toolbar__actions">
          <span className="review-count">
            Slide {activeIndex + 1} de {slides.length}
          </span>
          <button className="action-button main-action" type="button" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
            Salvar e continuar
          </button>
        </div>
      </div>

      <div className="review-workbench">
        <div className="story-column">
          <PhonePreview
            slide={slide}
            slideIndex={activeIndex}
            total={slides.length}
            onPrev={() => setActiveIndex(Math.max(0, activeIndex - 1))}
            onNext={() => setActiveIndex(Math.min(slides.length - 1, activeIndex + 1))}
          />
          <SlideRail slides={slides} activeIndex={activeIndex} onSelect={setActiveIndex} />
        </div>

        <div className="editor-panel review-editor-panel">
          <label className="input-group tall">
            <span>Texto em português do slide {slide?.index}</span>
            <textarea
              value={slide?.reviewedPortuguese || ""}
              onChange={(event) => onSlideChange({ ...slide, reviewedPortuguese: event.target.value })}
              placeholder="Corrija o texto deste slide em português..."
            />
          </label>

          {showPostMeta && (
            <div className="post-meta-panel">
              {hasContent(captionPortuguese) && (
                <label className="input-group">
                  <span>Descrição do TikTok</span>
                  <textarea
                    value={captionPortuguese}
                    onChange={(event) => setCaptionPortuguese(event.target.value)}
                    placeholder="Texto da descrição do post"
                  />
                </label>
              )}
              {hasContent(hashtags) && (
                <label className="input-group">
                  <span>Hashtags encontradas</span>
                  <textarea value={hashtags} onChange={(event) => setHashtags(event.target.value)} placeholder="#fitness #gym #motivation" />
                </label>
              )}
            </div>
          )}

          <div className="editor-footer">
            <span>{run.slides.length} slides carregados. Clique nas laterais da imagem para navegar sem rolar a página.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ImageStage({ run, selectedFiles, onSelectFiles, onRemoveFile, onMoveFile, onClearFiles, previews, onUpload, uploading }) {
  const inputRef = useRef(null);
  const expected = run.slides.length;
  const ready = selectedFiles.length === expected;
  const slots = Array.from({ length: expected }, (_, index) => previews[index] || null);
  const missing = Math.max(0, expected - selectedFiles.length);

  function handleFileInput(event) {
    onSelectFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event) {
    event.preventDefault();
    onSelectFiles(event.dataTransfer.files);
  }

  return (
    <section className="stage-card image-stage">
      <div className="stage-copy">
        <p className="stage-label">Etapa 03</p>
        <h2>Envie suas novas imagens</h2>
        <p>
          Pode escolher tudo de uma vez ou ir adicionando aos poucos. Eu mantenho a ordem e aceito imagens comuns do seu
          PC, mesmo que não sejam 9:16.
        </p>
      </div>

      <button
        className={`upload-zone ${ready ? "ready" : ""}`}
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <ImagePlus size={34} />
        <strong>{selectedFiles.length ? `${selectedFiles.length}/${expected} imagens na fila` : "Escolher ou arrastar imagens"}</strong>
        <span>{ready ? "Tudo certo para enviar." : `Faltam ${missing} imagens. Selecione só as que faltam que eu adiciono sem apagar as anteriores.`}</span>
      </button>
      <input hidden ref={inputRef} type="file" accept="image/*" multiple onChange={handleFileInput} />

      <div className="image-stage-actions">
        <button className="action-button ghost-action" type="button" onClick={() => inputRef.current?.click()} disabled={ready}>
          <ImagePlus size={18} />
          Adicionar imagens
        </button>
        <button className="action-button quiet-action" type="button" onClick={onClearFiles} disabled={!selectedFiles.length || uploading}>
          Limpar seleção
        </button>
      </div>

      <div className="image-slot-grid" aria-label="Ordem das imagens finais">
        {slots.map((preview, index) => (
          <article className={`image-slot-card ${preview ? "filled" : ""}`} key={index}>
            {preview ? (
              <>
                <img src={preview.url} alt={`Nova imagem ${index + 1}`} />
                <div className="image-slot-card__actions">
                  <button type="button" onClick={() => onMoveFile(index, index - 1)} disabled={uploading || index === 0}>
                    ←
                  </button>
                  <button type="button" onClick={() => onMoveFile(index, index + 1)} disabled={uploading || index === selectedFiles.length - 1}>
                    →
                  </button>
                  <button type="button" onClick={() => onRemoveFile(index)} disabled={uploading} aria-label={`Remover imagem ${index + 1}`}>
                    Remover
                  </button>
                </div>
              </>
            ) : (
              <div>
                <ImagePlus size={22} />
                <strong>Imagem {index + 1}</strong>
                <span>vazia</span>
              </div>
            )}
            <footer>
              <span>Slide {index + 1}</span>
              <strong>{preview?.name || "aguardando imagem"}</strong>
            </footer>
          </article>
        ))}
      </div>

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
  const hashtags = hashtagsToText(run.hashtags);

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
        {hasContent(hashtags) && (
          <div>
            <strong>{hashtags}</strong>
            <span>hashtags salvas</span>
          </div>
        )}
      </div>

      <button className="action-button main-action huge-action" type="button" onClick={onRender} disabled={rendering}>
        {rendering ? <Loader2 className="spin" size={20} /> : <Play size={20} />}
        Gerar preview final
      </button>
    </section>
  );
}

function DownloadStage({ run, activeIndex, setActiveIndex, onContinue }) {
  const slide = run.slides[activeIndex];
  const caption = run.captionPortuguese || run.captionEnglish || "";
  const hashtags = hashtagsToText(run.hashtags);

  return (
    <section className="stage-card download-stage">
      <div className="download-workbench">
        <div className="story-column">
          <div className="download-title">
            <p className="stage-label">Etapa 05</p>
            <h2>Preview final</h2>
            <p>Clique nas laterais para conferir todos os slides.</p>
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
            <button className="action-button main-action" type="button" onClick={onContinue}>
              <Send size={18} />
              Publicar no Postiz
            </button>
          </div>

          {hasContent(caption) && (
            <article className="script-card">
              <span>Descrição</span>
              <p>{caption}</p>
              <button type="button" onClick={() => copyText(caption)}>
                <Clipboard size={16} />
                Copiar descrição
              </button>
            </article>
          )}

          {hasContent(hashtags) && (
            <article className="script-card">
              <span>Hashtags</span>
              <p>{hashtags}</p>
              <button type="button" onClick={() => copyText(hashtags)}>
                <Clipboard size={16} />
                Copiar hashtags
              </button>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

function PublishStage({ run, accounts, loadingAccounts, onRefreshAccounts, onConnectPostiz, onQueue, publishing }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set((run.destinations || []).map((destination) => destination.accountId)));
  const [scheduledAt, setScheduledAt] = useState("");
  const caption = [run.captionEnglish, hashtagsToText(run.hashtags)].filter(Boolean).join(" ").trim();

  useEffect(() => {
    setSelectedIds(new Set((run.destinations || []).map((destination) => destination.accountId)));
  }, [run.runId]);

  function toggleAccount(accountId) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  const destinations = accounts
    .filter((account) => selectedIds.has(account.id))
    .map((account) => ({
      accountId: account.id,
      accountName: account.name,
      accountHandle: account.handle,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    }));

  return (
    <section className="stage-card publish-stage">
      <div className="publish-layout">
        <div className="stage-copy">
          <p className="stage-label">Etapa 06</p>
          <h2>Enviar para o Postiz</h2>
          <p>
            Selecione as contas TikTok, defina um horário opcional e envie como rascunho seguro. Depois você finaliza no
            app do TikTok.
          </p>
          <div className="safe-mode-card">
            <CalendarClock size={22} />
            <div>
              <strong>Modo seguro ativado</strong>
              <span>O app cria rascunho/upload no Postiz, não publicação direta automática.</span>
            </div>
          </div>
        </div>

        <div className="publish-panel">
          <div className="publish-panel__header">
            <strong>Contas TikTok</strong>
            <button className="action-button quiet-action" type="button" onClick={onRefreshAccounts} disabled={loadingAccounts}>
              {loadingAccounts ? <Loader2 className="spin" size={16} /> : <ScanText size={16} />}
              Atualizar
            </button>
          </div>

          {!accounts.length && (
            <div className="empty-publish">
              <p>Nenhuma conta TikTok carregada. Conecte o Postiz uma vez e depois escolha as contas.</p>
              <button className="action-button main-action" type="button" onClick={onConnectPostiz}>
                <Send size={16} />
                Conectar Postiz
              </button>
            </div>
          )}

          <div className="account-grid">
            {accounts.map((account) => (
              <button
                className={`account-card ${selectedIds.has(account.id) ? "selected" : ""}`}
                key={account.id}
                type="button"
                onClick={() => toggleAccount(account.id)}
              >
                {account.picture ? <img src={account.picture} alt="" /> : <span>{(account.name || "T").slice(0, 1)}</span>}
                <div>
                  <strong>{account.name || "TikTok"}</strong>
                  <small>{account.handle ? `@${account.handle}` : account.id}</small>
                </div>
                <Check size={18} />
              </button>
            ))}
          </div>

          <label className="input-group">
            <span>Horário opcional</span>
            <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
          </label>

          <article className="script-card compact-script">
            <span>Legenda final em inglês</span>
            <p>{caption || "Sem legenda detectada."}</p>
          </article>

          {!!run.destinations?.length && (
            <div className="destination-status-list">
              {run.destinations.map((destination) => (
                <div key={destination.accountId}>
                  <strong>{destination.accountName || destination.accountHandle || destination.accountId}</strong>
                  <span>{destination.status === "waiting_manual_publish" ? "Rascunho enviado" : destination.status}</span>
                </div>
              ))}
            </div>
          )}

          <button
            className="action-button main-action huge-action"
            type="button"
            onClick={() => onQueue(destinations)}
            disabled={publishing || !destinations.length}
          >
            {publishing ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            Enviar rascunho para {destinations.length || 0} conta(s)
          </button>
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
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [publishing, setPublishing] = useState(false);

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

  useEffect(() => {
    if (activeStage === "publish" && !accounts.length && !loadingAccounts) {
      loadPostizAccounts();
    }
  }, [activeStage]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");
    if (window.location.pathname !== "/callback" || (!code && !oauthError)) return;

    async function finishPostizOAuth() {
      setStatus("Conectando Postiz...");
      setError("");
      try {
        const response = await fetch(`${apiBase}/api/postiz/oauth/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, state, error: oauthError }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não consegui conectar o Postiz.");
        setAccounts(data.accounts || []);
        setStatus("Postiz conectado. Volte para a etapa Publicar.");
        window.history.replaceState({}, "", "/");
      } catch (requestError) {
        setError(requestError.message);
        setStatus("Postiz não conectado.");
      }
    }

    finishPostizOAuth();
  }, []);

  function hydrateRun(nextRun) {
    setRun(nextRun);
    setDraftSlides(nextRun.slides.map((slide) => ({ ...slide })));
    setDraftCaptionEnglish(nextRun.captionEnglish || "");
    setDraftCaptionPortuguese(nextRun.captionPortuguese || "");
    setDraftHashtags(hashtagsToText(nextRun.hashtags));
    setCurrentReviewIndex(0);
    setPreviewIndex(0);
    setReplacementFiles([]);
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
    const incoming = Array.from(fileList || []);
    if (!incoming.length || !run) return;

    setError("");
    setReplacementFiles((current) => {
      const result = mergeReplacementFiles(current, incoming, run.slides.length);
      if (result.acceptedCount > 0) {
        setStatus(`${result.files.length}/${run.slides.length} imagens selecionadas.`);
      }
      if (result.invalidCount > 0) {
        setError(`${result.invalidCount} arquivo(s) ignorado(s), porque não eram imagem.`);
      }
      if (result.ignoredCount > 0) {
        setStatus(`Fila completa. Ignorei ${result.ignoredCount} imagem(ns) extra.`);
      }
      if (result.acceptedCount === 0 && result.invalidCount === 0 && result.ignoredCount === 0) {
        setStatus("Nenhuma imagem nova selecionada.");
      }
      return result.files;
    });
  }

  function removeReplacementFile(indexToRemove) {
    setReplacementFiles((current) => current.filter((_, index) => index !== indexToRemove));
    setError("");
    setStatus("Imagem removida da fila.");
  }

  function moveReplacementImage(fromIndex, toIndex) {
    setReplacementFiles((current) => moveReplacementFile(current, fromIndex, toIndex));
    setError("");
    setStatus("Ordem das imagens ajustada.");
  }

  function clearReplacementFiles() {
    setReplacementFiles([]);
    setError("");
    setStatus("Seleção limpa. Escolha as imagens novamente.");
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

  async function loadPostizAccounts() {
    setLoadingAccounts(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/api/postiz/accounts`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui carregar as contas do Postiz.");
      setAccounts(data.accounts || []);
      setStatus(data.accounts?.length ? `${data.accounts.length} conta(s) TikTok carregada(s).` : "Nenhuma conta TikTok encontrada no Postiz.");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Postiz ainda não conectado.");
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function connectPostiz() {
    setError("");
    setStatus("Abrindo autorização do Postiz...");
    try {
      const response = await fetch(`${apiBase}/api/postiz/oauth/start`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui iniciar a conexão com Postiz.");
      window.location.href = data.authorizeUrl;
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Conexão com Postiz não iniciada.");
    }
  }

  async function queuePostizDraft(destinations) {
    if (!run) return;
    setPublishing(true);
    setError("");
    setStatus("Enviando rascunho para o Postiz...");

    try {
      const response = await fetch(`${apiBase}/api/runs/${run.runId}/postiz/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinations }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui enviar ao Postiz.");
      hydrateRun(data.run);
      setStatus("Rascunho enviado. Confira no Postiz/TikTok antes de publicar.");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Envio ao Postiz não concluído.");
    } finally {
      setPublishing(false);
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
            onRemoveFile={removeReplacementFile}
            onMoveFile={moveReplacementImage}
            onClearFiles={clearReplacementFiles}
            previews={replacementPreviews}
            onUpload={uploadReplacementImages}
            uploading={uploadingImages}
          />
        )}

        {activeStage === "generate" && run && <GenerateStage run={run} onRender={renderSlideshow} rendering={rendering} />}

        {activeStage === "download" && run && (
          <DownloadStage
            run={run}
            activeIndex={previewIndex}
            setActiveIndex={setPreviewIndex}
            onContinue={() => {
              setRun({ ...run, stage: "publish" });
              loadPostizAccounts();
            }}
          />
        )}

        {activeStage === "publish" && run && (
          <PublishStage
            run={run}
            accounts={accounts}
            loadingAccounts={loadingAccounts}
            onRefreshAccounts={loadPostizAccounts}
            onConnectPostiz={connectPostiz}
            onQueue={queuePostizDraft}
            publishing={publishing}
          />
        )}

        {(extracting || savingReview || uploadingImages || rendering || publishing) && (
          <div className="work-overlay">
            <LoadingIcon active />
            <span>{status}</span>
          </div>
        )}
      </section>
    </main>
  );
}
