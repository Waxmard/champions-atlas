import { isPasteUrl, normalize } from '../src/lib/catalog.ts';
import { championRegulation } from './catalog-payloads.mjs';

const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;

const regulationWindows = [
  {
    start: Date.parse('2026-04-08T00:00:00Z'),
    end: Date.parse('2026-06-17T02:00:00Z'),
    regulation: 'M-A',
  },
  {
    start: Date.parse('2026-06-17T02:00:00Z'),
    end: Date.parse('2026-09-09T02:00:00Z'),
    regulation: 'M-B',
  },
  {
    start: Date.parse('2026-09-09T02:00:00Z'),
    end: Date.parse('2026-12-02T00:00:00Z'),
    regulation: 'M-C',
  },
];
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

export function regulationFromVideoDate(publishedAt) {
  const match =
    typeof publishedAt === 'string' && timestampPattern.exec(publishedAt);
  if (!match || !Number.isFinite(Date.parse(publishedAt))) return null;
  const [, hours, minutes, seconds, offsetHours, offsetMinutes] = match;
  if (
    Number(hours) > 23 ||
    Number(minutes) > 59 ||
    Number(seconds) > 59 ||
    (offsetHours !== undefined &&
      (Number(offsetHours) > 23 || Number(offsetMinutes) > 59))
  )
    return null;
  const day = publishedAt.slice(0, 10);
  if (new Date(day).toISOString().slice(0, 10) !== day) return null;
  const timestamp = Date.parse(publishedAt);
  return (
    regulationWindows.find(
      ({ start, end }) => timestamp >= start && timestamp < end
    )?.regulation ?? null
  );
}

function regulationTokens(text) {
  return [
    ...text.matchAll(
      /\breg(?:ulation)?(?:\s+set)?\s+m(?:(?:\s*[-‐‑‒–—]\s*)|\s+)?([a-z])\b/gi
    ),
  ].map(([, letter]) => `M-${letter.toUpperCase()}`);
}
const fail = (message) => new Error(`YouTube source: ${message}`);
const admissionError = (reason, detail = '') =>
  Object.assign(
    fail(`Candidate rejected (${reason}${detail ? `: ${detail}` : ''}).`),
    { reason }
  );

function formatDeclarations(text) {
  return typeof text === 'string'
    ? text.split(/\r?\n/).flatMap((line) => {
        const match = /^\s*Format\s*:\s*(.*?)\s*$/i.exec(line);
        return match ? [match[1]] : [];
      })
    : [];
}

function formatLabel(format) {
  const normalized = normalize(format).slice(0, 80);
  return normalized || 'unrecognized';
}

function unsupportedFormat(format) {
  const normalized = normalize(format);
  const generation = /gen(\d+)/.exec(normalized)?.[1];
  return (
    /singles?/.test(normalized) ||
    /\bou\b/i.test(format) ||
    /ou(?:\d{4})?reg/.test(normalized) ||
    /overused|nationaldex|natdex/.test(normalized) ||
    (generation !== undefined && generation !== '9') ||
    /\bsv\b/i.test(format) ||
    /^(?:sv|sm|swsh|bdsp|oras|xy|bw|dpp|rby|gsc)(?:vgc|ou|doubles?)/.test(
      normalized
    ) ||
    /scarlet|violet|sword|shield|prechampions/.test(normalized) ||
    /sunandmoon|ultrasun|ultramoon|brilliantdiamond|shiningpearl|legendsarceus|legendsza/.test(
      normalized
    )
  );
}

function unsupportedTitleFormat(title) {
  const normalized = normalize(title);
  if (/\bsingles\b|\bsingle\s+battles?\b/i.test(title)) return 'singles';
  const compactOu = /\bgen\d+ou(?=reg|\b)/i.exec(title)?.[0];
  if (compactOu) return normalize(compactOu);
  if (/\bou\b/i.test(title) || /ou(?:\d{4})?reg/.test(normalized)) return 'ou';
  if (/\boverused\b/i.test(title)) return 'overused';
  if (/\bnational\s*dex\b|\bnatdex\b/i.test(title)) return 'nationaldex';
  if (/\bpre[- ]?champions\b/i.test(title)) return 'prechampions';
  const generation =
    /\bgen(?:eration)?\s*([1-8])\b/i.exec(title)?.[1] ??
    /^gen([1-8])(?:vgc|ou|doubles?)/.exec(normalized)?.[1];
  if (generation) return `gen${generation}`;
  const gameFormat =
    /\b(sv|sm|swsh|bdsp|oras|xy|bw|dpp|rby|gsc)\s*(?=vgc|ou|doubles?)/i.exec(
      title
    )?.[1] ??
    /^(sv|sm|swsh|bdsp|oras|xy|bw|dpp|rby|gsc)(?=vgc|ou|doubles?)/.exec(
      normalized
    )?.[1];
  if (gameFormat) return gameFormat.toLowerCase();
  if (/\b(?:pok[eé]mon\s+)?scarlet\s*(?:and|&|\/)\s*violet\b/i.test(title))
    return 'scarlet-violet';
  if (/\b(?:pok[eé]mon\s+)?sword\s*(?:and|&|\/)\s*shield\b/i.test(title))
    return 'sword-shield';
  if (
    /\b(?:pok[eé]mon\s+)?(?:ultra\s+)?sun\s*(?:and|&|\/)\s*(?:ultra\s+)?moon\b/i.test(
      title
    )
  )
    return /\bultra\b/i.test(title) ? 'ultra-sun-moon' : 'sun-and-moon';
  if (/\bbrilliant\s+diamond\b/i.test(title)) return 'brilliant-diamond';
  if (/\bshining\s+pearl\b/i.test(title)) return 'shining-pearl';
  if (/\blegends\s*:?\s*arceus\b/i.test(title)) return 'legends-arceus';
  if (/\blegends\s*:?\s*z[- ]?a\b/i.test(title)) return 'legends-za';
  return null;
}

