import {
  ArrowRight,
  Check,
  ChevronLeft,
  Clipboard,
  Download,
  ImagePlus,
  Loader2,
  ScanText,
  Send,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearDriveSession,
  createDriveFolder,
  listChildFolders,
  listRootFolders,
  nextPostFolderName,
  persistDriveSession,
  requestDriveAccess,
  restoreDriveSession,
  uploadBlobFile,
  uploadTextFile,
} from "./google-drive.js";
import { buildProjectRoute, getUnlockedProjectStages, parseProjectRoute } from "./project-route.mjs";
import { mergeReplacementFiles, moveReplacementFile } from "./replacement-files.js";
import { getSupabaseBrowserClient } from "./supabase-browser.js";

const envApiBase = import.meta.env.VITE_API_BASE?.trim();
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
const supabase = getSupabaseBrowserClient();
const productionApiBase = "https://zapspark-tiktok-extractor.te7sty.easypanel.host";
const isLoopbackApiBase = (value = "") => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(value);
const apiBase = envApiBase && !isLoopbackApiBase(envApiBase) ? envApiBase : productionApiBase;
const currentRunStorageKey = "automatizador-tiktok.currentRunId";
const draftStorageKey = "automatizador-tiktok.draft";
const driveSessionStorageKey = "automatizador-tiktok.googleDriveSession";
const sampleUrl =
  "https://www.tiktok.com/@landon.vaughn17/photo/7633592588674551053?is_from_webapp=1&sender_device=pc&web_id=7634388741662869010";

const steps = [
  { key: "extract", number: "01", title: "Extrair", hint: "Link ou prints" },
  { key: "review", number: "02", title: "Revisar", hint: "Texto em português" },
  { key: "images", number: "03", title: "Imagens", hint: "Substituir na ordem" },
  { key: "preview", number: "04", title: "Preview", hint: "Validar slideshow" },
  { key: "publish", number: "05", title: "Enviar", hint: "Google Drive" },
];

const stageByRun = {
  review: "review",
  images: "images",
  render: "preview",
  preview: "preview",
  publish: "publish",
};

