import { z } from 'zod';
import { compareTeams, normalize, type Member, type Team } from './catalog.ts';
import { normalizeSet, normalizeSpread, parseCustomPaste } from './paste.ts';

export const storageKey = 'champions-atlas:teams:v1';
export const activeTeamKey = 'champions-atlas:active-team:v1';
export const browseStorageKey = 'champions-atlas:browse:v1';

export function resolveSavedTeamId(
  saved: SavedTeam[],
  requestedId: string | null,
  activeId: string | null
): string | null {
  const fallbackId =
    (activeId && saved.find((team) => team.id === activeId)?.id) ??
    saved[0]?.id ??
    null;
  return requestedId && saved.some((team) => team.id === requestedId)
    ? requestedId
    : fallbackId;
}

export function setText(member: Member) {
  return (
    (member.set && normalizeSet(member.set)) ||
    [
      member.pokemon + (member.item ? ` @ ${member.item}` : ''),
      member.ability && `Ability: ${member.ability}`,
      member.nature && `${member.nature} Nature`,
      member.spread && `EVs: ${normalizeSpread(member.spread)}`,
      ...member.moves.map((move) => `- ${move}`),
    ]
      .filter(Boolean)
      .join('\n')
  );
}

export const exportPaste = (members: Member[]) =>
  members.map(setText).join('\n\n');

export function generateUUID(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newSavedTeam(team: Team): SavedTeam {
  return {
    id: generateUUID(),
    name: team.name,
    original: structuredClone({
      id: team.id,
      name: team.name,
      regulation: team.regulation,
      pasteUrl: team.pasteUrl,
      members: team.members,
      paste: team.paste,
    }),
    members: structuredClone(team.members),
    changeSlot: null,
    sources: [{ name: team.name, pasteUrl: team.pasteUrl }],
  };
}

export function newCustomTeam(
  name: string,
  currentRegulation: string,
  paste: string
): SavedTeam {
  if (!name.trim()) throw new Error('Give this team a name.');
  const id = generateUUID();
  const members = parseCustomPaste(paste);
  const storedPaste = exportPaste(members);
  return {
    id,
    name: name.trim(),
    original: structuredClone({
      id,
      name: name.trim(),
      regulation: currentRegulation,
      pasteUrl: '',
      members,
      paste: storedPaste,
    }),
    members: structuredClone(members),
    changeSlot: null,
    sources: [],
  };
}

export function differences(before: Member[], after: Member[]) {
  const rows: {
    pokemon: string;
    field: string;
    before: string;
    after: string;
  }[] = [];
  for (const member of before) {
    const match = after.find(
      (other) => normalize(other.pokemon) === normalize(member.pokemon)
    );
    if (!match) {
      rows.push({
        pokemon: member.pokemon,
        field: 'Pokémon',
        before: 'On team',
        after: 'Removed',
      });
      continue;
    }
    for (const [field, label] of [
      ['item', 'Item'],
      ['ability', 'Ability'],
      ['nature', 'Nature'],
      ['spread', 'EVs'],
    ] as const) {
      if (
        !member[field] ||
        !match[field] ||
        normalize(member[field]) !== normalize(match[field])
      )
        rows.push({
          pokemon: member.pokemon,
          field: label,
          before: member[field] || 'Unknown',
          after: match[field] || 'Unknown',
        });
    }
    if (
      !member.moves.length ||
      !match.moves.length ||
      member.moves.map(normalize).sort().join(',') !==
        match.moves.map(normalize).sort().join(',')
    )
      rows.push({
        pokemon: member.pokemon,
        field: 'Moves',
        before: member.moves.join(', ') || 'Unknown',
        after: match.moves.join(', ') || 'Unknown',
      });
    const beforeSet = member.set && setText(member);
    const afterSet = match.set && setText(match);
    if (beforeSet && afterSet && beforeSet !== afterSet)
      rows.push({
        pokemon: member.pokemon,
        field: 'Full set',
        before: beforeSet,
        after: afterSet,
      });
  }
  for (const member of after)
    if (
      !before.some(
        (other) => normalize(other.pokemon) === normalize(member.pokemon)
      )
    )
      rows.push({
        pokemon: member.pokemon,
        field: 'Pokémon',
        before: 'Not on team',
        after: 'Added',
      });
  return rows;
}

const textSchema = z.string().max(50_000);
const pasteUrlSchema = textSchema.regex(
  /^https:\/\/pokepast\.es\/[a-f0-9]{16}$/
);
const memberSchema = z.looseObject({
  pokemon: textSchema.refine((value) => Boolean(normalize(value))),
  item: textSchema.nullable(),
  ability: textSchema.nullable(),
  moves: z.array(textSchema).max(4),
  nature: textSchema.nullable(),
  spread: textSchema.nullable(),
  set: textSchema.optional(),
});
const membersSchema = z
  .array(memberSchema)
  .length(6)
  .refine(
    (members) =>
      new Set(members.map((member) => normalize(member.pokemon))).size === 6
  );
const originalSchema = z.looseObject({
  id: textSchema,
  name: textSchema,
  regulation: textSchema,
  pasteUrl: z.union([z.literal(''), pasteUrlSchema]),
  members: membersSchema,
  paste: textSchema.nullable(),
});
const sourceSchema = z.looseObject({
  name: textSchema,
  pasteUrl: pasteUrlSchema,
});
const savedTeamSchema = z.object({
  id: textSchema,
  name: textSchema,
  original: originalSchema,
  members: membersSchema,
  changeSlot: z.number().int().min(0).max(5).nullable().default(null),
  sources: z.array(sourceSchema).max(100),
});
const savedTeamsSchema = z.array(savedTeamSchema).max(50);
export type SavedTeam = z.infer<typeof savedTeamSchema>;

export function readSavedTeams(storage: Pick<Storage, 'getItem'>): SavedTeam[] {
  const raw = storage.getItem(storageKey);
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  const result = savedTeamsSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      'Saved teams could not be read. Existing data has been left untouched.'
    );
  const teams = result.data;
  if (new Set(teams.map((team) => team.id)).size !== teams.length)
    throw new Error(
      'Duplicate saved team IDs. Existing data has been left untouched.'
    );
  return teams;
}

