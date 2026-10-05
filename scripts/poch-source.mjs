import { isDeepStrictEqual } from 'node:util';
import parse5 from 'parse5';
import { battleSpecies, resolveBattleForm } from '../src/lib/battle-forms.ts';
import { normalize } from '../src/lib/catalog.ts';
import { exportPaste, setText } from '../src/lib/workbench.ts';

export const pochUrl = 'https://poch.ms/en/leaderboard';

const publishedAliases = Object.fromEntries(
  [
    ['Floette', 'Floette-Eternal'],
    ['Eternal Flower Floette', 'Floette-Eternal'],
    ['Hisuian Arcanine', 'Arcanine-Hisui'],
    ['Hisuian Goodra', 'Goodra-Hisui'],
    ['Hisuian Samurott', 'Samurott-Hisui'],
    ['Hisuian Typhlosion', 'Typhlosion-Hisui'],
    ['Hisuian Zoroark', 'Zoroark-Hisui'],
    ['Alolan Ninetales', 'Ninetales-Alola'],
    ['Galarian Slowking', 'Slowking-Galar'],
    ['Wash Rotom', 'Rotom-Wash'],
    ['Heat Rotom', 'Rotom-Heat'],
    ['Paldean Tauros Aqua Breed', 'Tauros-Paldea-Aqua'],
  ].map(([published, resolved]) => [normalize(published), resolved])
);

