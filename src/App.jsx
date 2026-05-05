import {
  ArrowRight,
  Check,
  Clipboard,
  Download,
  ImagePlus,
  Loader2,
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
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://caewwltkbmblwijkfrlz.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_ujhVT6Uz1JoSHCW-fVuI6A_MuSHpSqH";
const authSessionStorageKey = "automatizador-tiktok.authSession";
const sampleUrl =
  "https://www.tiktok.com/@landon.vaughn17/photo/7633592588674551053?is_from_webapp=1&sender_device=pc&web_id=7634388741662869010";
const extractionEstimateSeconds = 300;

const steps = [
  { key: "extract", number: "01", title: "Extrair", hint: "Link ou prints" },
  { key: "review", number: "02", title: "Revisar", hint: "Texto em português" },
  { key: "images", number: "03", title: "Imagens", hint: "Substituir na ordem" },
  { key: "download", number: "04", title: "Finalizar", hint: "Preview e Drive" },
];

const stageByRun = {
  review: "review",
  images: "images",
  render: "images",
  preview: "download",
  publish: "download",
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

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function stageLabel(stage) {
  const labels = {
    review: "Revisão",
    images: "Imagens",
    render: "Imagens",
    preview: "Finalizado",
    publish: "Finalizado",
  };
  return labels[stage] || "Novo";
}

function projectTitle(project) {
  const caption = project.captionPortuguese || project.captionEnglish || "";
  if (caption.trim()) return caption.trim().slice(0, 72);
  try {
    const url = new URL(project.sourceUrl || project.source_url || "");
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.length >= 3 ? `${parts[0]} · ${parts[2]}` : parts[0] || `Projeto ${projectDate(project)}`;
  } catch {
    return `Projeto ${projectDate(project) || "salvo"}`;
  }
}

function projectDate(project) {
  const value = project.updatedAt || project.updated_at || project.createdAt || project.created_at;
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value)
  );
}

function LoadingIcon({ active }) {
  return active ? <Loader2 className="spin" size={18} /> : null;
}

