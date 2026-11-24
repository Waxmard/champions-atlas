export function later(run: () => void, ms: number): () => void {
  const id = setTimeout(run, ms);
  return () => clearTimeout(id);
}

export function afterFrame(run: () => void): void {
  requestAnimationFrame(run);
}
