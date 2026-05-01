import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronLeft,
  Clipboard,
  Download,
  ImagePlus,
  Loader2,
  Palette,
  ScanText,
  Send,
  Sparkles,
  Type,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildProjectRoute, getUnlockedProjectStages, parseProjectRoute } from "./project-route.mjs";
import { mergeReplacementFiles, moveReplacementFile } from "./replacement-files.js";
import { computeLayerDelta, estimateLayerFrameHeight } from "./editor-math.mjs";

const envApiBase = import.meta.env.VITE_API_BASE?.trim();
const productionApiBase = "https://zapspark-tiktok-extractor.te7sty.easypanel.host";
const isLoopbackApiBase = (value = "") => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(value);
const apiBase = envApiBase && !isLoopbackApiBase(envApiBase) ? envApiBase : productionApiBase;
const currentRunStorageKey = "automatizador-tiktok.currentRunId";
const draftStorageKey = "automatizador-tiktok.draft";
const sampleUrl =
  "https://www.tiktok.com/@landon.vaughn17/photo/7633592588674551053?is_from_webapp=1&sender_device=pc&web_id=7634388741662869010";

const steps = [
  { key: "extract", number: "01", title: "Extrair", hint: "Link ou prints" },
  { key: "review", number: "02", title: "Revisar", hint: "Texto em português" },
  { key: "images", number: "03", title: "Imagens", hint: "Substituir na ordem" },
  { key: "publish", number: "04", title: "Publicar", hint: "Postiz e contas" },
];

