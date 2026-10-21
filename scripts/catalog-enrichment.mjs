import { isPasteUrl, normalize } from '../src/lib/catalog.ts';
import { cosmeticForms, resolveBattleForm } from '../src/lib/battle-forms.ts';
import {
  CHAMPIONS_STATS,
  isCompleteSpread,
  NATURES,
  normalizeSet,
  normalizeSpread,
  parseChampionsSpread,
  parseSetBlock,
  updateSetText,
} from '../src/lib/paste.ts';
import {
  activeSpreadSource,
  memberSetSignature,
  spreadSourceSchema,
} from '../src/lib/spread-provenance.ts';
import { pasteLinks } from './youtube-source.mjs';

const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const originalLabel =
  /\b(?:original\s+(?:team|paste)|tournament\s+team|open\s+team\s+sheet)\b/i;
const donorLabel =
  /\b(?:my\s+version|my\s+team\s+with\s+evs|team\s+with\s+evs)\b/i;

const compareText = (left, right) =>
  left === right ? 0 : left < right ? -1 : 1;

export function linkedSpreadPairs(candidates) {
  const videos = new Map();
  for (const candidate of candidates) {
    const video = candidate?.video;
    if (
      !video ||
      typeof video.id !== 'string' ||
      !videoIdPattern.test(video.id) ||
      typeof video.description !== 'string'
    )
      continue;

    let record = videos.get(video.id);
    if (!record) {
      record = {
        description: video.description,
        pasteUrls: new Set(),
        valid: true,
      };
      videos.set(video.id, record);
    } else if (record.description !== video.description) {
      record.valid = false;
    }
    if (typeof candidate.pasteUrl === 'string')
      record.pasteUrls.add(candidate.pasteUrl);
  }

  const pairs = new Map();
  for (const [id, record] of videos) {
    if (!record.valid) continue;
    const originals = new Set();
    const donors = new Set();
    for (const paragraph of record.description.split(/\r?\n\s*\r?\n/)) {
      const isOriginal = originalLabel.test(paragraph);
      const isDonor = donorLabel.test(paragraph);
      if (!isOriginal && !isDonor) continue;
      const urls = pasteLinks(paragraph);
      if (urls.length !== 1 || !record.pasteUrls.has(urls[0])) {
        record.valid = false;
        break;
      }
      if (isOriginal) originals.add(urls[0]);
      if (isDonor) donors.add(urls[0]);
    }
    if (!record.valid) continue;
    if (originals.size !== 1 || donors.size !== 1) continue;
    const [originalPasteUrl] = originals;
    const [donorPasteUrl] = donors;
    if (originalPasteUrl === donorPasteUrl) continue;
    const row = {
      originalPasteUrl,
      donorPasteUrl,
      videoUrl: `https://www.youtube.com/watch?v=${id}`,
    };
    pairs.set(JSON.stringify(row), row);
  }

  return [...pairs.values()].sort(
    (left, right) =>
      compareText(left.originalPasteUrl, right.originalPasteUrl) ||
      compareText(left.donorPasteUrl, right.donorPasteUrl) ||
      compareText(left.videoUrl, right.videoUrl)
  );
}

const supportedRegulations = new Set(['M-A', 'M-B', 'M-C']);
const watchUrlPattern =
  /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/;
const textValue = (value) =>
  typeof value === 'string' ? normalize(value) : '';
const missing = (value) => typeof value !== 'string' || !value.trim();
const natureValue = (value) =>
  NATURES.find((nature) => normalize(nature) === textValue(value)) ?? null;

function formKey(member) {
  if (!member || typeof member.pokemon !== 'string') return null;
  const result = resolveBattleForm(member);
  if (result.error) return null;
  const name = normalize(result.pokemon);
  return normalize(cosmeticForms[name] ?? name) || null;
}

