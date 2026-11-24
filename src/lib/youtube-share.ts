import { CapacitorHttp } from '@capacitor/core';
import { youtubeVideoId, type Team } from './catalog.ts';
import { parsePaste } from './paste.ts';
import {
  loadPokepaste,
  pasteTeamName,
  type PokepastePayload,
} from './pokepaste.ts';
import { later } from './timers.ts';

export type ShareOption = { label: string; detail: string } & (
  { team: Team } | { payload: PokepastePayload } | { error: true }
);
export type YoutubeVideo = {
  title: string;
  channel: string;
  description: string;
};

export class YoutubeUnavailableError extends Error {}

const pastePattern =
  /(?<![A-Za-z0-9_./@-])(?:https?:\/\/)?pokepast\.es\/([\da-f]{16})(?![\da-z])/gi;

function jsonString(html: string, pattern: RegExp): string | null {
  const match = pattern.exec(html);
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return null;
  }
}

export function videoOf(html: string): YoutubeVideo | null {
  const description = jsonString(
    html,
    /"shortDescription":"((?:[^"\\]|\\.)*)"/
  );
  if (description === null) return null;
  const title = jsonString(
    html,
    /"videoDetails":\{"videoId":"[^"]*","title":"((?:[^"\\]|\\.)*)"/
  );
  const channel = jsonString(html, /"author":"((?:[^"\\]|\\.)*)"/);
  return {
    title: (title ?? '').trim(),
    channel: (channel ?? '')
      .trim()
      .slice(0, 60)
      .replace(/[\uD800-\uDBFF]$/, ''),
    description,
  };
}

export function descriptionPastes(
  description: string
): { url: string; label: string }[] {
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
  return [...found].map(([url, label]) => ({ url, label }));
}

export async function loadYoutubeVideo(id: string): Promise<YoutubeVideo> {
  const response = await CapacitorHttp.get({
    url: `https://www.youtube.com/watch?v=${id}`,
    headers: { 'Accept-Language': 'en' },
    responseType: 'text',
    connectTimeout: 10_000,
    readTimeout: 10_000,
  });
  const video =
    response.status === 200 && typeof response.data === 'string'
      ? videoOf(response.data)
      : null;
  if (!video)
    throw new YoutubeUnavailableError('YouTube returned no description.');
  return video;
}

async function loadPaste(url: string): Promise<PokepastePayload> {
  const controller = new AbortController();
  const cancelTimeout = later(() => controller.abort(), 10_000);
  try {
    return await loadPokepaste(url, fetch, controller.signal);
  } finally {
    cancelTimeout();
  }
}

const teamOption = (team: Team): ShareOption => ({
  label: team.name,
  detail: team.members.map((member) => member.pokemon).join(' · '),
  team,
});

export async function youtubeShareOptions(
  id: string,
  teams: readonly Team[],
  video: (id: string) => Promise<YoutubeVideo> = loadYoutubeVideo,
  paste: (url: string) => Promise<PokepastePayload> = loadPaste
): Promise<ShareOption[]> {
  const matches = teams.filter((team) =>
    team.reports.some((report) => youtubeVideoId(report.sourceUrl) === id)
  );
  if (matches.length) return matches.map(teamOption);
  const { title, channel, description } = await video(id);
  const links = descriptionPastes(description);
  return Promise.all(
    links.map(async ({ url, label }): Promise<ShareOption> => {
      const known = teams.filter((team) => team.pasteUrl === url);
      if (known.length === 1) return teamOption(known[0]);
      try {
        const payload = await paste(url);
        const members = parsePaste(payload.paste);
        const part = links.length > 1 ? label || payload.title : '';
        const heading = [title, part]
          .filter(Boolean)
          .join(': ')
          .slice(0, 200)
          .replace(/[\uD800-\uDBFF]$/, '');
        const name = channel
          ? pasteTeamName(members, channel)
          : heading || payload.title;
        return {
          label: part || name,
          detail: members.map((member) => member.pokemon).join(' · '),
          payload: {
            ...payload,
            title: name,
            ...(channel && {
              report: {
                event: `${channel} video`,
                rank: '',
                sourceUrl: `https://www.youtube.com/watch?v=${id}`,
                ...(heading && { videoTitle: heading }),
              },
            }),
          },
        };
      } catch (error) {
        return {
          label: label || url.slice(8),
          detail:
            error instanceof Error && error.name === 'Error'
              ? error.message
              : 'Could not load this Poképaste.',
          error: true,
        };
      }
    })
  );
}