const stageByRun = {
  review: "review",
  images: "images",
  render: "publish",
  preview: "publish",
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

function getUnlockedStages(run) {
  if (!run) return ["extract"];
  return getUnlockedProjectStages(getActiveStage(run));
}

function projectTitle(project) {
  const caption = project.captionPortuguese || project.captionEnglish || "";
  if (caption.trim()) return caption.trim().slice(0, 54);
  const handle = String(project.sourceUrl || "").match(/@([^/]+)/)?.[1];
  return handle ? `Post @${handle}` : `Projeto ${project.runId}`;
}

function copyText(value) {
  return navigator.clipboard.writeText(value || "");
}

function defaultTextLayer(slide = {}) {
  return {
    id: "main",
    text: slide.reviewedEnglish || slide.ocrEnglish || "",
    x: 540,
    y: 1520,
    width: 900,
    fontSize: 62,
    fontFamily: "sans-serif",
    color: "#f8f3eb",
    strokeColor: "rgba(5, 6, 8, 0.55)",
    strokeWidth: 14,
    align: "center",
    hidden: false,
  };
}

async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${fallbackMessage} O servidor respondeu em formato inválido. Atualize a página e tente de novo.`);
  }
}

function LoadingIcon({ active }) {
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

function StudioHeader({ activeStage, status, hasProject, onGoHome }) {
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
        <div className="status-pill">
          <span>{activeStep.number}</span>
          <strong>{activeStep.title}</strong>
          <small>{status}</small>
        </div>
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

function EditableStoryPreview({ slide, layers, activeLayerId, onSelectLayer, onLayerMove, onPrev, onNext, slideIndex, total }) {
  const dragRef = useRef(null);
  const screenRef = useRef(null);
  const backgroundUrl = assetUrl(slide?.renderedImageUrl || slide?.replacementImageUrl || slide?.sourceImageUrl);

  function handlePointerDown(event, layer) {
    event.preventDefault();
    dragRef.current = {
      id: layer.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: Number(layer.x || 540),
      startY: Number(layer.y || 960),
    };
    onSelectLayer(layer.id);
  }

  function handlePointerMove(event) {
    if (!dragRef.current || !screenRef.current) return;
    const rect = screenRef.current.getBoundingClientRect();
    const { deltaX, deltaY } = computeLayerDelta({
      startClientX: dragRef.current.startClientX,
      startClientY: dragRef.current.startClientY,
      clientX: event.clientX,
      clientY: event.clientY,
      previewWidth: rect.width,
      previewHeight: rect.height,
    });
    onLayerMove(dragRef.current.id, {
      x: Math.max(80, Math.min(1000, dragRef.current.startX + deltaX)),
      y: Math.max(120, Math.min(1800, dragRef.current.startY + deltaY)),
    });
  }

  function stopDrag() {
    dragRef.current = null;
  }

  return (
    <div className="editable-preview-shell">
      <div className="download-title">
        <p className="stage-label">Etapa 04</p>
        <h2>Edite o slide final</h2>
        <p>Toque no texto para selecionar. Arraste dentro do preview para reposicionar.</p>
      </div>
      <div className="phone-preview editor-phone-preview">
        <div className="phone-preview__top">
          <span>{slide ? `Slide ${slide.index}` : "Editor"}</span>
          <span>{total ? `${slideIndex + 1}/${total}` : "0/0"}</span>
        </div>
        <div
          className="phone-screen editor-screen"
          ref={screenRef}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDrag}
          onPointerLeave={stopDrag}
        >
          {total > 1 && (
            <div className="story-progress" aria-hidden="true">
              {Array.from({ length: total }).map((_, index) => (
                <span className={index <= slideIndex ? "active" : ""} key={index} />
              ))}
            </div>
          )}
          {backgroundUrl ? <img src={backgroundUrl} alt={`Preview editavel do slide ${slide?.index || ""}`} /> : <div className="empty-screen"><p>Envie uma imagem para editar.</p></div>}
          <div className="editor-overlay">
            {layers.map((layer, index) => (
              <button
                type="button"
                key={layer.id || index}
                className={`editor-layer ${activeLayerId === layer.id ? "active" : ""}`}
                style={{
                  left: `${(Number(layer.x || 540) / 1080) * 100}%`,
                  top: `${(Number(layer.y || 960) / 1920) * 100}%`,
                  width: `${(Number(layer.width || 900) / 1080) * 100}%`,
                  minHeight: `${estimateLayerFrameHeight(layer)}%`,
                  display: layer.hidden ? "none" : "block",
                }}
                onClick={() => onSelectLayer(layer.id)}
                onPointerDown={(event) => handlePointerDown(event, layer)}
              >
                <span>{`Texto ${index + 1}`}</span>
              </button>
            ))}
          </div>
          {total > 1 && (
            <>
              <button className="story-tap-zone story-tap-zone--left" type="button" onClick={onPrev} disabled={slideIndex === 0} aria-label="Slide anterior">
                <span>Anterior</span>
              </button>
              <button className="story-tap-zone story-tap-zone--right" type="button" onClick={onNext} disabled={slideIndex >= total - 1} aria-label="Proximo slide">
                <span>Proximo</span>
              </button>
            </>
          )}
        </div>
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

function ProjectShelf({ projects, loading, onOpenProject, onDeleteProject }) {
  if (loading) {
    return (
      <section className="project-shelf">
        <div className="shelf-title">
          <span>Projetos salvos</span>
          <small>Carregando...</small>
        </div>
      </section>
    );
  }

  if (!projects.length) {
    return (
      <section className="project-shelf empty-shelf">
        <div className="shelf-title">
          <span>Projetos salvos</span>
          <small>Seus posts vão aparecer aqui automaticamente.</small>
        </div>
      </section>
    );
  }

  return (
    <section className="project-shelf">
      <div className="shelf-title">
        <span>Projetos salvos</span>
        <small>Continue de onde parou.</small>
      </div>
      <div className="project-grid">
        {projects.map((project, index) => (
          <article className="project-card" key={project.runId}>
            <div>
              <span>Post {index + 1}</span>
              <strong>{projectTitle(project)}</strong>
              <small>
                {project.slideCount || 0} slides · {steps[stageIndex[stageByRun[project.stage] || project.stage] || 0]?.title || "Rascunho"}
              </small>
            </div>
            <div className="project-actions">
              <button className="action-button main-action" type="button" onClick={() => onOpenProject(project.runId)}>
                Abrir
              </button>
              <button className="action-button danger-action" type="button" onClick={() => onDeleteProject(project.runId)}>
                Excluir
              </button>
            </div>
          </article>
        ))}
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
          Salvar imagens e gerar preview
        </button>
      </div>
    </section>
  );
}

function EditStage({
  run,
  activeIndex,
  setActiveIndex,
  onContinue,
  onApplyLayers,
  applyingLayers,
  onReplaceImage,
  replacingImage,
}) {
  const slide = run.slides[activeIndex];
  const caption = run.captionPortuguese || run.captionEnglish || "";
  const hashtags = hashtagsToText(run.hashtags);
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [layersDraft, setLayersDraft] = useState([]);
  const replaceInputRef = useRef(null);

  useEffect(() => {
    const incoming = Array.isArray(slide?.textLayers) && slide.textLayers.length ? slide.textLayers : [defaultTextLayer(slide)];
    setLayersDraft(incoming.map((layer) => ({ ...layer })));
    setSelectedLayerId(incoming[0]?.id || "");
  }, [slide?.index, slide?.textLayers, slide?.reviewedEnglish, slide?.ocrEnglish]);

  const selectedLayer =
    layersDraft.find((layer) => layer.id === selectedLayerId) ||
    layersDraft[0] ||
    defaultTextLayer(slide);

  function updateSelectedLayer(field, value) {
    setLayersDraft((current) =>
      current.map((layer) => (layer.id === selectedLayer.id ? { ...layer, [field]: value } : layer))
    );
  }

  function addLayer() {
    const id = `layer-${Date.now()}`;
    const next = {
      ...defaultTextLayer(slide),
      id,
      text: "Novo texto",
      y: 960,
      fontSize: 54,
    };
    setLayersDraft((current) => [...current, next]);
    setSelectedLayerId(id);
  }

  function removeSelectedLayer() {
    if (!selectedLayer) return;
    setLayersDraft((current) => {
      if (current.length <= 1) return current;
      const filtered = current.filter((layer) => layer.id !== selectedLayer.id);
      setSelectedLayerId(filtered[0]?.id || "");
      return filtered;
    });
  }

  function moveLayer(layerId, patch) {
    setLayersDraft((current) => current.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer)));
  }

  return (
    <section className="stage-card edit-stage">
      <div className="edit-workbench">
        <div className="story-column">
          <EditableStoryPreview
            slide={slide}
            layers={layersDraft}
            activeLayerId={selectedLayer.id}
            onSelectLayer={setSelectedLayerId}
            onLayerMove={moveLayer}
            slideIndex={activeIndex}
            total={run.slides.length}
            onPrev={() => setActiveIndex(Math.max(0, activeIndex - 1))}
            onNext={() => setActiveIndex(Math.min(run.slides.length - 1, activeIndex + 1))}
          />
          <SlideRail rendered slides={run.slides} activeIndex={activeIndex} onSelect={setActiveIndex} />
        </div>

        <div className="edit-panel">
          <article className="paint-panel">
            <header>
              <strong>Painel de edicao</strong>
              <span>Troque o fundo, edite o texto e valide tudo antes de publicar.</span>
            </header>
            <div className="paint-layer-list">
              {layersDraft.map((layer, index) => (
                <button
                  type="button"
                  key={layer.id || index}
                  className={`paint-layer-chip ${selectedLayer.id === layer.id ? "active" : ""}`}
                  onClick={() => setSelectedLayerId(layer.id)}
                >
                  <Type size={14} />
                  {layer.text?.slice(0, 24) || `Texto ${index + 1}`}
                </button>
              ))}
            </div>
            <div className="paint-actions">
              <button type="button" className="action-button ghost-action" onClick={addLayer}>
                + Adicionar texto
              </button>
              <button type="button" className="action-button ghost-action" onClick={() => replaceInputRef.current?.click()} disabled={replacingImage}>
                {replacingImage ? <Loader2 className="spin" size={18} /> : <ImagePlus size={18} />}
                Trocar imagem do fundo
              </button>
              <button
                type="button"
                className="action-button quiet-action"
                onClick={removeSelectedLayer}
                disabled={layersDraft.length <= 1}
              >
                Remover texto
              </button>
            </div>
            <input
              hidden
              ref={replaceInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onReplaceImage(slide.index, file);
                event.target.value = "";
              }}
            />
            <label className="input-group">
              <span>Texto da camada selecionada</span>
              <textarea
                value={selectedLayer.text || ""}
                onChange={(event) => updateSelectedLayer("text", event.target.value)}
                placeholder="Digite o texto da camada..."
              />
            </label>
            <div className="paint-grid">
              <label className="input-group">
                <span>Largura ({Math.round(Number(selectedLayer.width || 900))})</span>
                <input
                  type="range"
                  min="320"
                  max="980"
                  value={Number(selectedLayer.width || 900)}
                  onChange={(event) => updateSelectedLayer("width", Number(event.target.value))}
                />
              </label>
              <label className="input-group">
                <span>Posição X ({Math.round(Number(selectedLayer.x || 540))})</span>
                <input
                  type="range"
                  min="80"
                  max="1000"
                  value={Number(selectedLayer.x || 540)}
                  onChange={(event) => updateSelectedLayer("x", Number(event.target.value))}
                />
              </label>
              <label className="input-group">
                <span>Posição Y ({Math.round(Number(selectedLayer.y || 1520))})</span>
                <input
                  type="range"
                  min="120"
                  max="1800"
                  value={Number(selectedLayer.y || 1520)}
                  onChange={(event) => updateSelectedLayer("y", Number(event.target.value))}
                />
              </label>
              <label className="input-group">
                <span>Cor do texto</span>
                <input type="color" value={selectedLayer.color || "#f8f3eb"} onChange={(event) => updateSelectedLayer("color", event.target.value)} />
              </label>
              <label className="input-group">
                <span>Cor do contorno</span>
                <input
                  type="color"
                  value={String(selectedLayer.strokeColor || "#050608").startsWith("#") ? selectedLayer.strokeColor : "#050608"}
                  onChange={(event) => updateSelectedLayer("strokeColor", event.target.value)}
                />
              </label>
            </div>
            <div className="paint-actions">
              <button
                className="action-button main-action"
                type="button"
                onClick={() => onApplyLayers(slide.index, layersDraft)}
                disabled={applyingLayers}
              >
                {applyingLayers ? <Loader2 className="spin" size={18} /> : <Palette size={18} />}
                Atualizar preview
              </button>
              <button className="action-button main-action" type="button" onClick={onContinue}>
                <Send size={18} />
                Tudo certo, ir para publicar
              </button>
            </div>
          </article>

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
          <p className="stage-label">Etapa 05</p>
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
  const [replacementFiles, setReplacementFiles] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [publishing, setPublishing] = useState(false);
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
    loadProjects();
    const route = parseProjectRoute(window.location.pathname);
    if (route.view === "project" && route.runId) {
      openProject(route.runId, { silent: true, syncRoute: false });
    }
  }, []);

  useEffect(() => {
    function handlePopState() {
      const route = parseProjectRoute(window.location.pathname);
      if (route.view === "project" && route.runId) {
        openProject(route.runId, { silent: true, syncRoute: false });
        return;
      }

      clearActiveProject();
      setError("");
      setStatus("Escolha um projeto salvo ou crie um novo.");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!run?.runId) return;
    localStorage.setItem(currentRunStorageKey, run.runId);
    localStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        runId: run.runId,
        draftSlides,
        draftCaptionEnglish,
        draftCaptionPortuguese,
        draftHashtags,
        currentReviewIndex,        updatedAt: new Date().toISOString(),
      })
    );
  }, [run?.runId, draftSlides, draftCaptionEnglish, draftCaptionPortuguese, draftHashtags, currentReviewIndex ]);

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
        const data = await readJsonResponse(response, "Não consegui conectar o Postiz.");
        if (!response.ok) throw new Error(data.error || "Não consegui conectar o Postiz.");
        setAccounts(data.accounts || []);
        setStatus(data.warning || "Postiz conectado. Volte para a etapa Publicar.");
        const runId = localStorage.getItem(currentRunStorageKey);
        window.history.replaceState({}, "", buildProjectRoute(runId));
      } catch (requestError) {
        setError(requestError.message);
        setStatus("Postiz não conectado.");
      }
    }

    finishPostizOAuth();
  }, []);

  function syncProjectRoute(runId, { replace = false } = {}) {
    const nextUrl = buildProjectRoute(runId);
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl === currentUrl) return;
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({}, "", nextUrl);
  }

  function clearActiveProject() {
    setRun(null);
    setDraftSlides([]);
    setDraftCaptionEnglish("");
    setDraftCaptionPortuguese("");
    setDraftHashtags("");
    setCurrentReviewIndex(0);
    setReplacementFiles([]);
    setSelectedStage("extract");
  }

  function goHome({ replace = false, statusMessage = "Escolha um projeto salvo ou crie um novo." } = {}) {
    clearActiveProject();
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({}, "", "/");
    setError("");
    setStatus(statusMessage);
  }

  function hydrateRun(nextRun, options = {}) {
    const nextUnlockedStages = getUnlockedStages(nextRun);
    const nextStage = nextUnlockedStages.includes(options.stage) ? options.stage : getActiveStage(nextRun);

    setRun(nextRun);
    setDraftSlides(nextRun.slides.map((slide) => ({ ...slide })));
    setDraftCaptionEnglish(nextRun.captionEnglish || "");
    setDraftCaptionPortuguese(nextRun.captionPortuguese || "");
    setDraftHashtags(hashtagsToText(nextRun.hashtags));
    setCurrentReviewIndex(0);
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
  }

  async function loadProjects() {
    setLoadingProjects(true);
    try {
      const response = await fetch(`${apiBase}/api/projects`);
      const data = await readJsonResponse(response, "Não consegui carregar seus projetos.");
      if (!response.ok) throw new Error(data.error || "Não consegui carregar seus projetos.");
      setProjects(data.items || []);
    } catch (requestError) {
      console.warn("[projects] load failed", requestError);
    } finally {
      setLoadingProjects(false);
    }
  }

  async function openProject(runId, { silent = false, syncRoute = true } = {}) {
    if (!runId) return;
    setError("");
    if (!silent) setStatus("Abrindo projeto salvo...");
    try {
      const response = await fetch(`${apiBase}/api/runs/${runId}`);
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
      const response = await fetch(`${apiBase}/api/runs/${runId}`, { method: "DELETE" });
      const data = await readJsonResponse(response, "Não consegui excluir esse projeto.");
      if (!response.ok) throw new Error(data.error || "Não consegui excluir esse projeto.");
      if (run?.runId === runId) {
        localStorage.removeItem(currentRunStorageKey);
        localStorage.removeItem(draftStorageKey);
        goHome({ replace: true, statusMessage: "Projeto excluído." });
      }
      setProjects((items) => items.filter((project) => project.runId !== runId));
      if (run?.runId !== runId) setStatus("Projeto excluído.");
    } catch (requestError) {
      setError(requestError.message);
    }
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
      const data = await readJsonResponse(response, "Não consegui carregar as contas do Postiz.");
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
    setStatus("Lendo os prints enviados...");

    try {
      const formData = new FormData();
      selected.forEach((file) => formData.append("slides", file));
      const response = await fetch(`${apiBase}/api/ocr-upload`, { method: "POST", body: formData });
      const data = await readJsonResponse(response, "Não consegui iniciar a conexão com Postiz.");
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

      const data = await readJsonResponse(response, "Não consegui enviar ao Postiz.");
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
      const response = await fetch(`${apiBase}/api/runs/${run.runId}/replacements`, {
        method: "POST",
        body: formData,
      });
      const data = await readJsonResponse(response, "Nao consegui enviar as imagens.");
      if (!response.ok) throw new Error(data.error || "Não consegui enviar as imagens.");
      setStatus("Imagens salvas. Gerando slideshow final...");
      const renderResponse = await fetch(`${apiBase}/api/runs/${run.runId}/render`, { method: "POST" });
      const renderData = await readJsonResponse(renderResponse, "Nao consegui gerar o preview final.");
      if (!renderResponse.ok) throw new Error(renderData.error || "Nao consegui gerar o preview final.");
      hydrateRun(renderData, { stage: "publish", replaceRoute: true });
      setStatus("Preview pronto. Agora siga para publicar.");
      loadProjects();
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Upload não concluído.");
    } finally {
      setUploadingImages(false);
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
      setStatus(
        data.warning ||
          (data.accounts?.length ? `${data.accounts.length} conta(s) TikTok carregada(s).` : "Nenhuma conta TikTok encontrada no Postiz.")
      );
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
      hydrateRun(data.run, { stage: "publish", replaceRoute: true });
      setStatus("Rascunho enviado. Confira no Postiz/TikTok antes de publicar.");
      loadProjects();
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Envio ao Postiz não concluído.");
    } finally {
      setPublishing(false);
    }
  }

  function selectStage(stepKey) {
    if (!run) {
      goHome();
      return;
    }

    if (stepKey === "extract") {
      goHome();
      return;
    }

    if (!unlockedStages.includes(stepKey)) return;
    setSelectedStage(stepKey);
    setError("");
    setStatus(`Etapa ${steps[stageIndex[stepKey]]?.title || stepKey} aberta.`);

    if (stepKey === "publish" && !accounts.length && !loadingAccounts) {
      loadPostizAccounts();
    }
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
        <StudioHeader activeStage={activeStage} status={status} hasProject={Boolean(run)} onGoHome={() => goHome()} />

        {error && (
          <div className="error-banner" role="alert">
            <strong>Precisa de atenção</strong>
            <span>{error}</span>
          </div>
        )}

        {activeStage === "extract" && (
          <>
            <ExtractStage
              url={url}
              setUrl={setUrl}
              extracting={extracting}
              onExtract={extractPost}
              onUploadScreenshots={uploadScreenshots}
            />
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
            onSelectFiles={selectReplacementFiles}
            onRemoveFile={removeReplacementFile}
            onMoveFile={moveReplacementImage}
            onClearFiles={clearReplacementFiles}
            previews={replacementPreviews}
            onUpload={uploadReplacementImages}
            uploading={uploadingImages}
          />
        )}`r`n        {activeStage === "publish" && run && (
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

        {(extracting || savingReview || uploadingImages || publishing) && (
          <div className="work-overlay">
            <LoadingIcon active />
            <span>{status}</span>
          </div>
        )}
      </section>
    </main>
  );
}






