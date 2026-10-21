import {
  battleSpecies,
  cosmeticForms,
  resolveBattleForm,
} from '../src/lib/battle-forms.ts';
import { normalize } from '../src/lib/catalog.ts';
import { parseVrPaste } from './catalog-sources.mjs';
import { parsePaste } from '../src/lib/paste.ts';
import { assetSlug as slug, basePokemon as base } from './sync-assets.mjs';
import { reportsWithLadderNotes } from './catalog-results.mjs';
function errorWithReason(reason, message) {
  const error = new Error(message);
  error.reason = reason;
  return error;
}

const isVrPasteUrl = (value) => value.startsWith('https://www.vrpastes.com/');
const vrPasteApi = (id) =>
  `https://vrpaste-backend.vercel.app/api/paste/${id}?lang=english`;

function validateProviderJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw errorWithReason(
      'invalid_payload',
      'Provider payload is not a JSON object'
    );
}

export const championRegulation = (value) => {
  if (typeof value !== 'string') return null;
  const text = normalize(value);
  return (
    /vgcregulation([a-z]{2})$/.exec(text)?.[1] ??
    /champions.*reg([a-z]{2})$/.exec(text)?.[1] ??
    null
  );
};

async function loadVictoryRoadPayload(candidate, fetchCached, refresh) {
  const id = candidate.pasteUrl.split('/').at(-1);
  let text;
  try {
    text = await fetchCached(
      `vr-${id}.json`,
      vrPasteApi(id),
      validateProviderJson,
      refresh
    );
  } catch (error) {
    throw error.reason
      ? error
      : errorWithReason('paste_unavailable', error.message);
  }
  try {
    return { ...parseVrPaste(JSON.parse(text)), provider: 'victory-road' };
  } catch (error) {
    throw error.reason
      ? error
      : errorWithReason('invalid_payload', `Invalid VR payload: ${id}`);
  }
}

async function loadPokepastePayload(candidate, fetchCached, refresh) {
  const key = candidate.pasteUrl.split('/').at(-1);
  let text;
  try {
    text = await fetchCached(
      `${key}.json`,
      `${candidate.pasteUrl}/json`,
      validateProviderJson,
      refresh
    );
  } catch (error) {
    throw error.reason
      ? error
      : errorWithReason('paste_unavailable', error.message);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw errorWithReason('invalid_payload', `Invalid paste payload: ${key}`);
  }
  return {
    paste: data.paste,
    notes: data.notes,
    publishedAt: '',
    provider: 'pokepaste',
    title: data.title,
  };
}

export function loadIndexPaste(candidate, fetchCached, refresh = false) {
  return isVrPasteUrl(candidate.pasteUrl)
    ? loadVictoryRoadPayload(candidate, fetchCached, refresh)
    : loadPokepastePayload(candidate, fetchCached, refresh);
}

export function validateIndexFormat(candidate, payload) {
  const regulation = normalize(candidate.regulation);
  if (!['ma', 'mb', 'mc'].includes(regulation))
    throw errorWithReason('invalid_payload', 'Invalid candidate regulation');
  if (payload.provider === 'victory-road') {
    const format = payload.format;
    if (format === undefined || format === null || format === '') return;
    if (typeof format !== 'string')
      throw errorWithReason('invalid_payload', 'VR format must be a string');
    if (normalize(format) !== `vgcregulation${regulation}`)
      throw errorWithReason('format_conflict', `Unexpected format: ${format}`);
    return;
  }
  const notes = payload.notes;
  if (notes === undefined || notes === null) return;
  if (typeof notes !== 'string')
    throw errorWithReason('invalid_payload', 'Paste notes must be a string');
  for (const line of notes.split(/\r?\n/)) {
    const match = /^\s*Format\s*:\s*(.*?)\s*$/i.exec(line);
    if (match && championRegulation(match[1]) !== regulation)
      throw errorWithReason(
        'format_conflict',
        `Unexpected format: ${match[1]}`
      );
  }
}

export function resolvedPokemon(member) {
  const resolved = resolveBattleForm(member);
  return resolved.error ? member.pokemon : resolved.pokemon;
}