function rosterFor(team, cache) {
  if (!team || typeof team !== 'object') return null;
  if (cache.has(team)) return cache.get(team);
  let roster = null;
  if (Array.isArray(team.members) && team.members.length === 6) {
    roster = new Map();
    for (const member of team.members) {
      const form = formKey(member);
      if (!form || roster.has(form)) {
        roster = null;
        break;
      }
      roster.set(form, member);
    }
  }
  cache.set(team, roster);
  return roster;
}

function normalizedMoves(member) {
  return Array.isArray(member.moves)
    ? member.moves.map(textValue).filter(Boolean)
    : [];
}

function completeMoves(member) {
  const moves = normalizedMoves(member);
  return moves.length === 4 && new Set(moves).size === 4 ? moves : null;
}

function matchesKnownFields(original, donor) {
  for (const field of ['item', 'ability']) {
    const value = textValue(original[field]);
    if (value && textValue(donor[field]) !== value) return false;
  }
  const originalNature = textValue(original.nature);
  if (originalNature) {
    const expected = natureValue(original.nature);
    const actual = natureValue(donor.nature);
    if (!expected || !actual || normalize(expected) !== normalize(actual))
      return false;
  }
  const originalMoves = normalizedMoves(original);
  const donorMoves = normalizedMoves(donor);
  if (
    originalMoves.some((move) => !donorMoves.includes(move)) ||
    (originalMoves.length === 4 &&
      (donorMoves.length !== 4 || new Set(donorMoves).size !== 4))
  )
    return false;
  return true;
}

function compatibleTeams(original, donor, cache) {
  if (
    !supportedRegulations.has(original.regulation) ||
    original.regulation !== donor.regulation ||
    donor.pasteError
  )
    return false;
  const originalRoster = rosterFor(original, cache);
  const donorRoster = rosterFor(donor, cache);
  if (!originalRoster || !donorRoster) return false;
  for (const [form, originalMember] of originalRoster) {
    const donorMember = donorRoster.get(form);
    if (!donorMember || !matchesKnownFields(originalMember, donorMember))
      return false;
  }
  return true;
}

function rawSpreadMap(team, cache) {
  if (typeof team.paste !== 'string') return null;
  if (cache.has(team)) return cache.get(team);
  const spreads = new Map();
  for (const block of team.paste.split(/\r?\n\s*\r?\n/)) {
    let member;
    try {
      member = parseSetBlock(block);
    } catch {
      continue;
    }
    const form = formKey(member);
    if (!form) continue;
    const line = block
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => /^EVs\s*:/i.test(entry));
    const spread = line ? line.slice(line.indexOf(':') + 1).trim() : null;
    if (spreads.has(form)) spreads.set(form, { valid: false, spread: null });
    else spreads.set(form, { valid: true, spread });
  }
  cache.set(team, spreads);
  return spreads;
}

function rawSpreadFor(team, member, cache) {
  if (typeof team.paste !== 'string')
    return { valid: true, spread: member.spread };
  const spread = rawSpreadMap(team, cache)?.get(formKey(member));
  return spread ?? { valid: false, spread: null };
}

function memberSetText(member) {
  const set =
    typeof member.set === 'string' && member.set.trim()
      ? member.set
      : updateSetText(member, member);
  return normalizeSet(set);
}

