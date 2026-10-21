import { z } from 'zod';
import {
  isPasteUrl,
  normalize,
  type Member,
  type SpreadSource,
} from './catalog.ts';
import { cosmeticForms, resolveBattleForm } from './battle-forms.ts';
import {
  CHAMPIONS_STATS,
  isCompleteSpread,
  parseChampionsSpread,
} from './paste.ts';

export const textSchema = z.string().max(50_000);
export const pasteUrlSchema = textSchema.refine(isPasteUrl);
const youtubeWatchUrlSchema = textSchema.regex(
  /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/
);

export const regulationInferenceSchema = z.object({
  method: z.literal('video-date'),
  publishedAt: textSchema.datetime({ offset: true }),
  sourceUrl: youtubeWatchUrlSchema,
});
export const spreadSourceSchema = z.object({
  pasteUrl: pasteUrlSchema,
  videoUrls: z.array(youtubeWatchUrlSchema).min(1),
  sourceSet: textSchema,
  originalSet: textSchema,
  appliedSignature: textSchema,
  borrowedNature: z.boolean(),
});
export const reportSchema = z.object({
  event: textSchema,
  rank: textSchema,
  sourceUrl: textSchema,
  entrants: z.number().int().positive().optional(),
});
export const sourceSchema = z.looseObject({
  name: textSchema,
  pasteUrl: pasteUrlSchema,
});

function resolvedForm(member: Member): string | null {
  const result = resolveBattleForm(member);
  if (result.error) return null;
  const name = normalize(result.pokemon);
  return normalize(cosmeticForms[name] ?? name) || null;
}

export function memberSetSignature(member: Member): string | null {
  const form = resolvedForm(member);
  const spread = parseChampionsSpread(member.spread);
  if (!form || !isCompleteSpread(spread) || !Array.isArray(member.moves))
    return null;
  return JSON.stringify([
    form,
    normalize(member.item ?? ''),
    normalize(member.ability ?? ''),
    normalize(member.nature ?? ''),
    member.moves.map(normalize).sort(),
    CHAMPIONS_STATS.map((stat) => spread[stat]),
  ]);
}

export function activeSpreadSource(member: Member): SpreadSource | null {
  const source = spreadSourceSchema.safeParse(member.spreadSource);
  if (!source.success) return null;
  return memberSetSignature(member) === source.data.appliedSignature
    ? source.data
    : null;
}