const stageNames = {
  review: "revisão",
  images: "imagens",
  render: "render",
  preview: "preview",
  publish: "drive",
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

function getUnlockedStages(run) {
  if (!run) return ["extract"];
  return getUnlockedProjectStages(getActiveStage(run));
}

function projectTitle(project) {
  if (String(project.projectName || "").trim()) return String(project.projectName).trim();
  const caption = project.captionPortuguese || project.captionEnglish || "";
  if (caption.trim()) return caption.trim().slice(0, 54);
  const handle = String(project.sourceUrl || "").match(/@([^/]+)/)?.[1];
  return handle ? `Post @${handle}` : `Projeto ${project.runId}`;
}

function projectFolderLabel(project) {
  if (project.driveExport?.profileFolderName && project.driveExport?.postFolderName) {
    return `${project.driveExport.profileFolderName} / ${project.driveExport.postFolderName}`;
  }
  if (project.driveTarget?.folderName) {
    return `${project.driveTarget.folderName} / aguardando envio`;
  }
  return "sem pasta escolhida";
}

async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${fallbackMessage} O servidor respondeu em formato inválido. Atualize a página e tente de novo.`);
  }
}

function LoadingInline({ active }) {
  return active ? <Loader2 className="spin" size={18} /> : null;
}

function StepRail({ activeStage, unlockedStages, hasProject, onSelectStage, onGoHome }) {
  const activeIndex = stageIndex[activeStage] || 0;

  return (
    <aside className="step-rail" aria-label="Etapas do fluxo">
      <div className="rail-header">
        <div className="brand-mark">
          <span>TT</span>
        </div>
        {hasProject ? (
          <button className="rail-home-button" type="button" onClick={onGoHome}>
            <ChevronLeft size={16} />
            Projetos
          </button>
        ) : null}
      </div>
      <div className="step-list">
        {steps.map((step, index) => {
          const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "locked";
          const canOpen = step.key === "extract" ? !hasProject : unlockedStages.includes(step.key);
          return (
            <button
              type="button"
              className={`rail-step ${state} ${canOpen ? "clickable" : "disabled"}`}
              key={step.key}
              onClick={() => canOpen && onSelectStage(step.key)}
              disabled={!canOpen || step.key === activeStage}
            >
              <div className="rail-step__number">{state === "done" ? <Check size={15} /> : step.number}</div>
              <div>
                <strong>{step.title}</strong>
                <span>{step.hint}</span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function StudioHeader({ activeStage, status, hasProject, user, onGoHome, onLogout }) {
  const activeStep = steps[stageIndex[activeStage] || 0];

  return (
    <header className="studio-header">
      <div>
        <p className="kicker">Slideshow Studio</p>
        <h1>Automatizador TikTok</h1>
      </div>
      <div className="studio-header__actions">
        {hasProject ? (
          <button className="action-button ghost-action compact-action" type="button" onClick={onGoHome}>
            <ChevronLeft size={18} />
            Voltar aos projetos
          </button>
        ) : null}
        {user ? (
          <div className="status-pill">
            <span>Conta</span>
            <strong>{user.email}</strong>
            <small>
              <button className="linkish-button" type="button" onClick={onLogout}>
                Sair
              </button>
            </small>
          </div>
        ) : null}
        <div className="status-pill">
          <span>{activeStep.number}</span>
          <strong>{activeStep.title}</strong>
          <small>{status}</small>
        </div>
      </div>
    </header>
  );
}

function LoginScreen({ email, password, setEmail, setPassword, loading, onSubmit, error }) {
  return (
    <main className="app-shell auth-shell">
      <section className="studio auth-studio">
        <header className="studio-header">
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

          <div className="extract-grid">
            <label className="input-group">
              <span>E-mail</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seuemail@exemplo.com" />
            </label>
            <label className="input-group">
              <span>Senha</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" />
            </label>
            <div className="extract-actions">
              <button className="action-button main-action huge-action" type="button" onClick={onSubmit} disabled={loading}>
                {loading ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
                Entrar
              </button>
            </div>
            {error ? (
              <div className="error-banner" role="alert">
                <strong>Precisa de atenção</strong>
                <span>{error}</span>
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
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
            <button className="story-tap-zone story-tap-zone--left" type="button" onClick={onPrev} disabled={!canGoBack} aria-label="Slide anterior" />
            <button className="story-tap-zone story-tap-zone--right" type="button" onClick={onNext} disabled={!canGoNext} aria-label="Próximo slide" />
            <div className="story-hint" aria-hidden="true">
              Clique nas laterais para passar
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ExtractStage({ url, setUrl, extracting, onExtract, onUploadScreenshots }) {
  const uploadRef = useRef(null);

  return (
    <section className="stage-card">
      <div className="stage-copy">
        <p className="stage-label">Etapa 01</p>
        <h2>Extrair o post</h2>
        <p>Cole o link do slideshow do TikTok ou envie prints. Eu organizo os slides, extraio o texto e separo a legenda.</p>
      </div>

      <div className="extract-grid">
        <label className="input-group">
          <span>Link do slideshow</span>
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.tiktok.com/@.../photo/..." />
        </label>

        <div className="extract-actions">
          <button className="action-button main-action huge-action" type="button" onClick={onExtract} disabled={extracting}>
            {extracting ? <Loader2 className="spin" size={18} /> : <ScanText size={18} />}
            Extrair post
          </button>
          <button className="action-button ghost-action huge-action" type="button" onClick={() => uploadRef.current?.click()} disabled={extracting}>
            <UploadCloud size={18} />
            OCR via imagens
          </button>
          <input
            hidden
            ref={uploadRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              onUploadScreenshots(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      </div>
    </section>
  );
}

function ProjectShelf({ projects, loading, onOpenProject, onDeleteProject }) {
  return (
    <section className="stage-card">
      <div className="stage-copy">
        <p className="stage-label">Projetos</p>
        <h2>Continue de onde parou</h2>
        <p>Se voc? j? come?ou um post antes, ele aparece aqui com a etapa atual, a pasta escolhida e as hashtags salvas.</p>
      </div>

      {loading ? (
        <div className="empty-publish">
          <Loader2 className="spin" size={20} />
          <p>Carregando seus projetos...</p>
        </div>
      ) : !projects.length ? (
        <div className="empty-publish">
          <p>Ainda não há projetos salvos.</p>
        </div>
      ) : (
        <div className="account-grid">
          {projects.map((project) => (
            <article className="account-card selected" key={project.runId}>
              <div>
                <strong>{projectTitle(project)}</strong>
                <small>{project.slideCount} slides ? etapa {stageNames[project.stage] || project.stage}</small>
                <small>{projectFolderLabel(project)}</small>
                {!!project.hashtags?.length && <small>{project.hashtags.join(" ")}</small>}
              </div>
              <div className="download-actions">
                <button className="action-button quiet-action" type="button" onClick={() => onOpenProject(project.runId)}>
                  Abrir
                </button>
                <button className="action-button quiet-action" type="button" onClick={() => onDeleteProject(project.runId)}>
                  <Trash2 size={16} />
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectMetaBar({ run, projectName, setProjectName, saving, onSave }) {
  if (!run) return null;

  return (
    <section className="stage-card">
      <div className="extract-grid">
        <label className="input-group">
          <span>Nome do projeto</span>
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Ex: Perfil 1 - post motivação" />
        </label>
        <div className="extract-actions">
          <button className="action-button ghost-action huge-action" type="button" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            Salvar nome
          </button>
        </div>
      </div>
      <div className="account-grid">
        <article className="account-card selected">
          <div>
            <strong>Etapa atual</strong>
            <small>{stageNames[run.stage] || run.stage}</small>
          </div>
        </article>
        <article className="account-card selected">
          <div>
            <strong>Pasta de destino</strong>
            <small>{projectFolderLabel(run)}</small>
          </div>
        </article>
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
                  <textarea value={captionPortuguese} onChange={(event) => setCaptionPortuguese(event.target.value)} />
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
        </div>
      </div>
    </section>
  );
}

function ImageStage({ run, selectedFiles, previews, onSelectFiles, onRemoveFile, onMoveFile, onClearFiles, onUpload, uploading }) {
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
        <p>Você pode escolher tudo de uma vez ou ir completando aos poucos. Eu mantenho a ordem e preparo o slideshow final.</p>
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
        <span>{ready ? "Tudo certo para enviar." : `Faltam ${missing} imagens. Você pode adicionar só as que faltam.`}</span>
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
                    â†
                  </button>
                  <button type="button" onClick={() => onMoveFile(index, index + 1)} disabled={uploading || index === selectedFiles.length - 1}>
                    â†’
                  </button>
                  <button type="button" onClick={() => onRemoveFile(index)} disabled={uploading}>
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

      <div className="download-actions">
        <button className="action-button main-action huge-action" type="button" onClick={onUpload} disabled={!ready || uploading}>
          {uploading ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
          Gerar slideshow final
        </button>
      </div>
    </section>
  );
}

function PreviewStage({ run, activeIndex, setActiveIndex, onContinue }) {
  const slide = run.slides[activeIndex];
  const caption = run.captionEnglish || "";
  const hashtags = hashtagsToText(run.hashtags);

  return (
    <section className="stage-card review-stage">
      <div className="review-workbench">
        <div className="story-column">
          <PhonePreview
            slide={slide}
            slideIndex={activeIndex}
            total={run.slides.length}
            rendered
            onPrev={() => setActiveIndex(Math.max(0, activeIndex - 1))}
            onNext={() => setActiveIndex(Math.min(run.slides.length - 1, activeIndex + 1))}
          />
          <SlideRail rendered slides={run.slides} activeIndex={activeIndex} onSelect={setActiveIndex} />
        </div>

        <div className="editor-panel review-editor-panel">
          <article className="script-card">
            <span>Preview validado</span>
            <p>Se os slides estiverem bons, siga para escolher a pasta do Google Drive.</p>
          </article>

          <div className="download-actions">
            <a className="action-button main-action" href={`${apiBase}/api/runs/${run.runId}/slides/${slide.index}/download`} target="_blank" rel="noreferrer">
              <Download size={18} />
              Baixar slide atual
            </a>
          </div>

          {hasContent(caption) && (
            <article className="script-card">
              <span>Descrição final</span>
              <p>{caption}</p>
              <button type="button" onClick={() => navigator.clipboard.writeText(caption)}>
                <Clipboard size={16} />
                Copiar descrição
              </button>
            </article>
          )}

          {hasContent(hashtags) && (
            <article className="script-card">
              <span>Hashtags</span>
              <p>{hashtags}</p>
              <button type="button" onClick={() => navigator.clipboard.writeText(hashtags)}>
                <Clipboard size={16} />
                Copiar hashtags
              </button>
            </article>
          )}

          <button className="action-button main-action huge-action" type="button" onClick={onContinue}>
            <ArrowRight size={18} />
            Ir para o Google Drive
          </button>
        </div>
      </div>
    </section>
  );
}

function DriveStage({
  run,
  driveFolders,
  loadingFolders,
  driveConnected,
  exportingDrive,
  onConnectDrive,
  onRefreshFolders,
  onSelectFolder,
  onSendToDrive,
}) {
  const caption = [run.captionEnglish, hashtagsToText(run.hashtags)].filter(Boolean).join(" ").trim();
  const selectedFolderId = run.driveTarget?.folderId || "";

  return (
    <section className="stage-card publish-stage">
      <div className="publish-layout">
        <div className="stage-copy">
          <p className="stage-label">Etapa 05</p>
          <h2>Enviar para o Google Drive</h2>
          <p>Escolha a pasta do perfil. Eu crio automaticamente uma subpasta como post 1, post 2, post 3 e envio tudo para lá.</p>
          {run.driveExport ? (
            <article className="script-card compact-script">
              <span>Último envio</span>
              <p>
                {run.driveExport.profileFolderName} / {run.driveExport.postFolderName}
              </p>
              <a href={run.driveExport.postFolderUrl} target="_blank" rel="noreferrer">
                Abrir pasta no Drive
              </a>
            </article>
          ) : (
            <article className="script-card compact-script">
              <span>Como vai sair</span>
              <p>Dentro da pasta escolhida eu envio os slides renderizados, a legenda, as hashtags e um arquivo post.json.</p>
            </article>
          )}
        </div>

        <div className="publish-panel">
          <div className="publish-panel__header">
            <strong>Pastas de perfil</strong>
            <button className="action-button quiet-action" type="button" onClick={onRefreshFolders} disabled={loadingFolders || !driveConnected}>
              {loadingFolders ? <Loader2 className="spin" size={16} /> : <ScanText size={16} />}
              Atualizar
            </button>
          </div>

          {!googleClientId ? (
            <div className="empty-publish">
              <p>Falta configurar `VITE_GOOGLE_CLIENT_ID` para liberar a conexão com o Google Drive.</p>
            </div>
          ) : !driveConnected ? (
            <div className="empty-publish">
              <p>Conecte seu Google Drive uma vez. Depois a tela passa a listar automaticamente as pastas reais da sua conta.</p>
              <button className="action-button main-action" type="button" onClick={onConnectDrive}>
                <Send size={16} />
                Conectar Google Drive
              </button>
            </div>
          ) : null}

          {!!driveFolders.length && (
            <div className="account-grid">
              {driveFolders.map((folder) => (
                <button
                  className={`account-card ${selectedFolderId === folder.id ? "selected" : ""}`}
                  key={folder.id}
                  type="button"
                  onClick={() => onSelectFolder(folder)}
                >
                  <span>{(folder.name || "P").slice(0, 1)}</span>
                  <div>
                    <strong>{folder.name}</strong>
                    <small>{selectedFolderId === folder.id ? "Selecionada para este post" : "Pasta detectada na raiz do Drive"}</small>
                  </div>
                  <Check size={18} />
                </button>
              ))}
            </div>
          )}

          {driveConnected && !driveFolders.length && !loadingFolders ? (
            <div className="empty-publish">
              <p>Nenhuma pasta foi encontrada na raiz do seu Drive. Crie as pastas dos perfis e clique em atualizar.</p>
            </div>
          ) : null}

          <article className="script-card compact-script">
            <span>Legenda final em inglês</span>
            <p>{caption || "Sem legenda detectada."}</p>
          </article>

          <button className="action-button main-action huge-action" type="button" onClick={onSendToDrive} disabled={exportingDrive || !selectedFolderId}>
            {exportingDrive ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            Enviar arquivos para a pasta selecionada
          </button>
        </div>
      </div>
    </section>
  );
}

export function App() {
  const [authToken, setAuthToken] = useState("");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("andre09azevedo@gmail.com");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [url, setUrl] = useState(sampleUrl);
  const [status, setStatus] = useState("Pronto para começar.");
  const [error, setError] = useState("");
  const [run, setRun] = useState(null);
  const [projectName, setProjectName] = useState("");
  const [draftSlides, setDraftSlides] = useState([]);
  const [draftCaptionEnglish, setDraftCaptionEnglish] = useState("");
  const [draftCaptionPortuguese, setDraftCaptionPortuguese] = useState("");
  const [draftHashtags, setDraftHashtags] = useState("");
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [replacementFiles, setReplacementFiles] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [savingProjectMeta, setSavingProjectMeta] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [driveSession, setDriveSession] = useState(() => restoreDriveSession(driveSessionStorageKey));
  const [driveFolders, setDriveFolders] = useState([]);
  const [loadingDriveFolders, setLoadingDriveFolders] = useState(false);
  const [exportingDrive, setExportingDrive] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedStage, setSelectedStage] = useState("extract");

  const activeStage = run ? selectedStage : "extract";
  const unlockedStages = useMemo(() => getUnlockedStages(run), [run]);
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
    let active = true;

    async function bootAuth() {
      if (!supabase) {
        if (!active) return;
        setLoginError("Falta configurar o Supabase no deploy para liberar o login.");
        setAuthLoading(false);
        return;
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        if (session?.access_token) {
          setAuthToken(session.access_token);
          setUser({
            id: session.user.id,
            email: session.user.email || "",
            role: session.user.role || "authenticated",
          });
          return;
        }
        setAuthToken("");
        setUser(null);
      });

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!active) return;
        if (sessionError) throw sessionError;

        if (session?.access_token) {
          await restoreSession(session.access_token, session.user);
          return;
        }

        setAuthLoading(false);
      } catch {
        if (!active) return;
        setLoginError("Não consegui restaurar sua sessão. Faça login novamente.");
        setAuthLoading(false);
      }

      return () => subscription.unsubscribe();
    }

    const cleanupPromise = bootAuth();

    return () => {
      active = false;
      Promise.resolve(cleanupPromise).then((cleanup) => cleanup?.());
    };
  }, []);

  useEffect(() => {
    function handlePopState() {
      if (!authToken) return;
      const route = parseProjectRoute(window.location.pathname);
      if (route.view === "project" && route.runId) {
        openProject(route.runId, { silent: true, syncRoute: false });
        return;
      }
      goHome({ replace: true, statusMessage: "Você voltou para a lista de projetos." });
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [authToken, run?.runId]);

  useEffect(() => {
    if (!run?.runId) {
      localStorage.removeItem(draftStorageKey);
      localStorage.removeItem(currentRunStorageKey);
      return;
    }

    localStorage.setItem(currentRunStorageKey, run.runId);
    localStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        runId: run.runId,
        draftSlides,
        draftCaptionEnglish,
        draftCaptionPortuguese,
        draftHashtags,
        currentReviewIndex,
        previewIndex,
        updatedAt: new Date().toISOString(),
      })
    );
  }, [run?.runId, draftSlides, draftCaptionEnglish, draftCaptionPortuguese, draftHashtags, currentReviewIndex, previewIndex]);

  useEffect(() => {
    if (activeStage === "publish" && driveSession?.accessToken) {
      refreshDriveFolders({ silent: true });
    }
  }, [activeStage, driveSession?.accessToken]);

  function authHeaders(extra = {}) {
    return {
      ...extra,
      Authorization: `Bearer ${authToken}`,
    };
  }

  async function apiFetch(input, init = {}) {
    const response = await fetch(input, {
      ...init,
      headers: authHeaders(init.headers || {}),
    });
    if (response.status === 401) {
      logout({ statusMessage: "Sua sessão expirou. Faça login novamente." });
    }
    return response;
  }

  function syncProjectRoute(runId, { replace = false } = {}) {
    const nextUrl = buildProjectRoute(runId);
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl === currentUrl) return;
    window.history[replace ? "replaceState" : "pushState"]({}, "", nextUrl);
  }

  function hydrateRun(nextRun, options = {}) {
    const nextUnlockedStages = getUnlockedStages(nextRun);
    const nextStage = nextUnlockedStages.includes(options.stage) ? options.stage : getActiveStage(nextRun);

    setRun(nextRun);
    setProjectName(nextRun.projectName || projectTitle(nextRun));
    setDraftSlides(nextRun.slides.map((slide) => ({ ...slide })));
    setDraftCaptionEnglish(nextRun.captionEnglish || "");
    setDraftCaptionPortuguese(nextRun.captionPortuguese || "");
    setDraftHashtags(hashtagsToText(nextRun.hashtags));
    setCurrentReviewIndex(0);
    setPreviewIndex(0);
    setReplacementFiles([]);
    setSelectedStage(nextStage);

    if (options.syncRoute !== false && nextRun.runId) {
      syncProjectRoute(nextRun.runId, { replace: Boolean(options.replaceRoute) });
    }
  }

  function applySavedDraft(savedDraft) {
    if (!savedDraft) return;
    if (Array.isArray(savedDraft.draftSlides) && savedDraft.draftSlides.length) {
      setDraftSlides(savedDraft.draftSlides);
    }
    setDraftCaptionEnglish(savedDraft.draftCaptionEnglish || "");
    setDraftCaptionPortuguese(savedDraft.draftCaptionPortuguese || "");
    setDraftHashtags(savedDraft.draftHashtags || "");
    setCurrentReviewIndex(Number(savedDraft.currentReviewIndex || 0));
    setPreviewIndex(Number(savedDraft.previewIndex || 0));
  }

  function clearActiveProject() {
    setRun(null);
    setProjectName("");
    setDraftSlides([]);
    setDraftCaptionEnglish("");
    setDraftCaptionPortuguese("");
    setDraftHashtags("");
    setCurrentReviewIndex(0);
    setPreviewIndex(0);
    setReplacementFiles([]);
    setSelectedStage("extract");
  }

  function goHome({ replace = false, statusMessage = "Escolha um projeto salvo ou crie um novo." } = {}) {
    clearActiveProject();
    window.history[replace ? "replaceState" : "pushState"]({}, "", "/");
    localStorage.removeItem(currentRunStorageKey);
    setError("");
    setStatus(statusMessage);
    if (authToken) loadProjects();
  }

  async function logout({ statusMessage = "Sessão encerrada.", signOut = true } = {}) {
    if (signOut && supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore sign-out transport errors and clear local state anyway
      }
    }
    setAuthToken("");
    setUser(null);
    setLoginPassword("");
    setLoginError("");
    setProjects([]);
    clearDriveSession(driveSessionStorageKey);
    setDriveSession(null);
    setDriveFolders([]);
    clearActiveProject();
    localStorage.removeItem(currentRunStorageKey);
    localStorage.removeItem(draftStorageKey);
    window.history.replaceState({}, "", "/");
    setError("");
    setStatus(statusMessage);
    setAuthLoading(false);
  }

  async function restoreSession(token, sessionUser = null) {
    setAuthLoading(true);
    try {
      setAuthToken(token);
      setUser({
        id: sessionUser?.id || "",
        email: sessionUser?.email || "",
        role: sessionUser?.role || "authenticated",
      });
      await loadProjects(token);
      const route = parseProjectRoute(window.location.pathname);
      if (route.view === "project" && route.runId) {
        await openProject(route.runId, { silent: true, syncRoute: false, token });
      }
    } catch {
      setStatus("Login concluído, mas não consegui carregar seus projetos agora.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function login() {
    setLoginError("");
    if (!supabase) {
      setLoginError("Falta configurar o Supabase no deploy para liberar o login.");
      return;
    }
    setAuthLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (signInError) throw signInError;
      if (!data.session?.access_token) {
        throw new Error("O Supabase não retornou uma sessão válida.");
      }
      setLoginPassword("");
      await restoreSession(data.session.access_token, data.user);
      setStatus("Login concluído. Seus projetos foram carregados.");
    } catch (requestError) {
      setLoginError(requestError.message || "Não consegui fazer login.");
      setAuthLoading(false);
    }
  }

  async function loadProjects(tokenOverride) {
    const token = tokenOverride || authToken;
    if (!token) return;
    setLoadingProjects(true);
    try {
      const response = await fetch(`${apiBase}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readJsonResponse(response, "Não consegui carregar seus projetos.");
      if (!response.ok) throw new Error(data.error || "Não consegui carregar seus projetos.");
      setProjects(data.items || []);
    } catch (requestError) {
      console.warn("[projects] load failed", requestError);
    } finally {
      setLoadingProjects(false);
    }
  }

  async function openProject(runId, { silent = false, syncRoute = true, token } = {}) {
    if (!runId || !(token || authToken)) return;
    setError("");
    if (!silent) setStatus("Abrindo projeto salvo...");
    try {
      const response = await fetch(`${apiBase}/api/runs/${runId}`, {
        headers: { Authorization: `Bearer ${token || authToken}` },
      });
      const data = await readJsonResponse(response, "Não consegui abrir esse projeto.");
      if (!response.ok) throw new Error(data.error || "Projeto não encontrado.");
      hydrateRun(data, { syncRoute });
      const savedDraft = JSON.parse(localStorage.getItem(draftStorageKey) || "null");
      if (savedDraft?.runId === runId) applySavedDraft(savedDraft);
      localStorage.setItem(currentRunStorageKey, runId);
      setStatus(silent ? "Projeto restaurado automaticamente." : "Projeto aberto. Pode continuar de onde parou.");
    } catch (requestError) {
      if (!silent) setError(requestError.message);
      localStorage.removeItem(currentRunStorageKey);
    }
  }

  async function deleteProject(runId) {
    const confirmed = window.confirm("Excluir este projeto salvo? Essa ação remove os arquivos desta run.");
    if (!confirmed) return;
    setError("");
    try {
      const response = await apiFetch(`${apiBase}/api/runs/${runId}`, { method: "DELETE" });
      const data = await readJsonResponse(response, "Não consegui excluir esse projeto.");
      if (!response.ok) throw new Error(data.error || "Não consegui excluir esse projeto.");
      if (run?.runId === runId) {
        localStorage.removeItem(currentRunStorageKey);
        localStorage.removeItem(draftStorageKey);
        goHome({ replace: true, statusMessage: "Projeto excluído." });
      } else {
        await loadProjects();
        setStatus("Projeto excluído.");
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function saveProjectMeta() {
    if (!run) return;
    setSavingProjectMeta(true);
    setError("");
    try {
      const response = await apiFetch(`${apiBase}/api/runs/${run.runId}/meta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName }),
      });
      const data = await readJsonResponse(response, "Não consegui salvar o nome do projeto.");
      if (!response.ok) throw new Error(data.error || "Não consegui salvar o nome do projeto.");
      hydrateRun(data, { stage: selectedStage, replaceRoute: true });
      setStatus("Nome do projeto salvo.");
      await loadProjects();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingProjectMeta(false);
    }
  }

  async function extractPost() {
    setError("");
    setExtracting(true);
    setStatus("Extraindo slides, OCR e legenda do post...");

    try {
      const response = await apiFetch(`${apiBase}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, projectName }),
      });
      const data = await readJsonResponse(response, "Não consegui extrair esse post.");
      if (!response.ok) throw new Error(data.error || "Não consegui extrair esse post.");
      hydrateRun(data);
      setStatus(`${data.slides.length} slides prontos para revisar.`);
      loadProjects();
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
    setStatus("Lendo os prints para OCR...");

    try {
      const formData = new FormData();
      selected.forEach((file) => formData.append("slides", file));
      formData.append("projectName", projectName);
      const response = await apiFetch(`${apiBase}/api/ocr-upload`, { method: "POST", body: formData });
      const data = await readJsonResponse(response, "Não consegui ler esses prints.");
      if (!response.ok) throw new Error(data.error || "Não consegui ler esses prints.");
      hydrateRun(data);
      setStatus(`${data.slides.length} slides prontos para revisar.`);
      loadProjects();
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
      const reconcileResponse = await apiFetch(`${apiBase}/api/runs/${run.runId}/reconcile-review`, {
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
          reviewedEnglish: matchá.reviewedEnglish || slide.reviewedEnglish,
        };
      });
      const captionEnglishToSave = reconciled.captionEnglish || draftCaptionEnglish;

      const response = await apiFetch(`${apiBase}/api/runs/${run.runId}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slides: slidesToSave,
          captionEnglish: captionEnglishToSave,
          captionPortuguese: draftCaptionPortuguese,
          hashtags: textToHashtags(draftHashtags),
        }),
      });

      const data = await readJsonResponse(response, "Não consegui salvar a revisão.");
      if (!response.ok) throw new Error(data.error || "Não consegui salvar a revisão.");
      hydrateRun(data, { stage: "images", replaceRoute: true });
      setStatus("Revisão salva. Agora envie suas imagens.");
      loadProjects();
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
      const response = await apiFetch(`${apiBase}/api/runs/${run.runId}/replacements`, {
        method: "POST",
        body: formData,
      });
      const data = await readJsonResponse(response, "Não consegui enviar as imagens.");
      if (!response.ok) throw new Error(data.error || "Não consegui enviar as imagens.");

      setStatus("Imagens salvas. Gerando slideshow final...");
      const renderResponse = await apiFetch(`${apiBase}/api/runs/${run.runId}/render`, { method: "POST" });
      const renderData = await readJsonResponse(renderResponse, "Não consegui gerar o preview final.");
      if (!renderResponse.ok) throw new Error(renderData.error || "Não consegui gerar o preview final.");

      hydrateRun(renderData, { stage: "preview", replaceRoute: true });
      setStatus("Preview pronto. Agora escolha a pasta do Drive.");
      loadProjects();
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Upload não concluído.");
    } finally {
      setUploadingImages(false);
    }
  }

  async function refreshDriveFolders({ silent = false } = {}) {
    if (!driveSession?.accessToken) {
      setDriveFolders([]);
      return [];
    }

    setLoadingDriveFolders(true);
    if (!silent) {
      setError("");
      setStatus("Lendo suas pastas do Google Drive...");
    }

    try {
      const folders = await listRootFolders(driveSession.accessToken);
      setDriveFolders(folders);

      if (run?.driveTarget?.folderId) {
        const updatedFolder = folders.find((folder) => folder.id === run.driveTarget.folderId);
        if (updatedFolder && updatedFolder.name !== run.driveTarget.folderName) {
          await persistSelectedDriveFolder(updatedFolder, { silent: true });
        }
      }

      if (!silent) {
        setStatus(folders.length ? `${folders.length} pasta(s) encontrada(s) no Drive.` : "Nenhuma pasta encontrada na raiz do Drive.");
      }
      return folders;
    } catch (requestError) {
      setDriveFolders([]);
      if (!silent) {
        setError(requestError.message);
        setStatus("Não consegui carregar suas pastas do Drive.");
      }
      return [];
    } finally {
      setLoadingDriveFolders(false);
    }
  }

  async function connectDrive() {
    setError("");
    setStatus("Conectando o Google Drive...");

    try {
      const session = await requestDriveAccess(googleClientId, driveSession);
      persistDriveSession(driveSessionStorageKey, session);
      setDriveSession(session);
      setStatus("Google Drive conectado. Vou buscar suas pastas agora.");
      await refreshDriveFolders({ silent: true });
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Conexão com o Google Drive não concluída.");
    }
  }

  async function persistSelectedDriveFolder(folder, { silent = false } = {}) {
    if (!run || !folder?.id) return;

    try {
      const response = await apiFetch(`${apiBase}/api/runs/${run.runId}/drive-target`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId: folder.id,
          folderName: folder.name,
        }),
      });
      const data = await readJsonResponse(response, "Não consegui salvar a pasta do Drive.");
      if (!response.ok) throw new Error(data.error || "Não consegui salvar a pasta do Drive.");
      hydrateRun(data, { stage: "publish", replaceRoute: true });
      if (!silent) {
        setStatus(`Pasta "${folder.name}" selecionada.`);
      }
    } catch (requestError) {
      setError(requestError.message);
      if (!silent) {
        setStatus("Não consegui salvar a pasta do Drive.");
      }
    }
  }

  async function sendToDrive() {
    if (!run?.driveTarget?.folderId) {
      setError("Escolha uma pasta do Drive antes de enviar.");
      return;
    }
    if (!driveSession?.accessToken) {
      setError("Conecte o Google Drive antes de enviar.");
      return;
    }

    setExportingDrive(true);
    setError("");
    setStatus("Criando a pasta do post no Google Drive...");

    try {
      const profileFolder = driveFolders.find((folder) => folder.id === run.driveTarget.folderId) || run.driveTarget;
      const childFolders = await listChildFolders(driveSession.accessToken, run.driveTarget.folderId);
      const postFolderName = nextPostFolderName(childFolders);
      const postFolder = await createDriveFolder(driveSession.accessToken, postFolderName, run.driveTarget.folderId);

      const uploadedFiles = [];
      for (const slide of run.slides) {
        const slideName = slide.renderedImageUrl?.split("/").pop() || `slide-${String(slide.index).padStart(2, "0")}.jpg`;
        setStatus(`Enviando ${slideName} para o Drive...`);
        const slideResponse = await fetch(assetUrl(slide.renderedImageUrl));
        if (!slideResponse.ok) throw new Error(`Não consegui baixar ${slideName} do servidor.`);
        const slideBlob = await slideResponse.blob();
        const uploaded = await uploadBlobFile(driveSession.accessToken, {
          parentId: postFolder.id,
          name: slideName,
          blob: slideBlob,
          mimeType: slideBlob.type || "image/jpeg",
        });
        uploadedFiles.push(uploaded);
      }

      setStatus("Enviando legenda e hashtags para o Drive...");
      const captionFile = await uploadTextFile(driveSession.accessToken, {
        parentId: postFolder.id,
        name: "caption.txt",
        content: run.captionEnglish || "",
      });
      const hashtagsFile = await uploadTextFile(driveSession.accessToken, {
        parentId: postFolder.id,
        name: "hashtags.txt",
        content: hashtagsToText(run.hashtags),
      });
      const manifestFile = await uploadTextFile(driveSession.accessToken, {
        parentId: postFolder.id,
        name: "post.json",
        content: JSON.stringify(
          {
            runId: run.runId,
            projectName: run.projectName,
            sourceUrl: run.sourceUrl,
            captionEnglish: run.captionEnglish,
            captionPortuguese: run.captionPortuguese,
            hashtags: run.hashtags,
            slides: run.slides.map((slide) => ({
              index: slide.index,
              reviewedEnglish: slide.reviewedEnglish,
              reviewedPortuguese: slide.reviewedPortuguese,
              renderedImageUrl: slide.renderedImageUrl,
            })),
          },
          null,
          2
        ),
      });

      const response = await apiFetch(`${apiBase}/api/runs/${run.runId}/drive-export`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileFolderId: run.driveTarget.folderId,
          profileFolderName: profileFolder.name,
          postFolderId: postFolder.id,
          postFolderName,
          postFolderUrl: postFolder.webViewLink || `https://drive.google.com/drive/folders/${postFolder.id}`,
          files: [...uploadedFiles, captionFile, hashtagsFile, manifestFile],
        }),
      });
      const data = await readJsonResponse(response, "Não consegui salvar o envio do Drive.");
      if (!response.ok) throw new Error(data.error || "Não consegui salvar o envio do Drive.");

      hydrateRun(data, { stage: "publish", replaceRoute: true });
      setStatus(`Arquivos enviados para ${profileFolder.name} / ${postFolderName}.`);
      loadProjects();
    } catch (requestError) {
      const message = String(requestError.message || "");
      if (/token|unauthorized|permission|login|expired/i.test(message)) {
        clearDriveSession(driveSessionStorageKey);
        setDriveSession(null);
      }
      setError(requestError.message);
      setStatus("Envio para o Google Drive não concluído.");
    } finally {
      setExportingDrive(false);
    }
  }

  function selectStage(stepKey) {
    if (!run) return;
    if (stepKey === "extract") {
      goHome();
      return;
    }
    if (!unlockedStages.includes(stepKey)) return;
    setSelectedStage(stepKey);
    setError("");
    setStatus(`Etapa ${steps[stageIndex[stepKey]]?.title || stepKey} aberta.`);
    if (stepKey === "publish" && driveSession?.accessToken) {
      refreshDriveFolders({ silent: true });
    }
  }

  if (!user) {
    return <LoginScreen email={loginEmail} password={loginPassword} setEmail={setLoginEmail} setPassword={setLoginPassword} loading={authLoading} onSubmit={login} error={loginError} />;
  }

  return (
    <main className="app-shell">
      <StepRail
        activeStage={activeStage}
        unlockedStages={unlockedStages}
        hasProject={Boolean(run)}
        onSelectStage={selectStage}
        onGoHome={() => goHome()}
      />

      <section className="studio">
        <StudioHeader activeStage={activeStage} status={status} hasProject={Boolean(run)} user={user} onGoHome={() => goHome()} onLogout={() => logout()} />

        {error && (
          <div className="error-banner" role="alert">
            <strong>Precisa de atenção</strong>
            <span>{error}</span>
          </div>
        )}

        {run ? <ProjectMetaBar run={run} projectName={projectName} setProjectName={setProjectName} saving={savingProjectMeta} onSave={saveProjectMeta} /> : null}

        {activeStage === "extract" && (
          <>
            <ExtractStage url={url} setUrl={setUrl} extracting={extracting} onExtract={extractPost} onUploadScreenshots={uploadScreenshots} />
            <ProjectShelf projects={projects} loading={loadingProjects} onOpenProject={openProject} onDeleteProject={deleteProject} />
          </>
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
            previews={replacementPreviews}
            onSelectFiles={selectReplacementFiles}
            onRemoveFile={removeReplacementFile}
            onMoveFile={moveReplacementImage}
            onClearFiles={clearReplacementFiles}
            onUpload={uploadReplacementImages}
            uploading={uploadingImages}
          />
        )}

        {activeStage === "preview" && run && (
          <PreviewStage
            run={run}
            activeIndex={previewIndex}
            setActiveIndex={setPreviewIndex}
            onContinue={() => {
              setRun({ ...run, stage: "publish" });
              setSelectedStage("publish");
              if (driveSession?.accessToken) {
                refreshDriveFolders({ silent: true });
              }
            }}
          />
        )}

        {activeStage === "publish" && run && (
          <DriveStage
            run={run}
            driveFolders={driveFolders}
            loadingFolders={loadingDriveFolders}
            driveConnected={Boolean(driveSession?.accessToken)}
            exportingDrive={exportingDrive}
            onConnectDrive={connectDrive}
            onRefreshFolders={() => refreshDriveFolders()}
            onSelectFolder={persistSelectedDriveFolder}
            onSendToDrive={sendToDrive}
          />
        )}

        {(authLoading || extracting || savingReview || savingProjectMeta || uploadingImages || exportingDrive) && (
          <div className="work-overlay">
            <LoadingInline active />
            <span>{status}</span>
          </div>
        )}
      </section>
    </main>
  );
}