export function saveTeam(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  team: SavedTeam
) {
  const saved = readSavedTeams(storage);
  const next = saved.filter((entry) => entry.id !== team.id);
  next.push(team);
  const raw = JSON.stringify(next);
  readSavedTeams({ getItem: () => raw });
  storage.setItem(storageKey, raw);
  return next;
}

export const basePokemon = (name: string) =>
  normalize(name).replace(/mega[a-z]?$/, '');

export interface CatalogSuggestion {
  value: string;
  currentCount: number;
  totalCount: number;
  nature?: string | null;
  score?: number;
}

export interface PokemonSuggestion {
  pokemon: string;
  member: Member;
  sharedTeammates: number;
}

export function catalogSuggestions(
  target: string | Member,
  teams: Team[],
  currentRegulation: string,
  teammates: Member[] = []
) {
  const isSimple = typeof target === 'string';
  const targetMember: Member = isSimple
    ? {
        pokemon: target,
        item: null,
        ability: null,
        moves: [],
        nature: null,
        spread: null,
      }
    : target;
  const normTarget = normalize(targetMember.pokemon);
  const baseTarget = basePokemon(targetMember.pokemon);

  const items = new Map<string, CatalogSuggestion>();
  const abilities = new Map<string, CatalogSuggestion>();
  const moves = new Map<string, CatalogSuggestion>();
  const spreads = new Map<string, CatalogSuggestion>();
  const natures = new Map<string, CatalogSuggestion>();

  const add = (
    values: Map<string, CatalogSuggestion>,
    value: string | null,
    score: number,
    current: boolean,
    extra?: { nature?: string | null }
  ) => {
    if (!value || !normalize(value)) return;
    const key = normalize(value);
    const existing = values.get(key);
    if (existing) {
      existing.totalCount++;
      if (score > 0) existing.score = (existing.score || 0) + score;
      if (current) existing.currentCount++;
      if (!isSimple && extra?.nature && !existing.nature)
        existing.nature = extra.nature;
    } else {
      const entry: CatalogSuggestion = {
        value,
        currentCount: current ? 1 : 0,
        totalCount: 1,
      };
      if (score > 0) entry.score = score;
      if (!isSimple && extra?.nature) entry.nature = extra.nature;
      values.set(key, entry);
    }
  };

  const eq = (a: string | null, b: string | null) =>
    Boolean(a && b && normalize(a) === normalize(b));

  for (const team of teams) {
    const isCurrent = team.regulation === currentRegulation;
    let teamSim = 0;
    if (teammates.length) {
      for (const t of teammates) {
        if (team.members.some((m) => eq(m.pokemon, t.pokemon))) teamSim += 3;
      }
    }

    for (const member of team.members) {
      const normMember = normalize(member.pokemon);
      const match =
        isSimple && !teammates.length
          ? normMember === normTarget
          : basePokemon(member.pokemon) === baseTarget;
      if (!match) continue;

      const baseScore =
        isSimple && !teammates.length
          ? 0
          : teamSim + (normMember === normTarget ? 2 : 1) + (isCurrent ? 2 : 1);

      const im = eq(targetMember.item, member.item) ? 4 : 0;
      const am = eq(targetMember.ability, member.ability) ? 2 : 0;
      const nm = eq(targetMember.nature, member.nature) ? 2 : 0;
      const sm = eq(targetMember.spread, member.spread) ? 3 : 0;
      const mm =
        (targetMember.moves?.filter((mv) =>
          member.moves.some((om) => normalize(mv) === normalize(om))
        ).length || 0) * 1.5;

      add(items, member.item, baseScore + am + nm + sm + mm, isCurrent);
      add(abilities, member.ability, baseScore + im + nm + sm + mm, isCurrent);
      add(spreads, member.spread, baseScore + im + am + mm, isCurrent, {
        nature: member.nature,
      });
      add(natures, member.nature, baseScore + im + am + mm, isCurrent);
      for (const move of member.moves) {
        add(moves, move, baseScore + im + am + nm + sm, isCurrent);
      }
    }
  }

  const rank = (values: Map<string, CatalogSuggestion>) =>
    [...values.values()].sort(
      (a, b) =>
        (b.score || 0) - (a.score || 0) ||
        b.currentCount - a.currentCount ||
        b.totalCount - a.totalCount ||
        a.value.localeCompare(b.value)
    );

  return {
    items: rank(items),
    abilities: rank(abilities),
    moves: rank(moves),
    spreads: rank(spreads),
    natures: rank(natures),
    pokemon: pokemonSuggestions(
      teammates,
      teams,
      currentRegulation,
      targetMember.pokemon
    ),
  };
}