function LoginScreen({ email, password, setEmail, setPassword, loading, onSubmit, error }) {
  return (
    <main className="app-shell auth-shell">
      <section className="studio auth-studio">
        <header className="studio-header auth-header">
          <div>
            <p className="kicker">Login</p>
            <h1>Entrar</h1>
          </div>
        </header>

        <section className="stage-card auth-card">
          <div className="stage-copy">
            <p className="stage-label">Acesso</p>
            <h2>Digite seu e-mail e senha</h2>
          </div>

          <div className="auth-form">
            <label className="input-group">
              <span>E-mail</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" />
            </label>

            <label className="input-group">
              <span>Senha</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSubmit();
                }}
                type="password"
                autoComplete="current-password"
                placeholder="Sua senha"
              />
            </label>

            <button className="action-button main-action huge-action" type="button" onClick={onSubmit} disabled={loading}>
              {loading ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
              Entrar
            </button>
          </div>

          {error ? (
            <div className="auth-error" role="alert">
              {error}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
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

function ProjectList({ projects, loading, onOpenProject, onRefreshProjects }) {
  return (
    <div className="projects-panel">
      <div className="projects-panel__header">
        <div>
          <span>Projetos</span>
          <strong>Continue de onde parou</strong>
        </div>
        <button className="action-button quiet-action" type="button" onClick={onRefreshProjects} disabled={loading}>
          {loading ? <Loader2 className="spin" size={16} /> : <ScanText size={16} />}
          Atualizar
        </button>
      </div>

      {projects.length ? (
        <div className="project-grid">
          {projects.map((project) => (
            <button className="project-card" type="button" key={project.runId} onClick={() => onOpenProject(project)}>
              <span>{stageLabel(project.stage)}</span>
              <strong>{projectTitle(project)}</strong>
              <small>{projectDate(project)}</small>
              {project.hashtags?.length ? <em>{hashtagsToText(project.hashtags).slice(0, 90)}</em> : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="project-empty">{loading ? "Carregando projetos..." : "Nenhum projeto salvo ainda."}</div>
      )}
    </div>
  );
}

function ExtractStage({
  url,
  setUrl,
  onExtract,
  extracting,
  onUploadScreenshots,
  elapsedSeconds,
  remainingSeconds,
  projects,
  loadingProjects,
  onOpenProject,
  onRefreshProjects,
}) {
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

      {extracting && (
        <div className="extract-timer" role="status" aria-live="polite">
          <div className="extract-timer__grid">
            <div className="extract-timer__metric">
              <span>Tempo padrão</span>
              <strong>até 5 minutos</strong>
            </div>
            <div className="extract-timer__metric">
              <span>Rodando há</span>
              <strong>{formatDuration(elapsedSeconds)}</strong>
            </div>
            <div className="extract-timer__metric">
              <span>Previsão</span>
              <strong>{remainingSeconds > 0 ? formatDuration(remainingSeconds) : "finalizando"}</strong>
            </div>
          </div>
          <p>Estou baixando os slides, lendo o texto e preparando a revisão. Se passar disso, eu mostro o erro na tela.</p>
        </div>
      )}

      <div className="soft-note">
        <Sparkles size={18} />
        <span>Fluxo: extrair, revisar, trocar imagens, conferir preview e enviar para o Drive.</span>
      </div>

      <ProjectList projects={projects} loading={loadingProjects} onOpenProject={onOpenProject} onRefreshProjects={onRefreshProjects} />
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
  const [draggedIndex, setDraggedIndex] = useState(null);
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

  function handleCardDrop(event, index) {
    event.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    onMoveFile(draggedIndex, index);
    setDraggedIndex(null);
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
          <article
            className={`image-slot-card ${preview ? "filled" : ""} ${draggedIndex === index ? "dragging" : ""}`}
            key={index}
            draggable={Boolean(preview) && !uploading}
            onDragStart={() => setDraggedIndex(index)}
            onDragEnd={() => setDraggedIndex(null)}
            onDragOver={(event) => {
              if (preview) event.preventDefault();
            }}
            onDrop={(event) => handleCardDrop(event, index)}
          >
            {preview ? (
              <>
                <img src={preview.url} alt={`Nova imagem ${index + 1}`} />
                <div className="image-slot-card__actions">
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
          OK, montar slideshow
        </button>
      </div>
    </section>
  );
}

function DrivePanel({ run, folders, connected, loading, exporting, onRefresh, onConnect, onExport }) {
  const [selectedFolderId, setSelectedFolderId] = useState("");

  useEffect(() => {
    if (!selectedFolderId && folders.length) setSelectedFolderId(folders[0].id);
  }, [folders, selectedFolderId]);

  return (
    <article className="drive-panel">
      <div className="drive-panel__header">
        <div>
          <span>Google Drive</span>
          <strong>Enviar para um perfil</strong>
        </div>
        <button className="action-button quiet-action" type="button" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 className="spin" size={16} /> : <ScanText size={16} />}
          Atualizar
        </button>
      </div>

      {run.driveExport ? (
        <div className="drive-success">
          <Check size={18} />
          <div>
            <strong>Enviado para {run.driveExport.folderName}</strong>
            <span>{run.driveExport.files?.length || 0} arquivos salvos no Drive.</span>
          </div>
        </div>
      ) : null}

      {folders.length ? (
        <>
          <label className="input-group">
            <span>Pasta em tiktokapp</span>
            <select value={selectedFolderId} onChange={(event) => setSelectedFolderId(event.target.value)}>
              {folders.map((folder) => (
                <option value={folder.id} key={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
          <button className="action-button main-action" type="button" onClick={() => onExport(selectedFolderId)} disabled={exporting || !selectedFolderId}>
            {exporting ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            Criar post no perfil
          </button>
        </>
      ) : connected ? (
        <div className="empty-publish">
          <p>Drive conectado, mas não encontrei as pastas Perfil 1, Perfil 2 e Perfil 3 dentro de tiktokapp.</p>
          <button className="action-button main-action" type="button" onClick={onConnect} disabled={loading}>
            <Send size={16} />
            Reconectar Drive
          </button>
        </div>
      ) : (
        <div className="empty-publish">
          <p>Conecte o Google Drive para escolher a pasta de destino.</p>
          <button className="action-button main-action" type="button" onClick={onConnect} disabled={loading}>
            <Send size={16} />
            Conectar Drive
          </button>
        </div>
      )}
    </article>
  );
}

function DownloadStage({ run, activeIndex, setActiveIndex, driveFolders, driveConnected, loadingDrive, exportingDrive, onRefreshDrive, onConnectDrive, onExportDrive }) {
  const slide = run.slides[activeIndex];
  const caption = run.captionPortuguese || run.captionEnglish || "";
  const hashtags = hashtagsToText(run.hashtags);

  return (
    <section className="stage-card download-stage">
      <div className="download-workbench">
        <div className="story-column">
          <div className="download-title">
            <p className="stage-label">Etapa 04</p>
            <h2>Preview final</h2>
            <p>Confira os slides, baixe os arquivos ou envie tudo para uma pasta no Google Drive.</p>
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

          <DrivePanel
            run={run}
            folders={driveFolders}
            connected={driveConnected}
            loading={loadingDrive}
            exporting={exportingDrive}
            onRefresh={onRefreshDrive}
            onConnect={onConnectDrive}
            onExport={onExportDrive}
          />

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

export function App() {
  const [authSession, setAuthSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(authSessionStorageKey) || "null");
    } catch {
      return null;
    }
  });
  const [loginEmail, setLoginEmail] = useState("andre09azevedo@gmail.com");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
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
  const [extractStartedAt, setExtractStartedAt] = useState(null);
  const [timerNow, setTimerNow] = useState(Date.now());
  const [savingReview, setSavingReview] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [driveFolders, setDriveFolders] = useState([]);
  const [driveConnected, setDriveConnected] = useState(false);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [exportingDrive, setExportingDrive] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const activeStage = getActiveStage(run);
  const extractionElapsedSeconds = extracting && extractStartedAt ? Math.floor((timerNow - extractStartedAt) / 1000) : 0;
  const extractionRemainingSeconds = Math.max(extractionEstimateSeconds - extractionElapsedSeconds, 0);
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
    if (!extracting || !extractStartedAt) return undefined;
    setTimerNow(Date.now());
    const interval = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [extracting, extractStartedAt]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");
    if (window.location.pathname !== "/google-drive/callback" || (!code && !oauthError)) return;

    async function finishDriveOAuth() {
      setStatus("Conectando Google Drive...");
      setError("");
      try {
        const response = await fetch(`${apiBase}/api/google-drive/oauth/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            state,
            error: oauthError,
            redirectUri: `${window.location.origin}/google-drive/callback`,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não consegui conectar o Google Drive.");
        setDriveFolders(data.folders || []);
        setDriveConnected(true);
        setStatus("Google Drive conectado.");
        window.history.replaceState({}, "", "/");
      } catch (requestError) {
        setError(requestError.message);
        setStatus("Google Drive não conectado.");
      }
    }

    finishDriveOAuth();
  }, []);

  useEffect(() => {
    if (authSession) {
      loadProjects({ silent: true });
      loadDriveFolders({ silent: true });
    }
  }, [authSession]);


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

  async function login() {
    setLoginError("");
    setAuthLoading(true);
    try {
      const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error_description || data.msg || data.error || "Não consegui fazer login.");
      localStorage.setItem(authSessionStorageKey, JSON.stringify(data));
      setAuthSession(data);
      setLoginPassword("");
      setStatus("Login concluído.");
    } catch (requestError) {
      setLoginError(requestError.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadProjects({ silent = false } = {}) {
    setLoadingProjects(true);
    if (!silent) setError("");
    try {
      const response = await fetch(`${apiBase}/api/history`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui carregar os projetos.");
      const items = (data.items || []).filter((item) => item.runId || item.run_id);
      setProjects(
        items.map((item) => ({
          ...item,
          runId: item.runId || item.run_id,
          sourceUrl: item.sourceUrl || item.source_url || "",
          captionEnglish: item.captionEnglish || item.caption_english || "",
          captionPortuguese: item.captionPortuguese || item.caption_portuguese || "",
          createdAt: item.createdAt || item.created_at,
          updatedAt: item.updatedAt || item.updated_at,
        }))
      );
    } catch (requestError) {
      if (!silent) setError(requestError.message);
    } finally {
      setLoadingProjects(false);
    }
  }

  async function openProject(project) {
    setError("");
    setStatus("Abrindo projeto...");
    try {
      const response = await fetch(`${apiBase}/api/runs/${project.runId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui abrir esse projeto.");
      hydrateRun(data);
      setStatus("Projeto carregado.");
    } catch {
      setUrl(project.sourceUrl || project.source_url || url);
      setError("Esse projeto está no histórico, mas os arquivos da execução não estão disponíveis no servidor. Extraia novamente pelo link.");
      setStatus("Projeto não aberto.");
    }
  }

  async function extractPost() {
    setError("");
    setExtracting(true);
    setExtractStartedAt(Date.now());
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
      loadProjects({ silent: true });
      setStatus(`${data.slides.length} slides prontos para revisar.`);
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Extração não concluída.");
    } finally {
      setExtracting(false);
      setExtractStartedAt(null);
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
      loadProjects({ silent: true });
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
      loadProjects({ silent: true });
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
    setRendering(true);
    setStatus("Enviando imagens e gerando slideshow...");

    try {
      const formData = new FormData();
      replacementFiles.forEach((file) => formData.append("images", file));
      const response = await fetch(`${apiBase}/api/runs/${run.runId}/replacements`, {
        method: "POST",
        body: formData,
      });
      const uploaded = await response.json();
      if (!response.ok) throw new Error(uploaded.error || "Não consegui enviar as imagens.");

      const renderResponse = await fetch(`${apiBase}/api/runs/${uploaded.runId}/render`, { method: "POST" });
      const rendered = await renderResponse.json();
      if (!renderResponse.ok) throw new Error(rendered.error || "Não consegui gerar o preview.");

      hydrateRun(rendered);
      loadProjects({ silent: true });
      setStatus("Preview pronto. Você já pode baixar ou enviar para o Drive.");
      loadDriveFolders({ silent: true });
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Slideshow não gerado.");
    } finally {
      setUploadingImages(false);
      setRendering(false);
    }
  }

  async function loadDriveFolders({ silent = false } = {}) {
    setLoadingDrive(true);
    if (!silent) setError("");
    try {
      const response = await fetch(`${apiBase}/api/google-drive/folders`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui carregar as pastas do Drive.");
      setDriveFolders(data.folders || []);
      setDriveConnected(Boolean(data.connected || data.folders));
      if (!silent) setStatus(data.folders?.length ? "Pastas do Drive carregadas." : "Drive conectado, mas sem pastas encontradas.");
    } catch (requestError) {
      setDriveConnected(false);
      setDriveFolders([]);
      if (!silent) setError(requestError.message);
    } finally {
      setLoadingDrive(false);
    }
  }

  async function connectDrive() {
    setError("");
    setStatus("Abrindo conexão com Google Drive...");
    try {
      const response = await fetch(`${apiBase}/api/google-drive/oauth/start`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui iniciar a conexão com Google Drive.");
      window.location.href = data.authorizeUrl;
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Conexão com Drive não iniciada.");
    }
  }

  async function exportToDrive(folderId) {
    if (!run) return;
    setError("");
    setExportingDrive(true);
    setStatus("Enviando arquivos para o Google Drive...");
    try {
      const response = await fetch(`${apiBase}/api/runs/${run.runId}/google-drive/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui enviar para o Drive.");
      hydrateRun(data.run);
      loadProjects({ silent: true });
      setStatus(`Arquivos enviados para ${data.driveExport?.folderName || "o Drive"}.`);
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Envio ao Drive não concluído.");
    } finally {
      setExportingDrive(false);
    }
  }

  if (!authSession) {
    return (
      <LoginScreen
        email={loginEmail}
        password={loginPassword}
        setEmail={setLoginEmail}
        setPassword={setLoginPassword}
        loading={authLoading}
        onSubmit={login}
        error={loginError}
      />
    );
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
            elapsedSeconds={extractionElapsedSeconds}
            remainingSeconds={extractionRemainingSeconds}
            projects={projects}
            loadingProjects={loadingProjects}
            onOpenProject={openProject}
            onRefreshProjects={loadProjects}
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

        {activeStage === "download" && run && (
          <DownloadStage
            run={run}
            activeIndex={previewIndex}
            setActiveIndex={setPreviewIndex}
            driveFolders={driveFolders}
            driveConnected={driveConnected}
            loadingDrive={loadingDrive}
            exportingDrive={exportingDrive}
            onRefreshDrive={loadDriveFolders}
            onConnectDrive={connectDrive}
            onExportDrive={exportToDrive}
          />
        )}

        {(extracting || savingReview || uploadingImages || rendering || exportingDrive) && (
          <div className="work-overlay">
            <LoadingIcon active />
            <span>
              {status}
              {extracting && extractStartedAt ? ` · ${formatDuration(extractionElapsedSeconds)} de até 5:00` : ""}
            </span>
          </div>
        )}
      </section>
    </main>
  );
}
