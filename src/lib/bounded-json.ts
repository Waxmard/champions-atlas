function formatBytes(bytes: number): string {
  if (bytes % 1024 ** 2 === 0) return `${bytes / 1024 ** 2} MiB`;
  if (bytes % 1024 === 0) return `${bytes / 1024} KiB`;
  return `${bytes} bytes`;
}

export async function readBoundedJson(
  response: Response,
  maxBytes: number,
  label: string
): Promise<unknown> {
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`${label} HTTP ${response.status}.`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${label} response body is missing.`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      void reader.cancel().catch(() => undefined);
      throw new Error(`${label} response exceeds ${formatBytes(maxBytes)}.`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