function proposalFor(
  pair,
  original,
  originalMember,
  donor,
  donorMember,
  cache
) {
  if (
    !missing(originalMember.spread) ||
    missing(textValue(originalMember.item)) ||
    missing(textValue(donorMember.item)) ||
    textValue(originalMember.item) !== textValue(donorMember.item) ||
    missing(textValue(originalMember.ability)) ||
    missing(textValue(donorMember.ability)) ||
    textValue(originalMember.ability) !== textValue(donorMember.ability)
  )
    return null;
  const originalMoves = completeMoves(originalMember);
  const donorMoves = completeMoves(donorMember);
  if (
    !originalMoves ||
    !donorMoves ||
    originalMoves.some((move) => !donorMoves.includes(move))
  )
    return null;

  const donorNature = natureValue(donorMember.nature);
  if (!donorNature) return null;
  const originalNature = natureValue(originalMember.nature);
  const borrowedNature = missing(originalMember.nature);
  if (!borrowedNature && (!originalNature || originalNature !== donorNature))
    return null;

  const originalSpread = rawSpreadFor(original, originalMember, cache);
  if (!originalSpread.valid || !missing(originalSpread.spread)) return null;
  const donorSpread = rawSpreadFor(donor, donorMember, cache);
  if (!donorSpread.valid) return null;
  const spread = parseChampionsSpread(donorSpread.spread);
  if (!isCompleteSpread(spread)) return null;
  const spreadText = normalizeSpread(donorSpread.spread);
  if (!spreadText) return null;

  const values = CHAMPIONS_STATS.map((stat) => spread[stat]);
  const sourceSet = memberSetText(donorMember);
  const originalSet = memberSetText(originalMember);
  if (!sourceSet || !originalSet) return null;
  return {
    donorPasteUrl: donor.pasteUrl,
    videoUrl: pair.videoUrl,
    values,
    nature: donorNature,
    borrowedNature,
    spreadText,
    sourceSet,
    originalSet,
    valueKey: JSON.stringify([values, normalize(donorNature)]),
  };
}

function restoreMember(member) {
  const source = spreadSourceSchema.safeParse(member.spreadSource);
  if (!source.success) return member;
  const withoutSource = { ...member };
  delete withoutSource.spreadSource;
  let original;
  try {
    original = parseSetBlock(source.data.originalSet);
  } catch {
    return {
      ...withoutSource,
      spread: null,
      ...(source.data.borrowedNature ? { nature: null } : {}),
      set: source.data.originalSet,
    };
  }
  const restored = {
    ...withoutSource,
    pokemon: member.pokemon,
    item: original.item,
    ability: original.ability,
    moves: original.moves,
    nature: original.nature,
    spread: original.spread,
  };
  return {
    ...restored,
    set: updateSetText(original, { ...original, pokemon: member.pokemon }),
  };
}

export function resetLinkedSpreads(teams) {
  return teams.map((team) => {
    let changed = false;
    const members = team.members.map((member) => {
      const restored = restoreMember(member);
      if (restored !== member) changed = true;
      return restored;
    });
    return changed ? { ...team, members } : team;
  });
}

function retainInactiveSpreads(teams, previousTeams, cache) {
  const previousById = new Map(previousTeams.map((team) => [team.id, team]));
  let enriched = 0;
  const retained = teams.map((team) => {
    const previous = previousById.get(team.id);
    if (
      !previous ||
      previous.pasteUrl !== team.pasteUrl ||
      previous.regulation !== team.regulation
    )
      return team;
    const oldRoster = rosterFor(previous, cache);
    const currentRoster = rosterFor(team, cache);
    if (!oldRoster || !currentRoster) return team;
    let changed = false;
    const members = team.members.map((member) => {
      const oldMember = oldRoster.get(formKey(member));
      const source = oldMember && activeSpreadSource(oldMember);
      if (!source || memberSetText(member) !== normalizeSet(source.originalSet))
        return member;
      const fields = {
        ...member,
        spread: oldMember.spread,
        nature: source.borrowedNature ? oldMember.nature : member.nature,
      };
      const spreadSource = {
        ...source,
        originalSet: memberSetText(member),
      };
      const next = {
        ...fields,
        set: updateSetText(member, fields),
        spreadSource: { ...spreadSource, appliedSignature: '' },
      };
      const signature = memberSetSignature(next);
      if (!signature) return member;
      next.spreadSource.appliedSignature = signature;
      if (!activeSpreadSource(next)) return member;
      changed = true;
      enriched++;
      return next;
    });
    return changed ? { ...team, members } : team;
  });
  return { teams: retained, enriched };
}

