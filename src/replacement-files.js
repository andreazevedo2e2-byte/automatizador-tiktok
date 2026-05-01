export function mergeReplacementFiles(currentFiles = [], incomingFiles = [], limit = Infinity) {
  const current = Array.from(currentFiles);
  const incoming = Array.from(incomingFiles);
  const imageFiles = incoming.filter((file) => !file.type || file.type.startsWith("image/"));
  const remainingSlots = Math.max(0, limit - current.length);
  const accepted = imageFiles.slice(0, remainingSlots);

  return {
    files: [...current, ...accepted],
    acceptedCount: accepted.length,
    ignoredCount: Math.max(0, imageFiles.length - accepted.length),
    invalidCount: incoming.length - imageFiles.length,
    remainingSlots: Math.max(0, limit - current.length - accepted.length),
  };
}

export function moveReplacementFile(files = [], fromIndex, toIndex) {
  const nextFiles = Array.from(files);
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= nextFiles.length ||
    toIndex >= nextFiles.length
  ) {
    return nextFiles;
  }

  const [file] = nextFiles.splice(fromIndex, 1);
  nextFiles.splice(toIndex, 0, file);
  return nextFiles;
}
