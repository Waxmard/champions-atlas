import { CapacitorHttp } from '@capacitor/core';
import { youtubeVideoId, type Team } from './catalog.ts';

export type ShareOption = { label: string; detail: string } & (
  { team: Team } | { url: string }
);

export class YoutubeUnavailableError extends Error {}

const pastePattern =
  /(?<![A-Za-z0-9_./@-])(?:https?:\/\/)?pokepast\.es\/([\da-f]{16})(?![\da-z])/gi;

export function descriptionOf(html: string): string | null {
  const match = /"shortDescription":"((?:[^"\\]|\\.)*)"/.exec(html);
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return null;
  }
}

export function descriptionPastes(description: string): ShareOption[] {
  const found = new Map<string, string>();
  for (const line of description.split('\n'))
    for (const match of line.matchAll(pastePattern)) {
      const url = `https://pokepast.es/${match[1].toLowerCase()}`;
      if (found.has(url)) continue;
      found.set(
        url,
        line
          .slice(0, match.index)
          .replace(/[\s:|>•→–—-]+$/, '')
          .replace(/^[\s•>*-]+/, '')
          .slice(-80)
      );
    }
  return [...found].map(([url, label]) => ({
    label: label || 'Poképaste',
    detail: url.slice(8),
    url,
  }));
}

export async function loadYoutubeDescription(id: string): Promise<string> {
  const response = await CapacitorHttp.get({
    url: `https://www.youtube.com/watch?v=${id}`,
    headers: { 'Accept-Language': 'en' },
    responseType: 'text',
    connectTimeout: 10_000,
    readTimeout: 10_000,
  });
  const description =
    response.status === 200 && typeof response.data === 'string'
      ? descriptionOf(response.data)
      : null;
  if (description === null)
    throw new YoutubeUnavailableError('YouTube returned no description.');
  return description;
}

export async function youtubeShareOptions(
  id: string,
  teams: readonly Team[],
  load: (id: string) => Promise<string> = loadYoutubeDescription
): Promise<ShareOption[]> {
  const matches = teams.filter((team) =>
    team.reports.some((report) => youtubeVideoId(report.sourceUrl) === id)
  );
  if (matches.length)
    return matches.map((team) => ({
      label: team.name,
      detail: team.members.map((member) => member.pokemon).join(' · '),
      team,
    }));
  return descriptionPastes(await load(id));
}
