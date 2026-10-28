import { z } from 'zod';
import rawCatalog from './data/catalog.json' with { type: 'json' };
import rawTags from './data/team-tags.json' with { type: 'json' };
import { resolveBattleForm } from './battle-forms.ts';
import type { Team } from './catalog.ts';
import { reportSchema, textSchema } from './spread-provenance.ts';
import type { TeamTagsIndex } from './tags.ts';
import { originalSchema } from './workbench.ts';

export interface CatalogSource {
  name: string;
  url: string;
}

export interface CatalogData {
  updatedAt: string;
  currentRegulation: string;
  sources: CatalogSource[];
  sourceHash: string;
  teams: Team[];
}

export interface CatalogManifest {
  schemaVersion: 1;
  updatedAt: string;
  currentRegulation: string;
  sourceHash: string;
  bundleHash: string;
  bundlePath: string;
}

export interface CatalogBundle extends CatalogData {
  schemaVersion: 1;
  bundleHash?: string;
  tags: TeamTagsIndex;
}

const bundledCatalog = rawCatalog as CatalogData;
export const tags: TeamTagsIndex = {
  teams: (rawTags as TeamTagsIndex).teams ?? {},
};
export default bundledCatalog;

export const MANIFEST_MAX_BYTES = 64 * 1024;
export const BUNDLE_MAX_BYTES = 15 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const isoTimestampSchema = textSchema
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)));
const nonEmptyTextSchema = textSchema.refine(
  (value) => value.trim().length > 0
);

const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    updatedAt: isoTimestampSchema,
    currentRegulation: nonEmptyTextSchema,
    sourceHash: hashSchema,
    bundleHash: hashSchema,
    bundlePath: textSchema,
  })
  .refine(
    (manifest) =>
      manifest.bundlePath === `/catalog/bundle-${manifest.bundleHash}.json`
  );

const catalogSourceSchema = z.object({
  name: nonEmptyTextSchema,
  url: nonEmptyTextSchema,
});

const catalogTeamSchema = originalSchema
  .extend({
    id: nonEmptyTextSchema,
    name: nonEmptyTextSchema,
    regulation: nonEmptyTextSchema,
    sheetIds: z.array(textSchema),
    creator: textSchema,
    publishedAt: textSchema,
    replicaCode: textSchema.nullable(),
    replicaStatus: textSchema,
    reports: z.array(reportSchema),
    pasteNotes: textSchema.nullable(),
  })
  .refine((team) =>
    team.members.every((member) => resolveBattleForm(member).error === null)
  );

const teamTagSchema = z.looseObject({
  archetype: textSchema,
  speedMode: textSchema.optional(),
  roles: z.record(textSchema, textSchema),
});

const bundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    updatedAt: isoTimestampSchema,
    currentRegulation: nonEmptyTextSchema,
    sourceHash: hashSchema,
    bundleHash: hashSchema.optional(),
    sources: z.array(catalogSourceSchema).min(1),
    teams: z.array(catalogTeamSchema).min(1),
    tags: z.object({
      teams: z.record(textSchema, teamTagSchema),
    }),
  })
  .refine(
    (bundle) =>
      new Set(bundle.teams.map((team) => team.id)).size === bundle.teams.length
  );

export function validateCatalogManifest(value: unknown): CatalogManifest {
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) throw new Error('Invalid catalog manifest.');
  return parsed.data;
}

export function validateCatalogBundle(value: unknown): CatalogBundle {
  const parsed = bundleSchema.safeParse(value);
  if (!parsed.success) throw new Error('Invalid catalog bundle.');
  return parsed.data as CatalogBundle;
}

export function isEligibleCatalogCandidate(
  candidate: {
    updatedAt: string;
    sourceHash: string;
    bundleHash?: string;
  },
  current: {
    updatedAt: string;
    sourceHash: string;
    bundleHash?: string;
  },
  baselineUpdatedAt = bundledCatalog.updatedAt
): boolean {
  const candidateTime = Date.parse(candidate.updatedAt);
  const currentTime = Date.parse(current.updatedAt);
  const baselineTime = Date.parse(baselineUpdatedAt);
  if (
    Number.isNaN(candidateTime) ||
    Number.isNaN(currentTime) ||
    Number.isNaN(baselineTime)
  )
    return false;
  if (candidateTime < baselineTime || candidateTime < currentTime) return false;
  if (candidate.bundleHash && current.bundleHash)
    return (
      candidate.bundleHash !== current.bundleHash ||
      candidate.sourceHash !== current.sourceHash
    );
  return (
    candidate.sourceHash !== current.sourceHash || candidateTime > currentTime
  );
}

export function defaultCatalogEndpoint(): string {
  const catalogUrl = import.meta.env?.VITE_CATALOG_URL;
  if (typeof catalogUrl === 'string') return catalogUrl.trim();
  const projectId = import.meta.env?.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!projectId) return '';
  return `https://${projectId}.web.app/catalog/manifest.json`;
}

export async function readBoundedJson(
  response: Response,
  maxBytes: number
): Promise<unknown> {
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`Catalog HTTP ${response.status}.`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Catalog response body is missing.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      void reader.cancel().catch(() => undefined);
      throw new Error(`Catalog response exceeds ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

async function fetchJsonWithLimit(
  url: string,
  maxBytes: number,
  fetcher: typeof fetch,
  outerSignal?: AbortSignal
): Promise<unknown> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  outerSignal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    });
    return await readBoundedJson(response, maxBytes);
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener('abort', onAbort);
  }
}

export async function fetchCatalogUpdate(
  current: { updatedAt: string; sourceHash: string; bundleHash?: string },
  options: {
    endpoint?: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
    baselineUpdatedAt?: string;
  } = {}
): Promise<{
  catalog: CatalogData;
  tags: TeamTagsIndex;
  bundleHash: string;
  bundle: CatalogBundle;
} | null> {
  const endpoint = (options.endpoint ?? defaultCatalogEndpoint()).trim();
  if (!endpoint) return null;
  const fetcher = options.fetcher ?? fetch;
  const baselineUpdatedAt =
    options.baselineUpdatedAt ?? bundledCatalog.updatedAt;

  try {
    const rawManifest = await fetchJsonWithLimit(
      endpoint,
      MANIFEST_MAX_BYTES,
      fetcher,
      options.signal
    );
    const manifest = validateCatalogManifest(rawManifest);
    if (!isEligibleCatalogCandidate(manifest, current, baselineUpdatedAt))
      return null;

    const bundleUrl = new URL(manifest.bundlePath, endpoint).toString();
    const rawBundle = await fetchJsonWithLimit(
      bundleUrl,
      BUNDLE_MAX_BYTES,
      fetcher,
      options.signal
    );
    const bundle = validateCatalogBundle(rawBundle);
    if (
      bundle.updatedAt !== manifest.updatedAt ||
      bundle.currentRegulation !== manifest.currentRegulation ||
      bundle.sourceHash !== manifest.sourceHash ||
      !isEligibleCatalogCandidate(
        {
          updatedAt: bundle.updatedAt,
          sourceHash: bundle.sourceHash,
          bundleHash: manifest.bundleHash,
        },
        current,
        baselineUpdatedAt
      )
    )
      return null;

    return {
      catalog: {
        updatedAt: bundle.updatedAt,
        currentRegulation: bundle.currentRegulation,
        sources: bundle.sources,
        sourceHash: bundle.sourceHash,
        teams: bundle.teams,
      },
      tags: { teams: bundle.tags.teams },
      bundleHash: manifest.bundleHash,
      bundle,
    };
  } catch {
    return null;
  }
}
