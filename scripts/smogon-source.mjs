import { readFileSync } from 'node:fs';
import { Dex } from '@pkmn/dex';
import { normalize } from '../src/lib/catalog.ts';
import { CHAMPIONS_STATS } from '../src/lib/paste.ts';
import { championRegulation, teamFromIndex } from './catalog-payloads.mjs';
import { admitSourceTeams } from './champions-eligibility.mjs';

export const smogonName = 'Smogon sample teams';

const { lists } = JSON.parse(
  readFileSync(new URL('./data/smogon-samples.json', import.meta.url), 'utf8')
);

function fail(reason, message) {
  const error = new Error(`${smogonName}: ${message}`);
  error.reason = reason;
  throw error;
}

export const smogonSources = lists.map(({ name, url }) => ({ name, url }));

function entryFor(list, team) {
  const key = team.url.split('/').at(-1);
  const base = {
    id: `smogon-${list.id}-${team.regulation.toLowerCase()}-${key}`,
    listName: list.name,
    listUrl: list.url,
    name: team.name,
    creator: team.creator,
    regulation: team.regulation,
    url: team.url,
    replicaCode: team.replicaCode ?? null,
  };
  if (/^https:\/\/pokepast\.es\/[a-f0-9]{16}$/.test(team.url))
    return {
      ...base,
      showdown: false,
      cacheName: `${key}.json`,
      address: `${team.url}/json`,
    };
  if (/^https:\/\/teams\.pokemonshowdown\.com\/view\/\d+$/.test(team.url))
    return {
      ...base,
      showdown: true,
      cacheName: `showdown-${key}.json`,
      address: `https://teams.pokemonshowdown.com/api/getteam?teamid=${key}&full=1`,
    };
  throw new Error(`${smogonName}: unsupported team link ${team.url}`);
}

export const smogonEntries = lists.flatMap((list) =>
  list.teams.map((team) => entryFor(list, team))
);

if (new Set(smogonEntries.map(({ id }) => id)).size !== smogonEntries.length)
  throw new Error(`${smogonName}: duplicate team id`);

function known(value, label) {
  if (!value.exists) fail('invalid_payload', `Unknown ${label}: ${value.name}`);
  return value;
}

function unpackSet(packed) {
  const f = packed.split('|');
  const species = known(Dex.species.get(f[1] || f[0]), 'species');
  const item = f[2] ? known(Dex.items.get(f[2]), 'item') : null;
  const ability = known(Dex.abilities.get(f[3] ?? ''), 'ability');
  const nature = known(Dex.natures.get(f[5] ?? ''), 'nature');
  const moves = (f[4] ?? '')
    .split(',')
    .filter(Boolean)
    .map((move) => known(Dex.moves.get(move), 'move'));
  const points = CHAMPIONS_STATS.map((_, index) =>
    Number((f[6] ?? '').split(',')[index] || 0)
  );
  if (
    points.some((value) => !Number.isInteger(value) || value < 0 || value > 32)
  )
    fail('invalid_payload', 'Showdown EVs are not Champions stat points');
  const spread = CHAMPIONS_STATS.flatMap((stat, index) =>
    points[index] ? [`${points[index]} ${stat}`] : []
  ).join(' / ');
  return [
    item ? `${species.name} @ ${item.name}` : species.name,
    `Ability: ${ability.name}`,
    ...(spread ? [`EVs: ${spread}`] : []),
    `${nature.name} Nature`,
    ...moves.map((move) => `- ${move.name}`),
  ].join('\n');
}

export function parseShowdownTeam(text) {
  let data;
  try {
    if (!text.startsWith(']')) throw new Error('missing prefix');
    data = JSON.parse(text.slice(1));
  } catch {
    fail('invalid_payload', 'Showdown payload is not valid JSON');
  }
  if (
    !data ||
    typeof data.team !== 'string' ||
    !data.team ||
    typeof data.format !== 'string'
  )
    fail('invalid_payload', 'Showdown payload has no team');
  return {
    paste: data.team.split(']').filter(Boolean).map(unpackSet).join('\n\n'),
    format: data.format,
  };
}

export function smogonTeam(entry, text, canonicalNames = new Map()) {
  let paste;
  if (entry.showdown) {
    const parsed = parseShowdownTeam(text);
    if (championRegulation(parsed.format) !== normalize(entry.regulation))
      fail('format_conflict', `Unexpected format: ${parsed.format}`);
    paste = parsed.paste;
  } else {
    paste = JSON.parse(text).paste;
  }
  const reports = [
    ...(entry.showdown
      ? [{ event: 'Pokémon Showdown team', rank: '', sourceUrl: entry.url }]
      : []),
    {
      event: `${entry.listName} collection`,
      rank: '',
      sourceUrl: entry.listUrl,
    },
  ];
  const team = teamFromIndex(
    {
      regulation: entry.regulation,
      pasteUrl: entry.url,
      name: entry.name,
      creator: entry.creator,
      replicaCode: entry.replicaCode,
      reports,
    },
    { paste },
    canonicalNames
  );
  return {
    ...team,
    id: entry.id,
    pasteUrl: entry.showdown ? '' : entry.url,
    format: 'singles',
  };
}

const validate = (value) => {
  JSON.parse(value.replace(/^\]/, ''));
};

export async function admitSmogon(fetchCached, canonicalNames, options) {
  const teams = [];
  const skipped = [];
  let unavailable = 0;
  for (const entry of smogonEntries) {
    if (!options.fullHistory && entry.regulation !== options.currentRegulation)
      continue;
    let text;
    try {
      text = await fetchCached(
        entry.cacheName,
        entry.address,
        validate,
        false,
        {
          optional: true,
        }
      );
    } catch (error) {
      console.warn(
        `${smogonName}: ${entry.url} unavailable (${error.message})`
      );
      text = null;
    }
    if (text === null) {
      unavailable += 1;
      continue;
    }
    try {
      teams.push(smogonTeam(entry, text, canonicalNames));
    } catch (error) {
      skipped.push({
        id: entry.id,
        reason: error.reason || 'invalid_payload',
        message: error.message,
      });
      console.warn(`${smogonName}: skipped ${entry.url} (${error.message})`);
    }
  }
  if (unavailable)
    console.warn(`${smogonName}: ${unavailable} team links unavailable`);
  return admitSourceTeams(smogonName, { teams, skipped }, options);
}
