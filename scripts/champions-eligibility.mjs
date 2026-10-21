import { readFileSync } from 'node:fs';
import { normalize } from '../src/lib/catalog.ts';
import { battleSpecies, resolveBattleForm } from '../src/lib/battle-forms.ts';

const sourceStems = ['m-a', 'm-b', 'm-c'];
const loadedSnapshots = sourceStems.map((stem) => {
  const sourceText = readFileSync(
    new URL(`./data/champions-${stem}.json`, import.meta.url),
    'utf8'
  );
  return { sourceText, snapshot: JSON.parse(sourceText) };
});

export const eligibilitySourceTexts = Object.freeze(
  loadedSnapshots.map(({ sourceText }) => sourceText)
);

const snapshots = new Map();
const rowIdsByRegulation = new Map();

function validateSnapshot({ sourceText, snapshot }) {
  const { regulation, rulesUrl, rosterUrl, pokemon, megas } = snapshot ?? {};
  if (
    !['M-A', 'M-B', 'M-C'].includes(regulation) ||
    snapshots.has(regulation) ||
    typeof rulesUrl !== 'string' ||
    typeof rosterUrl !== 'string' ||
    !pokemon ||
    Array.isArray(pokemon) ||
    typeof pokemon !== 'object' ||
    !Object.keys(pokemon).length ||
    !megas ||
    Array.isArray(megas) ||
    typeof megas !== 'object' ||
    !Object.keys(megas).length ||
    typeof sourceText !== 'string'
  )
    throw new Error(`Invalid Champions eligibility snapshot: ${regulation}`);

  const rowIdsByKey = new Map();
  for (const [officialId, keys] of Object.entries(pokemon)) {
    if (
      !/^\d{4}-\d{3}$/.test(officialId) ||
      !Array.isArray(keys) ||
      !keys.length
    )
      throw new Error(`Invalid ${regulation} Pokémon row: ${officialId}`);
    const uniqueKeys = new Set();
    for (const key of keys) {
      if (
        typeof key !== 'string' ||
        !key ||
        key !== normalize(key) ||
        uniqueKeys.has(key) ||
        !battleSpecies(key)
      )
        throw new Error(`Invalid ${regulation} Pokémon key: ${key}`);
      uniqueKeys.add(key);
      const ids = rowIdsByKey.get(key) ?? new Set();
      ids.add(officialId);
      rowIdsByKey.set(key, ids);
    }
  }

  for (const [key, officialId] of Object.entries(megas)) {
    const species = battleSpecies(key);
    if (
      !key ||
      key !== normalize(key) ||
      !species ||
      !/-Mega(?:-[XYZ])?$/i.test(species.name) ||
      !Object.hasOwn(pokemon, officialId)
    )
      throw new Error(
        `Invalid ${regulation} Mega key or roster reference: ${key}`
      );
  }
  rowIdsByRegulation.set(regulation, rowIdsByKey);
  snapshots.set(regulation, snapshot);
}

for (const loadedSnapshot of loadedSnapshots) validateSnapshot(loadedSnapshot);
if (snapshots.size !== sourceStems.length)
  throw new Error('Champions eligibility snapshots are incomplete.');

function errorForSnapshot(team, snapshot) {
  const { regulation, pokemon, megas } = snapshot;
  const rowIdsByKey = rowIdsByRegulation.get(regulation);

  for (const [index, member] of team.members.entries()) {
    if (!member || typeof member !== 'object' || Array.isArray(member))
      return `Regulation ${regulation}: Pokémon form at slot ${index + 1} is malformed.`;
    const name = member.pokemon;
    if (typeof name !== 'string' || !name.trim())
      return `Regulation ${regulation}: Pokémon form at slot ${index + 1} is missing.`;
    if (
      (member.item != null && typeof member.item !== 'string') ||
      (member.ability != null && typeof member.ability !== 'string')
    )
      return `Regulation ${regulation}: ${name} has malformed battle-form data.`;

    const species = battleSpecies(name);
    if (!species)
      return `Regulation ${regulation}: ${name} is not an eligible Pokémon/form.`;
    const resolved = resolveBattleForm(member);
    if (resolved.error)
      return `Regulation ${regulation}: ${name} has unresolved form ${resolved.pokemon} (${resolved.error}).`;

    if (/-Mega(?:-[XYZ])?$/i.test(species.name)) {
      const megaKey = normalize(species.name);
      const officialId = megas[megaKey];
      if (
        !officialId ||
        !Object.hasOwn(pokemon, officialId) ||
        normalize(resolved.pokemon) !== megaKey
      )
        return `Regulation ${regulation}: Mega form ${species.name} is not permitted.`;
      continue;
    }

    const officialIds = rowIdsByKey.get(normalize(name));
    if (!officialIds)
      return `Regulation ${regulation}: ${name} is not an eligible Pokémon/form.`;
    if (/-Mega(?:-[XYZ])?$/i.test(resolved.pokemon)) {
      const megaKey = normalize(resolved.pokemon);
      if (!officialIds.has(megas[megaKey]))
        return `Regulation ${regulation}: Mega form ${resolved.pokemon} is not permitted for ${name}.`;
    }
  }
  return null;
}

export function teamEligibilityError(team) {
  if (!team || typeof team !== 'object' || Array.isArray(team))
    return 'Regulation missing: team is malformed.';
  if (typeof team.regulation !== 'string' || !team.regulation.trim())
    return 'Regulation missing: regulation is missing or malformed.';
  const regulation = team.regulation;
  if (!Array.isArray(team.members) || team.members.length !== 6)
    return `Regulation ${regulation}: expected exactly six Pokémon.`;

  if (regulation === 'Unknown') {
    for (const snapshot of snapshots.values())
      if (!errorForSnapshot(team, snapshot)) return null;
    const first = errorForSnapshot(team, snapshots.get('M-A'));
    return `Regulation Unknown: no single supported roster admits the whole team; ${first.replace(/^Regulation M-A: /, '')}`;
  }

  const snapshot = snapshots.get(regulation);
  if (!snapshot) {
    const firstName = team.members.find(
      (member) => typeof member?.pokemon === 'string'
    )?.pokemon;
    return `Regulation ${regulation}: unsupported regulation${firstName ? ` for ${firstName}` : ''}.`;
  }
  return errorForSnapshot(team, snapshot);
}

export function rejectIneligibleTeam(source, team, noteReason) {
  const error = teamEligibilityError(team);
  if (!error) return false;
  noteReason('ineligible_species');
  console.warn(
    `${source}: skipped ${team?.name || team?.id || 'unnamed team'} (${error})`
  );
  return true;
}