function championsEvidence(value) {
  return (
    /\bchampions\b/i.test(value) ||
    /champions(?:\d{4})?(?:vgc|doubles?)/.test(normalize(value))
  );
}

function doublesEvidence(value) {
  return /\bvgc\b|\bdoubles\b|\bdouble\s+battles?\b/i.test(value);
}

function declaredDoublesEvidence(format) {
  const normalized = normalize(format);
  return normalized.includes('vgc') || normalized.includes('double');
}

export function youtubeCandidate(discoveryCandidate, payload) {
  const video = discoveryCandidate?.video;
  if (
    !object(discoveryCandidate) ||
    !object(video) ||
    !object(payload) ||
    typeof discoveryCandidate.sourceName !== 'string' ||
    typeof discoveryCandidate.indexUrl !== 'string' ||
    !isPasteUrl(discoveryCandidate.pasteUrl) ||
    typeof video.id !== 'string' ||
    !videoIdPattern.test(video.id) ||
    typeof video.title !== 'string' ||
    typeof video.description !== 'string'
  )
    throw admissionError('invalid_payload');
  if (payload.notes != null && typeof payload.notes !== 'string')
    throw admissionError('invalid_payload');
  const formats = [
    ...formatDeclarations(payload.notes),
    ...formatDeclarations(video.description),
  ];
  if (
    payload.provider === 'victory-road' &&
    payload.format != null &&
    payload.format !== ''
  ) {
    if (typeof payload.format !== 'string')
      throw admissionError('invalid_payload');
    formats.push(payload.format);
  }
  for (const format of formats)
    if (unsupportedFormat(format))
      throw admissionError('unsupported_format', formatLabel(format));
  const formatRegulations = formats.map((format) => {
    const regulation = championRegulation(format);
    if (!regulation || !['ma', 'mb', 'mc'].includes(regulation))
      throw admissionError('unsupported_format', formatLabel(format));
    return `M-${regulation.slice(-1).toUpperCase()}`;
  });
  const textRegulations = [video.title, video.description].flatMap(
    regulationTokens
  );
  for (const regulation of textRegulations)
    if (!['M-A', 'M-B', 'M-C'].includes(regulation))
      throw admissionError('unsupported_format', regulation);
  const regulations = [...formatRegulations, ...textRegulations];
  if (new Set(regulations).size > 1)
    throw admissionError(
      'format_conflict',
      [...new Set(regulations)].join(', ')
    );
  const unsupportedTitle = unsupportedTitleFormat(video.title);
  if (unsupportedTitle)
    throw admissionError('unsupported_format', unsupportedTitle);
  const context = [
    ...(regulations.length ? formats : []),
    video.title,
    video.description,
  ];
  if (
    !context.some(championsEvidence) ||
    !(context.some(doublesEvidence) || formats.some(declaredDoublesEvidence))
  )
    throw admissionError(
      'unsupported_format',
      'missing Champions doubles evidence'
    );
  const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;
  let regulation = regulations[0];
  let regulationInference;
  if (!regulation) {
    regulation = regulationFromVideoDate(video.publishedAt);
    if (!regulation)
      throw admissionError(
        'missing_regulation',
        'no explicit regulation or in-window video date'
      );
    regulationInference = {
      method: 'video-date',
      publishedAt: video.publishedAt,
      sourceUrl: videoUrl,
    };
  }
  const teamBy = video.description
    .split(/\r?\n/)
    .map((line) =>
      /^\s*Team by(?:\s*:\s*|\s+)(.*?)\s*$/i.exec(line)?.[1]?.trim()
    )
    .find(Boolean);
  return {
    sourceName: discoveryCandidate.sourceName,
    indexUrl: discoveryCandidate.indexUrl,
    pasteUrl: discoveryCandidate.pasteUrl,
    expectedSpecies: null,
    replicaCode: null,
    regulation,
    ...(regulationInference ? { regulationInference } : {}),
    name:
      (typeof payload.title === 'string' ? payload.title.trim() : '') ||
      video.title,
    creator: teamBy || '',
    reports: [
      {
        event: `${discoveryCandidate.sourceName} collection`,
        rank: '',
        sourceUrl: discoveryCandidate.indexUrl,
      },
      {
        event: `${discoveryCandidate.sourceName} video`,
        rank: '',
        sourceUrl: videoUrl,
      },
    ],
  };
}

export function youtubeIndexData(discoveryCandidate, payload) {
  const candidate = youtubeCandidate(discoveryCandidate, payload);
  const hasProviderFormat =
    payload.provider === 'victory-road' &&
    payload.format != null &&
    payload.format !== '';
  return {
    candidate,
    payload: {
      ...payload,
      ...(hasProviderFormat
        ? { format: `vgcregulation${normalize(candidate.regulation)}` }
        : {}),
      publishedAt:
        payload.publishedAt ||
        discoveryCandidate.video.publishedAt.slice(0, 10),
    },
  };
}
