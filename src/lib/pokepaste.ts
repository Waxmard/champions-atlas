import { parseCustomPaste } from './paste.ts';

export type PokepastePayload = { url: string; title: string; paste: string };

export function canonicalPokepasteUrl(input: string): string {
  const trimmed = input.trim();
  const normalized = /^[\da-f]{16}$/i.test(trimmed)
    ? `https://pokepast.es/${trimmed}`
    : /^pokepast\.es\//i.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('Enter a Poképaste link or 16-character paste ID.');
  }
  const authority = /^https?:\/\/([^/?#\\]*)/i.exec(normalized)?.[1];
  const match = /^https?:\/\/[^/?#\\]*\/([\da-f]{16})\/?(?:[?#]|$)/i.exec(
    normalized
  );
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.hostname !== 'pokepast.es' ||
    url.username ||
    url.password ||
    url.port ||
    !authority ||
    /[@:]/.test(authority) ||
    !match
  ) {
    throw new Error('Enter a Poképaste link or 16-character paste ID.');
  }
  return `https://pokepast.es/${match[1].toLowerCase()}`;
}

export async function loadPokepaste(
  url: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<PokepastePayload> {
  const canonicalUrl = canonicalPokepasteUrl(url);
  const response = await fetcher(`${canonicalUrl}/json`, {
    credentials: 'omit',
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`Poképaste could not be loaded (HTTP ${response.status}).`);
  }
  const contentType = response.headers
    .get('content-type')
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (
    contentType !== 'application/json' &&
    !/^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(contentType ?? '')
  ) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error('Poképaste returned non-JSON content.');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Poképaste returned invalid JSON.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 256 * 1024) {
      void reader.cancel().catch(() => undefined);
      throw new Error('Poképaste response exceeds 256 KiB.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('Poképaste returned invalid JSON.');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Poképaste returned an invalid paste.');
  }
  const payload = data as Record<string, unknown>;
  if (typeof payload.paste !== 'string') {
    throw new Error('Poképaste returned an invalid paste.');
  }
  if (payload.paste.length > 50_000) {
    throw new Error('Poképaste paste exceeds 50,000 characters.');
  }
  parseCustomPaste(payload.paste);
  const title =
    typeof payload.title === 'string'
      ? payload.title
          .trim()
          .slice(0, 200)
          .replace(/[\uD800-\uDBFF]$/, '')
          .trimEnd()
      : '';
  return {
    url: canonicalUrl,
    title: title || `Poképaste ${canonicalUrl.slice(-16)}`,
    paste: payload.paste,
  };
}
