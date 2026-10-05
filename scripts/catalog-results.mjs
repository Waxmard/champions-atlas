const ladderEvent = 'Champions ranked battles';

const numericAnnotations = [
  [
    /^(?:Global rank|Champions global rank|Champions rank)\s*:?\s*#?(\d+)(?:st|nd|rd|th)?$/i,
    ladderEvent,
    (position) => `Reported #${position}`,
  ],
  [
    /^Peak rank\s*:?\s*#?(\d+)(?:st|nd|rd|th)?$/i,
    ladderEvent,
    (position) => `Peak #${position}`,
  ],
  [
    /^Season finish\s*:?\s*#?(\d+)(?:st|nd|rd|th)?$/i,
    ladderEvent,
    (position) => `Season finish #${position}`,
  ],
  [
    /^Showdown peak\s*:?\s*#?(\d+)(?:st|nd|rd|th)?$/i,
    'Showdown ladder',
    (position) => `Peak #${position}`,
  ],
];

function positiveSafeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function parseAnnotation(note) {
  const line = note
    .trim()
    .replace(/\p{P}+$/u, '')
    .trim();
  const tier = /^(?:Achieved|Reached)\s+(Champion|Champions)\s+Tier$/i.exec(
    line
  );
  if (tier)
    return {
      event: ladderEvent,
      rank: `${tier[1].toLowerCase() === 'champions' ? 'Champions' : 'Champion'} Tier`,
    };

  const rank =
    /^(Achieved|Reached)\s+Rank\s*:?\s*#?(\d+)(?:st|nd|rd|th)?$/i.exec(line);
  if (rank) {
    const position = positiveSafeInteger(rank[2]);
    if (position === 1 || position === 2)
      return { event: ladderEvent, rank: `Rank ${position}` };
  }

  if (/^(?:Reached|Achieved)\s+Master Ball$/i.test(line))
    return { event: ladderEvent, rank: 'Master Ball' };

  for (const [pattern, event, label] of numericAnnotations) {
    const match = pattern.exec(line);
    if (match) {
      const position = positiveSafeInteger(match[1]);
      return position ? { event, rank: label(position) } : null;
    }
  }
  return null;
}

const tupleKey = ({ event, rank, sourceUrl }) =>
  JSON.stringify([event, rank, sourceUrl]);

export function reportsWithLadderNotes(reports, notes, sourceUrl) {
  if (!Array.isArray(reports)) throw new TypeError('Reports must be an array');
  if (notes !== undefined && notes !== null && typeof notes !== 'string')
    throw new TypeError('Paste notes must be a string');

  const result = [...reports];
  const seen = new Set(reports.map(tupleKey));
  if (notes === undefined || notes === null) return result;

  for (const line of notes.split(/\r\n?|\n/)) {
    const parsed = parseAnnotation(line);
    if (!parsed) continue;
    const report = { ...parsed, sourceUrl };
    const key = tupleKey(report);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(report);
  }
  return result;
}
