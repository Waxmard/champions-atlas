import { z } from 'zod';
import type { Team } from './catalog.ts';
import { rosterRegulations } from './rosters.ts';

export const regulationOverridesKey = 'champions-atlas:regulations:v1';

const overridesSchema = z.array(
  z.object({
    id: z.string().min(1),
    regulation: z.string().min(1).nullable(),
    at: z.number(),
  })
);

export type RegulationOverride = z.infer<typeof overridesSchema>[number];

export function parseRegulationOverrides(value: unknown): RegulationOverride[] {
  return overridesSchema.parse(value);
}

export function readRegulationOverrides(
  storage: Pick<Storage, 'getItem'>
): RegulationOverride[] | null {
  try {
    const raw = storage.getItem(regulationOverridesKey);
    return raw === null ? [] : parseRegulationOverrides(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeRegulationOverrides(
  storage: Pick<Storage, 'setItem'>,
  overrides: RegulationOverride[]
): void {
  storage.setItem(regulationOverridesKey, JSON.stringify(overrides));
}

export function mergeRegulationOverrides(
  a: readonly RegulationOverride[],
  b: readonly RegulationOverride[]
): RegulationOverride[] {
  const latest = new Map<string, RegulationOverride>();
  for (const entry of [...a, ...b]) {
    const current = latest.get(entry.id);
    if (!current || entry.at > current.at) latest.set(entry.id, entry);
  }
  return [...latest.values()].sort((x, y) => x.id.localeCompare(y.id));
}

export function withRegulationOverrides<T extends { teams: Team[] }>(
  catalog: T,
  overrides: readonly RegulationOverride[]
): T {
  const byId = new Map(overrides.map((entry) => [entry.id, entry.regulation]));
  let changed = false;
  const teams = catalog.teams.map((team) => {
    const regulation = byId.get(team.id);
    if (
      team.regulation !== 'Unknown' ||
      !regulation ||
      !rosterRegulations.includes(regulation)
    )
      return team;
    changed = true;
    return { ...team, regulation, regulationSetByUser: true as const };
  });
  return changed ? { ...catalog, teams } : catalog;
}
