export function computeLayerDelta({
  startClientX,
  startClientY,
  clientX,
  clientY,
  previewWidth,
  previewHeight,
}) {
  const safeWidth = Math.max(1, Number(previewWidth || 0));
  const safeHeight = Math.max(1, Number(previewHeight || 0));
  return {
    deltaX: ((Number(clientX || 0) - Number(startClientX || 0)) / safeWidth) * 1080,
    deltaY: ((Number(clientY || 0) - Number(startClientY || 0)) / safeHeight) * 1920,
  };
}

export function estimateLayerFrameHeight(layer = {}) {
  const fontSize = Math.max(28, Number(layer.fontSize || 62));
  const lineCount = Math.max(1, String(layer.text || "").split("\n").filter(Boolean).length);
  const baseHeight = fontSize * lineCount * 1.2;
  return Math.max(5, Math.min(38, (baseHeight / 1920) * 100));
}
