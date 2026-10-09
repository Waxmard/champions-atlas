import { schemaVersion, validateExtraction } from './x-vision.mjs';

export const coverageTags = new Set([
  'standard',
  'localized-text',
  'alternate-form',
  'similar-names',
  'explicit-no-item',
  'allocation-companion',
  'other-game',
  'battle-screen',
  'rank-screen',
  'roster-only',
  'code-only',
  'cropped-illegible',
  'ambiguous-multi-team',
  'mismatched-companion',
]);
const statKeys = new Set(['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe']);
const similarNamePairs = [['garchomp', 'gholdengo']];
const hasOwn = (value, key) =>
  Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
const fixtureKeys = ['fixtureVersion', 'coverage', 'coverageGaps', 'records'];
const eligibleTags = [
  'standard',
  'localized-text',
  'alternate-form',
  'similar-names',
  'explicit-no-item',
  'allocation-companion',
];
const specialEligibleTags = eligibleTags.filter((tag) => tag !== 'standard');
const negativeTags = [
  'other-game',
  'battle-screen',
  'rank-screen',
  'roster-only',
  'code-only',
  'cropped-illegible',
  'ambiguous-multi-team',
  'mismatched-companion',
];
const memberKeys = [
  'pokemon',
  'itemState',
  'item',
  'moves4',
  'ability',
  'nature',
  'allocation',
];
const eligibleKeys = [
  'postId',
  'postUrl',
  'split',
  'label',
  'coverage',
  'media',
  'expected',
];
const negativeKeys = [
  'postId',
  'postUrl',
  'split',
  'label',
  'coverage',
  'media',
  'reason',
];
const postHosts = ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'];
const pinnedCalibrationPost = '2107063073731428863';
const wantedSplits = {
  calibration: { eligible: 10, negative: 10 },
  holdout: { eligible: 20, negative: 20 },
};
const singleLine = (value) =>
  [...value].every(
    (char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127
  );
const validText = (value, limit = 100) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= limit &&
  value === value.trim() &&
  singleLine(value) &&
  !['unknown', 'uncertain', 'unreadable', 'n/a', 'tbd', 'placeholder'].includes(
    value.toLowerCase()
  );
const keysAre = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
export const speciesKey = (value) =>
  value.normalize('NFKC').trim().toLocaleLowerCase('en');
export const stable = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && !Array.isArray(item) && typeof item === 'object'
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b))
        )
      : item
  );
const parseUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};
const originalImage = (media) => {
  const imageUrl = parseUrl(media.url);
  const names = imageUrl?.searchParams.getAll('name') ?? [];
  return Boolean(
    imageUrl?.protocol === 'https:' &&
    imageUrl.hostname === 'pbs.twimg.com' &&
    !imageUrl.port &&
    !imageUrl.username &&
    !imageUrl.password &&
    !imageUrl.hash &&
    names.length === 1 &&
    names[0] === 'orig' &&
    /\.(?:jpe?g|png|webp)$/i.test(imageUrl.pathname)
  );
};
const mediaIndexes = (record) =>
  Array.isArray(record.media) ? record.media.map((media) => media.index) : [];
const hasMedia = (record, index) => mediaIndexes(record).includes(index);