export function pokemonSuggestions(
  teammates: Member[],
  teams: Team[],
  currentRegulation: string,
  excludePokemon?: string
): PokemonSuggestion[] {
  const excludeSpecies = new Set(teammates.map((t) => normalize(t.pokemon)));
  if (excludePokemon) {
    excludeSpecies.add(normalize(excludePokemon));
    excludeSpecies.add(basePokemon(excludePokemon));
  }

  const rankedTeams = teams
    .map((team) => {
      let shared = 0,
        details = 0;
      for (const t of teammates) {
        const match = team.members.find(
          (m) => normalize(m.pokemon) === normalize(t.pokemon)
        );
        if (!match) continue;
        shared++;
        if (t.item && match.item && normalize(t.item) === normalize(match.item))
          details++;
        if (
          t.ability &&
          match.ability &&
          normalize(t.ability) === normalize(match.ability)
        )
          details++;
      }
      return { team, shared, details };
    })
    .filter((t) => t.shared > 0)
    .sort(
      (a, b) =>
        b.shared - a.shared ||
        b.details - a.details ||
        compareTeams(a.team, b.team, currentRegulation)
    );
  const seen = new Set<string>();
  const suggestions: PokemonSuggestion[] = [];
  for (const { team, shared } of rankedTeams) {
    for (const m of team.members) {
      const norm = normalize(m.pokemon);
      if (
        excludeSpecies.has(norm) ||
        excludeSpecies.has(basePokemon(m.pokemon))
      )
        continue;
      if (seen.has(norm)) continue;
      seen.add(norm);
      suggestions.push({
        pokemon: m.pokemon,
        member: m,
        sharedTeammates: shared,
      });
      if (suggestions.length >= 6) break;
    }
    if (suggestions.length >= 6) break;
  }
  return suggestions;
}

export function speciesMember(
  pokemon: string,
  teammates: Member[],
  teams: Team[],
  currentRegulation: string
): Member | null {
  const norm = normalize(pokemon);
  const rankedTeams = teams
    .map((team) => {
      let shared = 0;
      for (const t of teammates) {
        if (
          team.members.some(
            (m) => normalize(m.pokemon) === normalize(t.pokemon)
          )
        )
          shared++;
      }
      return { team, shared };
    })
    .sort(
      (a, b) =>
        b.shared - a.shared || compareTeams(a.team, b.team, currentRegulation)
    );
  for (const { team } of rankedTeams) {
    const match = team.members.find((m) => normalize(m.pokemon) === norm);
    if (match)
      return {
        pokemon: match.pokemon,
        item: match.item,
        ability: match.ability,
        nature: match.nature,
        spread: match.spread,
        moves: [...match.moves],
      };
  }
  return null;
}
