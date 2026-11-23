import { resolveBattleForm } from './battle-forms.ts';
import { readBoundedJson } from './bounded-json.ts';
import { isMegaSpecies, type Member } from './catalog.ts';
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

export function pasteTeamName(
  members: readonly Member[],
  author: string
): string {
  const megas: string[] = [];
  const rest: string[] = [];
  for (const member of members) {
    const form = resolveBattleForm(member).pokemon;
    if (isMegaSpecies(form)) megas.push(form.replace(/-Mega(-[XYZ])?$/i, '$1'));
    else rest.push(member.pokemon);
  }
  const pair = [...megas, ...rest].slice(0, 2).join(' ');
  return `${author ? `${author}'s ` : ''}${pair} Team`;
}

export class PokepasteUnavailableError extends Error {}

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
    throw new PokepasteUnavailableError(
      `Poképaste could not be loaded (HTTP ${response.status}).`
    );
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
    throw new PokepasteUnavailableError('Poképaste returned non-JSON content.');
  }

  if (!response.body)
    throw new PokepasteUnavailableError('Poképaste returned invalid JSON.');
  let data: unknown;
  try {
    data = await readBoundedJson(response, 256 * 1024, 'Poképaste');
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof TypeError))
      throw error;
    throw new PokepasteUnavailableError('Poképaste returned invalid JSON.', {
      cause: error,
    });
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new PokepasteUnavailableError('Poképaste returned an invalid paste.');
  }
  const payload = data as Record<string, unknown>;
  if (typeof payload.paste !== 'string') {
    throw new PokepasteUnavailableError('Poképaste returned an invalid paste.');
  }
  if (payload.paste.length > 50_000) {
    throw new Error('Poképaste paste exceeds 50,000 characters.');
  }
  const members = parseCustomPaste(payload.paste);
  const text = (value: unknown, max: number) =>
    typeof value === 'string'
      ? value
          .trim()
          .slice(0, max)
          .replace(/[\uD800-\uDBFF]$/, '')
          .trimEnd()
      : '';
  const title = text(payload.title, 200);
  return {
    url: canonicalUrl,
    title:
      title && !/^untitled$/i.test(title)
        ? title
        : pasteTeamName(members, text(payload.author, 60)),
    paste: payload.paste,
  };
}