export function rosterMatches(members, expectedSpecies) {
  if (expectedSpecies === null || expectedSpecies === undefined) return true;
  if (
    !Array.isArray(expectedSpecies) ||
    expectedSpecies.length !== 6 ||
    !expectedSpecies.every(
      (species) => typeof species === 'string' && species.trim()
    )
  )
    throw errorWithReason('invalid_roster', 'Invalid published roster');
  const canonical = (name) => {
    const species = battleSpecies(name)?.name || name;
    return cosmeticForms[normalize(species)] ?? species;
  };
  const actual = members
    .map((member) => normalize(canonical(resolvedPokemon(member))))
    .sort();
  const expected = expectedSpecies
    .map((species) => normalize(canonical(species)))
    .sort();
  if (actual.some((species, index) => species !== expected[index]))
    throw errorWithReason(
      'roster_mismatch',
      'Paste species do not match the published roster'
    );
  return true;
}
export function enrich(team, data) {
  const sets = parsePaste(data.paste);
  const members = team.members.map((member) => {
    const memberKey =
      cosmeticForms[base(member.pokemon)] ?? base(member.pokemon);
    const matches = sets.filter(
      (set) =>
        (cosmeticForms[base(set.pokemon)] ?? base(set.pokemon)) === memberKey &&
        slug(set.item || '') === slug(member.item || '')
    );
    if (matches.length !== 1)
      throw new Error(`Cannot match ${member.pokemon} in ${team.pasteUrl}`);
    return { ...matches[0], pokemon: member.pokemon };
  });
  return {
    ...team,
    members,
    reports: reportsWithLadderNotes(
      team.reports ?? [],
      data.notes,
      team.pasteUrl
    ),
    paste: data.paste,
    pasteNotes: typeof data.notes === 'string' ? data.notes : null,
    pasteError: undefined,
  };
}

export async function enrichPastes(
  teams,
  { loadPaste, previousTeams = [], limit = teams.length, concurrency = 3 }
) {
  const previous = new Map(previousTeams.map((team) => [team.pasteUrl, team]));

  const baseReports = new Map(teams.map((team) => [team, team.reports ?? []]));
  const withBaseReports = (team) => ({
    ...team,
    reports: baseReports.get(team),
  });
  for (const team of teams) {
    const prior = previous.get(team.pasteUrl);
    if (!prior?.paste) continue;
    try {
      Object.assign(
        team,
        enrich(withBaseReports(team), {
          paste: prior.paste,
          notes: prior.pasteNotes,
        })
      );
    } catch {
      // A changed sheet composition invalidates stale enrichment.
    }
  }
  const selected = teams.slice(0, limit);
  let enriched = 0;
  let failed = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < selected.length) {
      const team = selected[cursor++];
      try {
        Object.assign(
          team,
          enrich(withBaseReports(team), await loadPaste(team))
        );
        enriched++;
      } catch (error) {
        team.pasteError =
          error instanceof Error ? error.message : String(error);
        failed++;
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), selected.length) },
      worker
    )
  );
  return { attempted: selected.length, enriched, failed };
}

export function mergeSources(priorSources, frozenTeams, freshSources) {
  const frozenUrls = new Set(
    frozenTeams.flatMap((team) =>
      (Array.isArray(team?.reports) ? team.reports : []).map(
        (report) => report?.sourceUrl
      )
    )
  );
  const sheetHistory = frozenTeams.some((team) => team?.sheetIds?.length);
  const merged = new Map();
  const keyOf = ({ name, url }) => JSON.stringify([name, url]);
  for (const source of Array.isArray(priorSources) ? priorSources : [])
    if (
      typeof source?.name === 'string' &&
      typeof source.url === 'string' &&
      (frozenUrls.has(source.url) ||
        (sheetHistory && source.name === 'VGCPastes'))
    )
      merged.set(keyOf(source), source);
  for (const source of freshSources)
    merged.set(keyOf(source), { ...merged.get(keyOf(source)), ...source });
  return [...merged.values()];
}