function fail(reason, message) {
  const error = new Error(`Poch.ms: ${message}`);
  error.reason = reason;
  throw error;
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sourceData(html) {
  if (typeof html !== 'string') fail('invalid_source', 'HTML must be a string');
  const chunks = [];
  function walk(node) {
    if (
      node.tagName === 'script' &&
      !node.attrs.some((a) => a.name === 'src')
    ) {
      const script = node.childNodes.map((child) => child.value || '').join('');
      if (script.includes('self.__next_f.push')) {
        const match = /^\s*self\.__next_f\.push\((.*)\)\s*;?\s*$/s.exec(script);
        let argument;
        try {
          argument = match && JSON.parse(match[1]);
        } catch {
          fail('invalid_source', 'Malformed Flight push argument');
        }
        if (!Array.isArray(argument) || !Number.isInteger(argument[0]))
          fail('invalid_source', 'Malformed Flight push argument');
        if (argument[0] === 1) {
          if (argument.length !== 2 || typeof argument[1] !== 'string')
            fail('invalid_source', 'Flight type-1 payload must be a string');
          chunks.push(argument[1]);
        }
      }
    }
    for (const child of node.childNodes || []) walk(child);
  }
  walk(parse5.parse(html));
  let container;
  function locate(value) {
    if (!value || typeof value !== 'object') return;
    if (
      object(value) &&
      Object.hasOwn(value, 'entries') &&
      Object.hasOwn(value, 'x')
    ) {
      if (!Array.isArray(value.entries) || !Array.isArray(value.x))
        fail('invalid_source', 'entries and x must both be arrays');
      const next = { entries: value.entries, x: value.x };
      if (container && !isDeepStrictEqual(container, next))
        fail('invalid_source', 'Conflicting data containers');
      container = next;
    }
    for (const child of Object.values(value)) locate(child);
  }
  for (const line of chunks.join('').split('\n')) {
    if (!line.trim()) continue;
    const match = /^[a-f0-9]*:(.*)$/i.exec(line);
    if (!match) fail('invalid_source', 'Malformed Flight record');
    const payload = match[1].trim();
    if (!/^[[{]/.test(payload)) continue;
    let value;
    try {
      value = JSON.parse(payload);
    } catch {
      fail('invalid_source', 'Malformed Flight JSON record');
    }
    locate(value);
  }
  if (!container)
    fail('invalid_source', 'Missing entries and x data container');
  return container;
}

const singleLine = (value) =>
  [...value].every(
    (char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127
  );

function text(value, field, required = false) {
  if (value === undefined || value === null) {
    if (required) fail('invalid_field', `${field} is required`);
    return null;
  }
  if (typeof value !== 'string' || !singleLine(value))
    fail('invalid_field', `${field} must be a single-line string`);
  if (value.trim().startsWith('$'))
    fail('invalid_field', `${field} contains an unresolved Flight reference`);
  if (!value.trim()) {
    if (required) fail('invalid_field', `${field} is required`);
    return null;
  }
  return value;
}

function position(value, field, zeroUnknown = false) {
  if (value === undefined || value === null || (zeroUnknown && value === 0))
    return null;
  if (!Number.isSafeInteger(value) || value <= 0)
    fail('invalid_position', `${field} must be a positive safe integer`);
  return value;
}

function publishedDate(value) {
  const date = text(value, 'date');
  if (!date) return '';
  const day = date.slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(Date.parse(date)) ||
    !Number.isFinite(Date.parse(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day
  )
    fail('invalid_date', 'date must contain a valid published calendar date');
  return day;
}

function postUrl(value) {
  const original = text(value, 'postUrl', true);
  let url;
  try {
    url = new URL(original);
  } catch {
    fail('invalid_url', 'postUrl must be an HTTPS X/Twitter URL');
  }
  if (
    original !== original.trim() ||
    original.includes('\\') ||
    !/^https:\/\//i.test(original) ||
    /^https:\/\/[^/?#]*@/i.test(original) ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    ![
      'x.com',
      'www.x.com',
      'twitter.com',
      'www.twitter.com',
      'mobile.twitter.com',
    ].includes(url.hostname)
  )
    fail(
      'invalid_url',
      'postUrl must be an HTTPS X/Twitter URL without credentials'
    );
  return original;
}

function ordinal(value) {
  if (!value) return '';
  const suffix =
    value % 100 >= 11 && value % 100 <= 13
      ? 'th'
      : { 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] || 'th';
  return `${value}${suffix}`;
}

function membersFrom(rows, tournament, canonicalNames) {
  if (!Array.isArray(rows) || rows.length !== 6)
    fail('invalid_roster', 'Roster must contain exactly six members');
  const members = rows.map((row, index) => {
    if (!object(row))
      fail('invalid_member', `Member ${index + 1} must be an object`);
    let pokemon =
      (tournament && text(row.en, 'member.en')) ||
      text(row.name, 'member.name', true);
    pokemon = publishedAliases[normalize(pokemon)] || pokemon;
    const gender = text(row.gender, 'member.gender');
    if (gender && !['F', 'M'].includes(gender))
      fail('invalid_member', 'member.gender must be F, M, or unknown');
    if (gender === 'F' && battleSpecies(`${pokemon}-F`)) pokemon += '-F';
    const member = {
      pokemon,
      item: text(row.item, 'member.item'),
      ability: text(row.ability, 'member.ability'),
      moves: [],
      nature: text(row.nature, 'member.nature'),
      spread: null,
    };
    if (row.moves !== undefined && row.moves !== null) {
      if (!Array.isArray(row.moves) || row.moves.length > 4)
        fail(
          'invalid_moves',
          'member.moves must be an array of at most four moves'
        );
      member.moves = row.moves.map((move) => text(move, 'member.move', true));
      if (new Set(member.moves.map(normalize)).size !== member.moves.length)
        fail('invalid_moves', 'member.moves contains duplicates');
    }
    const form = resolveBattleForm(member);
    if (form.error) fail('unresolved_species', form.error);
    member.pokemon =
      canonicalNames.get(normalize(form.pokemon)) || form.pokemon;
    member.set = setText(member);
    return member;
  });
  if (new Set(members.map((member) => normalize(member.pokemon))).size !== 6)
    fail('invalid_roster', 'Roster contains duplicate canonical species');
  return members;
}

function catalogTeam(row, tournament, canonicalNames) {
  const publishedAt = publishedDate(row.date);
  const members = membersFrom(
    tournament ? row.team : row.mons,
    tournament,
    canonicalNames
  );
  const reports = [];
  let creator;
  let name;
  let replicaCode = null;
  if (tournament) {
    creator = text(row.player, 'player', true);
    const event = text(row.event, 'event', true);
    const placement = position(row.placement, 'placement', true);
    name = `${creator} — ${event}`;
    reports.push({ event, rank: ordinal(placement), sourceUrl: pochUrl });
  } else {
    const displayName = text(row.displayName, 'displayName');
    const handle = text(row.handle, 'handle');
    creator = displayName || handle;
    if (!creator) fail('invalid_field', 'displayName or handle is required');
    name =
      text(row.teamName, 'teamName') || `${creator} — Champions doubles team`;
    replicaCode = text(row.code, 'code');
    const sourceUrl = postUrl(row.postUrl);
    const event = text(row.event, 'event');
    const place = position(row.place, 'place', true);
    const rank = position(row.rank, 'rank');
    const tier = text(row.tier, 'tier');
    const tierRank = position(row.tierRank, 'tierRank');
    const rating = row.rating;
    if (
      rating !== undefined &&
      rating !== null &&
      (typeof rating !== 'number' || !Number.isFinite(rating) || rating <= 0)
    )
      fail('invalid_rating', 'rating must be a finite positive number');
    if (event) {
      reports.push({ event, rank: ordinal(place || rank), sourceUrl });
    } else {
      if (rank)
        reports.push({
          event: 'Champions ranked battles',
          rank: `Reported #${rank}`,
          sourceUrl,
        });
      if (tier)
        reports.push({
          event: 'Champions ranked battles',
          rank: tier + (tierRank ? ` Rank ${tierRank}` : ''),
          sourceUrl,
        });
      if (rating !== undefined && rating !== null)
        reports.push({
          event: 'Champions ranked battles',
          rank: `${rating} rating`,
          sourceUrl,
        });
      if (!reports.length)
        reports.push({
          event: 'Champions ranked battles',
          rank: '',
          sourceUrl,
        });
    }
  }
  reports.push({ event: 'Poch.ms collection', rank: '', sourceUrl: pochUrl });
  return {
    id: `poch-${tournament ? 'tournament' : 'x'}-${row.id}`,
    sheetIds: [],
    name,
    creator,
    regulation: tournament ? row.format : 'Unknown',
    publishedAt,
    pasteUrl: '',
    replicaCode,
    replicaStatus: '',
    reports,
    members,
    paste: members.some(
      (member) =>
        member.item || member.ability || member.nature || member.moves.length
    )
      ? exportPaste(members)
      : null,
    pasteNotes: null,
  };
}

export function parsePoch(html, canonicalNames = new Map()) {
  const data = sourceData(html);
  const teams = [];
  const skipped = [];
  const seen = new Map();
  let supported = 0;
  let invalidDiscriminators = false;
  for (const [source, rows] of Object.entries(data)) {
    const tournament = source === 'entries';
    for (const row of rows) {
      let admitted = false;
      try {
        if (
          !object(row) ||
          typeof row.id !== 'string' ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(row.id)
        )
          fail(
            'invalid_id',
            'Record id must contain 1–128 ASCII letters, digits, underscores, or hyphens'
          );
        const key = `${source}/${row.id}`;
        if (seen.has(key)) {
          if (!isDeepStrictEqual(seen.get(key), row))
            fail('conflicting_id', `Conflicting records for ${key}`);
          continue;
        }
        seen.set(key, row);
        if (!['single', 'double'].includes(row.rule))
          fail('invalid_rule', 'Record rule must be single or double');
        if (row.rule === 'single') {
          skipped.push({ id: row.id, source, reason: 'unsupported_rule' });
          continue;
        }
        if (tournament) {
          const format = text(row.format, 'format', true);
          if (!['M-A', 'M-B', 'M-C'].includes(format)) {
            skipped.push({ id: row.id, source, reason: 'unsupported_format' });
            continue;
          }
        }
        admitted = true;
        supported++;
        teams.push(catalogTeam(row, tournament, canonicalNames));
      } catch (error) {
        if (error.reason === 'conflicting_id') throw error;
        if (!admitted) invalidDiscriminators = true;
        skipped.push({
          id: row?.id ?? '',
          source,
          reason: error.reason || 'invalid_record',
          message: error.message,
        });
      }
    }
  }
  if (supported && !teams.length)
    fail('invalid_source', 'Every supported doubles record was rejected');
  if (!supported && invalidDiscriminators)
    fail(
      'invalid_source',
      'No supported records and malformed admission discriminators'
    );
  return { teams, skipped };
}