export function validateFixture(fixture) {
  const issues = [];
  const issue = (where, message) => issues.push(`${where}: ${message}`);
  const declaredCoverage = new Set(
    Array.isArray(fixture?.coverage) ? fixture.coverage : []
  );
  const coverageCounts = Object.fromEntries(
    [...coverageTags].map((tag) => [tag, 0])
  );
  const splitCounts = {
    calibration: { eligible: 0, negative: 0 },
    holdout: { eligible: 0, negative: 0 },
  };
  const checkMember = (memberWhere, member, record, expected, species) => {
    if (!keysAre(member, memberKeys)) {
      issue(memberWhere, 'member has missing or unknown keys');
      return;
    }
    if (!validText(member.pokemon))
      issue(memberWhere, 'pokemon must be a canonical species/form name');
    const key = speciesKey(member.pokemon ?? '');
    if (species.has(key))
      issue(memberWhere, 'pokemon species/forms must be distinct');
    species.add(key);
    if (!['held', 'none'].includes(member.itemState))
      issue(memberWhere, 'invalid itemState');
    if (member.itemState === 'held' && !validText(member.item))
      issue(memberWhere, 'held item must be visible and named');
    if (member.itemState === 'none' && member.item !== null)
      issue(memberWhere, 'explicit no-item state must have item null');
    if (
      !Array.isArray(member.moves4) ||
      member.moves4.length !== 4 ||
      member.moves4.some((move) => !validText(move))
    )
      issue(memberWhere, 'must transcribe exactly four visible moves');
    else if (new Set(member.moves4.map(speciesKey)).size !== 4)
      issue(memberWhere, 'moves4 must be distinct');
    for (const field of ['ability', 'nature'])
      if (member[field] !== null && !validText(member[field]))
        issue(memberWhere, 'optional field must be null or a visible value');
    if (member.allocation === null) return;
    const allocation = member.allocation;
    if (!keysAre(allocation, ['mediaIndex', 'pokemon', 'teamId', 'points'])) {
      issue(memberWhere, 'allocation has missing or unknown keys');
      return;
    }
    if (
      !hasMedia(record, allocation.mediaIndex) ||
      allocation.mediaIndex === expected.summaryIndex
    )
      issue(
        memberWhere,
        'allocation must reference a distinct companion image'
      );
    if (
      !validText(allocation.pokemon) ||
      speciesKey(allocation.pokemon) !== key
    )
      issue(memberWhere, 'allocation must identify this member');
    if (allocation.teamId !== null && !validText(allocation.teamId, 64))
      issue(memberWhere, 'allocation teamId must be null or a short string');
    if (
      !allocation.points ||
      typeof allocation.points !== 'object' ||
      Array.isArray(allocation.points)
    ) {
      issue(memberWhere, 'allocation points must be a partial stat object');
      return;
    }
    let total = 0;
    for (const [stat, points] of Object.entries(allocation.points)) {
      if (!statKeys.has(stat))
        issue(memberWhere, `unknown allocation stat ${stat}`);
      if (!Number.isInteger(points) || points < 0 || points > 32)
        issue(memberWhere, `allocation ${stat} must be an integer 0-32`);
      total += points;
    }
    if (!Object.keys(allocation.points).length || total > 66)
      issue(
        memberWhere,
        'allocation needs visible points totalling at most 66'
      );
  };

  const expectedFixtureKeys = hasOwn(fixture, 'coverageGaps')
    ? fixtureKeys
    : fixtureKeys.filter((key) => key !== 'coverageGaps');
  if (!keysAre(fixture, expectedFixtureKeys))
    issue(
      'fixture',
      'expected only fixtureVersion, coverage, coverageGaps, and records'
    );
  if (fixture?.fixtureVersion !== 1)
    issue('fixture', 'unsupported or missing fixtureVersion 1');
  if (!Array.isArray(fixture?.coverage)) issue('coverage', 'must be an array');
  if (declaredCoverage.size !== (fixture?.coverage?.length ?? 0))
    issue('coverage', 'tags must be unique');
  for (const tag of declaredCoverage)
    if (!coverageTags.has(tag))
      issue('coverage', `unknown category ${String(tag)}`);
  if (hasOwn(fixture, 'coverageGaps') && !Array.isArray(fixture.coverageGaps))
    issue('coverageGaps', 'must be an array');
  const gapTags = new Set();
  for (const [index, gap] of (Array.isArray(fixture?.coverageGaps)
    ? fixture.coverageGaps
    : []
  ).entries()) {
    const where = `coverageGaps[${index}]`;
    if (!keysAre(gap, ['tag', 'reason'])) {
      issue(where, 'expected only tag and reason');
      continue;
    }
    if (!coverageTags.has(gap.tag))
      issue(where, `unknown category ${String(gap.tag)}`);
    if (gapTags.has(gap.tag))
      issue(where, `duplicate category ${String(gap.tag)}`);
    gapTags.add(gap.tag);
    if (!validText(gap.reason, 300))
      issue(where, 'needs a short documented reason');
  }
  if (!Array.isArray(fixture?.records)) {
    issue('records', 'must be an array');
    return issues;
  }
  if (fixture.records.length !== 60)
    issue('records', `expected 60 records, found ${fixture.records.length}`);
  const ids = new Set();
  for (const [index, record] of fixture.records.entries()) {
    const where = `records[${index}]`;
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      issue(where, 'must be an object');
      continue;
    }
    if (record.label === 'eligible') {
      if (!keysAre(record, eligibleKeys))
        issue(where, 'eligible record has missing or unknown keys');
    } else if (record.label === 'negative') {
      if (!keysAre(record, negativeKeys))
        issue(where, 'negative record has missing or unknown keys');
      if (!validText(record.reason, 300))
        issue(where, 'negative record needs a visual rejection reason');
    } else {
      issue(where, 'label must be eligible or negative');
      continue;
    }
    if (!/^\d{15,20}$/.test(record.postId ?? ''))
      issue(where, 'postId is invalid');
    if (ids.has(record.postId))
      issue(where, `duplicate postId ${record.postId}`);
    ids.add(record.postId);
    if (!['calibration', 'holdout'].includes(record.split))
      issue(where, 'invalid split');
    else splitCounts[record.split][record.label]++;
    if (
      record.postId === pinnedCalibrationPost &&
      record.split !== 'calibration'
    )
      issue(where, `post ${pinnedCalibrationPost} must be in calibration`);
    const postUrl = parseUrl(record.postUrl);
    const segments = postUrl?.pathname.split('/') ?? [];
    if (
      !postUrl ||
      !postHosts.includes(postUrl.hostname) ||
      segments[segments.indexOf('status') + 1] !== record.postId
    )
      issue(where, 'postUrl must be the source post for postId');
    if (!Array.isArray(record.coverage) || record.coverage.length === 0)
      issue(where, 'needs at least one visual coverage tag');
    const recordCoverage = Array.isArray(record.coverage)
      ? record.coverage
      : [];
    if (new Set(recordCoverage).size !== recordCoverage.length)
      issue(where, 'coverage tags must be unique');
    for (const tag of recordCoverage) {
      if (!declaredCoverage.has(tag))
        issue(where, `coverage tag ${String(tag)} is not declared`);
      if (coverageCounts[tag] !== undefined) coverageCounts[tag]++;
      if (eligibleTags.includes(tag) && record.label !== 'eligible')
        issue(where, tag + ' requires an eligible visual summary');
      if (negativeTags.includes(tag) && record.label !== 'negative')
        issue(where, tag + ' requires a negative visual label');
    }
    if (
      !Array.isArray(record.media) ||
      record.media.length < 1 ||
      record.media.length > 4
    ) {
      issue(where, 'must reference one to four original photos');
    } else {
      const indices = new Set();
      for (const [mediaIndex, media] of record.media.entries()) {
        const mediaWhere = `${where}.media[${mediaIndex}]`;
        if (!keysAre(media, ['index', 'url', 'sha256'])) {
          issue(mediaWhere, 'expected only index, url, and sha256');
          continue;
        }
        if (
          !Number.isInteger(media.index) ||
          media.index < 0 ||
          media.index >= 4 ||
          indices.has(media.index)
        )
          issue(mediaWhere, 'index must be a unique non-negative integer');
        indices.add(media.index);
        if (!originalImage(media))
          issue(mediaWhere, 'url must be an original pbs.twimg.com image');
        if (!/^[a-f\d]{64}$/i.test(media.sha256 ?? ''))
          issue(mediaWhere, 'sha256 must be a full SHA-256 digest');
      }
      if (
        [...indices]
          .sort((a, b) => a - b)
          .some((value, position) => value !== position)
      )
        issue(where, 'media indexes must be contiguous and start at zero');
    }
    if (record.label !== 'eligible') continue;
    const expected = record.expected;
    if (!keysAre(expected, ['summaryIndex', 'teamId', 'members'])) {
      issue(`${where}.expected`, 'expected only summaryIndex, teamId, members');
      continue;
    }
    if (
      !Number.isInteger(expected.summaryIndex) ||
      !hasMedia(record, expected.summaryIndex)
    )
      issue(where + '.expected', 'summaryIndex must reference a source image');
    if (expected.teamId !== null && !validText(expected.teamId, 64))
      issue(
        where + '.expected',
        'teamId must be null or a short source string'
      );
    if (!Array.isArray(expected.members) || expected.members.length !== 6) {
      issue(`${where}.expected`, 'must contain exactly six members');
      continue;
    }
    const species = new Set();
    for (const [memberIndex, member] of expected.members.entries())
      checkMember(
        `${where}.expected.members[${memberIndex}]`,
        member,
        record,
        expected,
        species
      );
    try {
      const canonical = validateExtraction(
        { schemaVersion, ...expected },
        Array.isArray(record.media) ? record.media.length : 0
      );
      if (stable(canonical) !== stable({ schemaVersion, ...expected }))
        issue(where + '.expected', 'gold labels must use canonical values');
    } catch {
      issue(
        where + '.expected',
        'gold labels fail extraction schema or dictionary validation'
      );
    }
    const hasNoItem = expected.members.some(
      (member) => member.itemState === 'none'
    );
    if (recordCoverage.includes('explicit-no-item') !== hasNoItem)
      issue(where, 'explicit-no-item coverage must match a visible no-item');
    const hasAllocation = expected.members.some(
      (member) => member.allocation !== null
    );
    if (recordCoverage.includes('allocation-companion') !== hasAllocation)
      issue(where, 'allocation-companion must match transcribed allocations');
    const hasForm = expected.members.some(
      (member) =>
        typeof member.pokemon === 'string' && member.pokemon.includes('-')
    );
    if (recordCoverage.includes('alternate-form') !== hasForm)
      issue(where, 'alternate-form coverage must match a species/form label');
    const isSpecial = specialEligibleTags.some((tag) =>
      recordCoverage.includes(tag)
    );
    if (recordCoverage.includes('standard') === isSpecial)
      issue(where, 'standard coverage marks only plain eligible summaries');
    const speciesNames = new Set(
      expected.members.map((member) => speciesKey(member.pokemon))
    );
    const hasSimilarNames = similarNamePairs.some((pair) =>
      pair.every((name) => speciesNames.has(name))
    );
    if (recordCoverage.includes('similar-names') !== hasSimilarNames)
      issue(where, 'similar-names coverage must match a confusable pair');
  }
  for (const [tag, count] of Object.entries(coverageCounts)) {
    if (count) {
      if (gapTags.has(tag))
        issue('coverageGaps', `${tag} is demonstrated and cannot be a gap`);
      if (!declaredCoverage.has(tag))
        issue('coverage', `${tag} is used by records but not declared`);
      continue;
    }
    if (!gapTags.has(tag)) issue('coverage', `no record demonstrates ${tag}`);
  }
  for (const [split, wanted] of Object.entries(wantedSplits))
    for (const label of ['eligible', 'negative'])
      if (splitCounts[split][label] !== wanted[label])
        issue(
          'records',
          `${split} needs ${wanted[label]} ${label} records, found ${splitCounts[split][label]}`
        );
  return issues;
}