export function enrichLinkedSpreads(
  teams,
  pairs,
  { active = true, previousTeams = [] } = {}
) {
  const rosterCache = new WeakMap();
  const rawSpreadCache = new WeakMap();
  const originals = resetLinkedSpreads(teams);
  if (!active) {
    const retained = retainInactiveSpreads(
      originals,
      previousTeams.length ? previousTeams : teams,
      rosterCache
    );
    return {
      teams: retained.teams,
      enriched: retained.enriched,
      spread_conflict: 0,
    };
  }

  const byPasteUrl = new Map();
  for (const team of originals) {
    if (
      !isPasteUrl(team.pasteUrl) ||
      !supportedRegulations.has(team.regulation)
    )
      continue;
    const bucket = byPasteUrl.get(team.pasteUrl) ?? [];
    bucket.push(team);
    byPasteUrl.set(team.pasteUrl, bucket);
  }

  const proposals = new Map();
  for (const pair of pairs) {
    if (
      !isPasteUrl(pair.originalPasteUrl) ||
      !isPasteUrl(pair.donorPasteUrl) ||
      !watchUrlPattern.test(pair.videoUrl)
    )
      continue;
    for (const original of byPasteUrl.get(pair.originalPasteUrl) ?? []) {
      const originalRoster = rosterFor(original, rosterCache);
      if (!originalRoster) continue;
      for (const donor of byPasteUrl.get(pair.donorPasteUrl) ?? []) {
        if (!compatibleTeams(original, donor, rosterCache)) continue;
        const donorRoster = rosterFor(donor, rosterCache);
        for (const [form, originalMember] of originalRoster) {
          const donorMember = donorRoster.get(form);
          const proposal =
            donorMember &&
            proposalFor(
              pair,
              original,
              originalMember,
              donor,
              donorMember,
              rawSpreadCache
            );
          if (!proposal) continue;
          const byMember = proposals.get(original) ?? new Map();
          const entries = byMember.get(form) ?? [];
          entries.push(proposal);
          byMember.set(form, entries);
          proposals.set(original, byMember);
        }
      }
    }
  }

  let enriched = 0;
  let spread_conflict = 0;
  const compareProposal = (left, right) =>
    compareText(left.donorPasteUrl, right.donorPasteUrl) ||
    compareText(left.sourceSet, right.sourceSet) ||
    compareText(left.videoUrl, right.videoUrl);
  const enrichedTeams = originals.map((team) => {
    const byMember = proposals.get(team);
    if (!byMember) return team;
    let changed = false;
    const members = team.members.map((member) => {
      const entries = byMember.get(formKey(member));
      if (!entries?.length) return member;
      const values = new Set(entries.map((entry) => entry.valueKey));
      if (values.size !== 1) {
        spread_conflict++;
        return member;
      }
      const ordered = entries.slice().sort(compareProposal);
      const chosen = ordered[0];
      const videoUrls = [
        ...new Set(
          entries
            .filter(
              (entry) =>
                entry.donorPasteUrl === chosen.donorPasteUrl &&
                entry.valueKey === chosen.valueKey
            )
            .map((entry) => entry.videoUrl)
        ),
      ].sort(compareText);
      const fields = {
        ...member,
        spread: chosen.spreadText,
        nature: chosen.borrowedNature ? chosen.nature : member.nature,
      };
      const set = updateSetText(member, fields);
      const applied = { ...fields, set };
      const appliedSignature = memberSetSignature(applied);
      if (!appliedSignature || !videoUrls.length) return member;
      const spreadSource = {
        pasteUrl: chosen.donorPasteUrl,
        videoUrls,
        sourceSet: chosen.sourceSet,
        originalSet: chosen.originalSet,
        appliedSignature,
        borrowedNature: chosen.borrowedNature,
      };
      const next = { ...applied, spreadSource };
      if (!activeSpreadSource(next)) return member;
      changed = true;
      enriched++;
      return next;
    });
    return changed ? { ...team, members } : team;
  });
  return { teams: enrichedTeams, enriched, spread_conflict };
}
