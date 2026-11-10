import { z } from 'zod';
import {
  MAX_TEAM_MEGAS,
  basePokemon,
  compareTeams,
  isMegaSpecies,
  isPasteUrl,
  normalize,
  pokemonId,
  voteWeights,
  type Member,
  type Team,
} from './catalog.ts';
import { battleSpecies, resolveBattleForm } from './battle-forms.ts';
import { abilitiesFor, championsItemsFor, movepoolFor } from './movepools.ts';
import {
  NATURES,
  canonicalMember,
  formatChampionsSpread,
  isCompleteSpread,
  normalizeSet,
  normalizeSpread,
  parseChampionsSpread,
  parseCustomPaste,
  spreadDeltas,
  spreadMoved,
  type ChampionsSpread,
  type SpreadDelta,
} from './paste.ts';
import { speedFor } from './stats.ts';
import {
  rankFavoriteTeams,
  sourceTeamFit,
  type FavoriteTeamSource,
  type SourceTeamFit,
} from './swap-suggestions.ts';
import {
  pasteUrlSchema,
  regulationInferenceSchema,
  reportSchema,
  sourceSchema,
  spreadSourceSchema,
  textSchema,
} from './spread-provenance.ts';

export const storageKey = 'champions-atlas:teams:v1';
export const activeTeamKey = 'champions-atlas:active-team:v1';
export const browseStorageKey = 'champions-atlas:browse:v1';

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
    original: structuredClone({ ...team }),
    origin: 'catalog',
    members: structuredClone(team.members),
    changeSlot: null,
    sources: isPasteUrl(team.pasteUrl)
      ? [{ name: team.name, pasteUrl: team.pasteUrl }]
      : [],
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
      sheetIds: [],
      creator: '',
      publishedAt: '',
      replicaCode: null,
      replicaStatus: '',
      reports: [],
      pasteNotes: null,
    }),
    origin: 'custom',
    members: structuredClone(members),
    changeSlot: null,
    sources: [],
  };
}

const rawMemberSchema = z.looseObject({
  pokemon: textSchema.refine((value) => Boolean(normalize(value))),
  item: textSchema.nullable(),
  ability: textSchema.nullable(),
  moves: z.array(textSchema).max(4),
  nature: textSchema.nullable(),
  spread: textSchema.nullable(),
  set: textSchema.optional(),
  spreadSource: spreadSourceSchema.optional(),
});
export const memberSchema = rawMemberSchema.transform(canonicalMember);
const membersSchema = z
  .array(memberSchema)
  .length(6)
  .refine(
    (members) =>
      new Set(members.map((member) => normalize(member.pokemon))).size === 6
  );
export const originalSchema = z.looseObject({
  id: textSchema,
  name: textSchema,
  regulation: textSchema,
  pasteUrl: z.union([z.literal(''), pasteUrlSchema]),
  members: membersSchema,
  paste: textSchema.nullable(),
  reports: z.array(reportSchema).max(100).optional(),
  sheetIds: z.array(textSchema).max(100).optional(),
  creator: textSchema.optional(),
  publishedAt: textSchema.optional(),
  replicaCode: textSchema.nullable().optional(),
  replicaStatus: textSchema.optional(),
  pasteNotes: textSchema.nullable().optional(),
  pasteError: textSchema.optional(),
  regulationInference: regulationInferenceSchema.optional(),
});
const savedTeamSchema = z.object({
  id: textSchema,
  name: textSchema,
  original: originalSchema,
  members: membersSchema,
  changeSlot: z.number().int().min(0).max(5).nullable().default(null),
  sources: z.array(sourceSchema).max(100),
  origin: z.enum(['catalog', 'custom']).optional(),
  collection: z.enum(['my-teams', 'wishlist', 'favorites']).optional(),
  wishlistOrder: z.number().int().safe().optional(),
  favoriteOrder: z.number().int().safe().optional(),
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
): SavedTeam[] {
  const [candidate] = readSavedTeams({ getItem: () => JSON.stringify([team]) });
  const saved = readSavedTeams(storage);
  const previous = saved.find((entry) => entry.id === candidate.id);
  if (
    previous?.collection === 'wishlist' &&
    candidate.collection === 'wishlist' &&
    previous.wishlistOrder !== undefined
  )
    candidate.wishlistOrder = previous.wishlistOrder;
  else delete candidate.wishlistOrder;
  if (
    previous?.collection === 'favorites' &&
    candidate.collection === 'favorites' &&
    previous.favoriteOrder !== undefined
  )
    candidate.favoriteOrder = previous.favoriteOrder;
  else delete candidate.favoriteOrder;
  const nextTeam = previous
    ? { ...candidate, original: previous.original, origin: previous.origin }
    : candidate;
  const next = saved.filter((entry) => entry.id !== candidate.id);
  next.push(nextTeam);
  const raw = JSON.stringify(next);
  const normalized = readSavedTeams({ getItem: () => raw });
  storage.setItem(storageKey, raw);
  return normalized;
}
export function deleteTeam(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  id: string
): SavedTeam[] {
  const saved = readSavedTeams(storage);
  const remaining = saved.filter((team) => team.id !== id);
  if (remaining.length !== saved.length)
    storage.setItem(storageKey, JSON.stringify(remaining));
  return remaining;
}

export function rosterConflict(
  member: Member,
  members: Member[],
  slot: number
): 'duplicate' | 'mega' | null {
  const others = members.filter((_, index) => index !== slot);
  const species = normalize(member.pokemon);
  if (others.some((other) => normalize(other.pokemon) === species))
    return 'duplicate';
  if (
    isMegaSpecies(member.pokemon) &&
    others.filter((other) => isMegaSpecies(other.pokemon)).length >=
      MAX_TEAM_MEGAS
  )
    return 'mega';
  return null;
}

export interface CatalogSuggestion {
  value: string;
  currentCount: number;
  totalCount: number;
  score?: number;
  original?: true;
  inGame?: true;
  favorite?: true;
}

export function favoriteMembersFor(
  target: Pick<Member, 'pokemon'>,
  favoriteTeams: readonly FavoriteTeamSource[],
  teammates: Member[] = []
): { member: Member; teamName: string }[] {
  const id = pokemonId(target.pokemon);
  if (!id) return [];
  const matches: { member: Member; teamName: string }[] = [];
  for (const { team } of rankFavoriteTeams(favoriteTeams, teammates)) {
    for (const member of team.members) {
      if (pokemonId(member.pokemon) === id)
        matches.push({ member, teamName: team.name });
    }
  }
  return matches;
}

export function originalMemberFor(
  self: Member,
  originals: Member[]
): Member | undefined {
  const exact = originals.find(
    (member) => normalize(member.pokemon) === normalize(self.pokemon)
  );
  if (exact) return exact;
  const form = resolveBattleForm(self);
  if (form.error) return;
  return originals.find((member) => {
    const originalForm = resolveBattleForm(member);
    return !originalForm.error && originalForm.pokemon === form.pokemon;
  });
}

const canonicalNature = (nature: string | null) =>
  NATURES.find((name) => normalize(name) === normalize(nature ?? ''));

export function catalogSuggestions(
  target: string | Member,
  teams: Team[],
  currentRegulation: string,
  teammates: Member[] = [],
  originalMember?: Member,
  inGameMember?: Member,
  favoriteTeams: readonly FavoriteTeamSource[] = []
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
  const teammateItems = new Set(
    teammates.map((member) => normalize(member.item ?? '')).filter(Boolean)
  );
  const items = new Map<string, CatalogSuggestion>();
  const abilities = new Map<string, CatalogSuggestion>();
  const moves = new Map<string, CatalogSuggestion>();
  const natures = new Map<string, CatalogSuggestion>();
  const add = (
    values: Map<string, CatalogSuggestion>,
    value: string | null,
    score: number,
    current: boolean
  ) => {
    if (!value || !normalize(value)) return;
    const key = normalize(value);
    const existing = values.get(key);
    if (existing) {
      existing.totalCount++;
      if (score > 0) existing.score = (existing.score || 0) + score;
      if (current) existing.currentCount++;
    } else {
      const entry: CatalogSuggestion = {
        value,
        currentCount: current ? 1 : 0,
        totalCount: 1,
      };
      if (score > 0) entry.score = score;
      values.set(key, entry);
    }
  };
  const eq = (a: string | null, b: string | null) =>
    Boolean(a && b && normalize(a) === normalize(b));
  const weight = voteWeights(teams, currentRegulation);
  for (const team of teams) {
    const teamWeight = team.regulation === 'Unknown' ? 0 : weight(team);
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

      if (
        !teammateItems.has(normalize(member.item ?? '')) &&
        (!battleSpecies(targetMember.pokemon) ||
          resolveBattleForm({
            pokemon: targetMember.pokemon,
            item: member.item,
            ability: null,
          }).error === null)
      )
        add(
          items,
          member.item,
          (baseScore + am + nm + sm + mm) * teamWeight,
          isCurrent
        );
      add(
        abilities,
        member.ability,
        (baseScore + im + nm + sm + mm) * teamWeight,
        isCurrent
      );
      add(
        natures,
        member.nature,
        (baseScore + im + am + mm) * teamWeight,
        isCurrent
      );
      for (const move of member.moves) {
        add(
          moves,
          move,
          (baseScore + im + am + nm + sm) * teamWeight,
          isCurrent
        );
      }
    }
  }

  for (const item of championsItemsFor(targetMember.pokemon)) {
    const key = normalize(item);
    if (!teammateItems.has(key) && !items.has(key))
      items.set(key, { value: item, currentCount: 0, totalCount: 0 });
  }
  for (const ability of abilitiesFor(targetMember.pokemon)) {
    const key = normalize(ability);
    if (!abilities.has(key))
      abilities.set(key, { value: ability, currentCount: 0, totalCount: 0 });
  }
  for (const move of movepoolFor(targetMember.pokemon)) {
    const key = normalize(move);
    if (!moves.has(key))
      moves.set(key, { value: move, currentCount: 0, totalCount: 0 });
  }
  if (battleSpecies(targetMember.pokemon)) {
    for (const nature of NATURES) {
      const key = normalize(nature);
      if (!natures.has(key))
        natures.set(key, { value: nature, currentCount: 0, totalCount: 0 });
    }
  }

  const original =
    originalMember && originalMemberFor(targetMember, [originalMember]);
  const inGame =
    inGameMember &&
    pokemonId(inGameMember.pokemon) === pokemonId(targetMember.pokemon)
      ? inGameMember
      : undefined;
  const favorites = favoriteMembersFor(
    targetMember,
    favoriteTeams,
    teammates
  ).map(({ member }) => member);
  const rank = (
    values: Map<string, CatalogSuggestion>,
    originalValues: (string | null)[] = [],
    inGameValues: (string | null)[] = [],
    favoriteValues: (string | null)[] = []
  ) => {
    const promoted: CatalogSuggestion[] = [];
    const promote = (
      value: string | null,
      source: 'original' | 'inGame' | 'favorite'
    ) => {
      const key = normalize(value ?? '');
      if (!value || !key || key === 'unknown') return;
      const existing = promoted.find((entry) => normalize(entry.value) === key);
      if (existing) {
        if (source === 'original') existing.original = true;
        else if (source === 'inGame') existing.inGame = true;
        else existing.favorite = true;
        return;
      }
      promoted.push({
        ...(values.get(key) ?? { value, currentCount: 0, totalCount: 0 }),
        ...(source === 'original'
          ? { original: true }
          : source === 'inGame'
            ? { inGame: true }
            : { favorite: true }),
      });
      values.delete(key);
    };
    originalValues.forEach((value) => promote(value, 'original'));
    inGameValues.forEach((value) => promote(value, 'inGame'));
    favoriteValues.forEach((value) => promote(value, 'favorite'));
    return [
      ...promoted,
      ...[...values.values()].sort(
        (a, b) =>
          (b.score || 0) - (a.score || 0) ||
          b.currentCount - a.currentCount ||
          b.totalCount - a.totalCount ||
          a.value.localeCompare(b.value)
      ),
    ];
  };
  const inGameNature =
    NATURES.find(
      (name) => normalize(name) === normalize(inGame?.nature ?? '')
    ) ?? null;

  return {
    items: rank(
      items,
      [original?.item ?? null],
      [inGame?.item ?? null],
      favorites
        .map((m) => m.item)
        .filter((item) => !teammateItems.has(normalize(item ?? '')))
    ),
    abilities: rank(
      abilities,
      [original?.ability ?? null],
      [inGame?.ability ?? null],
      favorites.map((m) => m.ability)
    ),
    moves: rank(
      moves,
      original?.moves,
      inGame?.moves,
      favorites.flatMap((m) => m.moves)
    ),
    natures: rank(
      natures,
      [
        NATURES.find(
          (name) => normalize(name) === normalize(original?.nature ?? '')
        ) ?? null,
      ],
      [inGameNature],
      favorites.map((m) => canonicalNature(m.nature) ?? null)
    ),
  };
}

interface CatalogSpreadOption {
  spread: string;
  nature: string;
  values: ChampionsSpread;
  currentCount: number;
  currentWeight: number;
  totalCount: number;
  itemWeights: Map<string, number>;
  sources: Team[];
}

export interface CatalogSpreadSuggestion {
  spread: string;
  nature: string;
  currentCount: number;
  totalCount: number;
  deltas: SpreadDelta[];
  movedPoints: number;
  speed: number | null;
}

export interface SpreadSuggestion {
  spread: string;
  nature: string;
  source: string;
  deltas: SpreadDelta[];
  movedPoints: number;
  speed: number | null;
  original?: true;
  inGame?: true;
  favorite?: true;
}

export function originalSpreadSuggestion(
  self: Member,
  original: Member
): SpreadSuggestion | undefined {
  const form = resolveBattleForm(self),
    originalForm = resolveBattleForm(original);
  if (form.error || originalForm.error || form.pokemon !== originalForm.pokemon)
    return;
  const spread = parseChampionsSpread(original.spread);
  const nature = canonicalNature(self.nature);
  const originalNature = canonicalNature(original.nature);
  if (!isCompleteSpread(spread) || !nature || originalNature !== nature) return;
  const deltas = spreadDeltas(parseChampionsSpread(self.spread), spread);
  return {
    spread: formatChampionsSpread(spread),
    nature,
    source: 'Original team',
    original: true,
    deltas,
    movedPoints: spreadMoved(deltas) / 2,
    speed: speedFor(form.pokemon, spread, nature),
  };
}

const spreadCache = new WeakMap<
  Team[],
  { regulation: string; bySpecies: Map<string, CatalogSpreadOption[]> }
>();

function catalogSpreadIndex(
  teams: Team[],
  regulation: string
): Map<string, CatalogSpreadOption[]> {
  const cached = spreadCache.get(teams);
  if (cached && cached.regulation === regulation) return cached.bySpecies;
  const bySpecies = new Map<string, Map<string, CatalogSpreadOption>>();
  const weight = voteWeights(teams, regulation);
  for (const team of teams) {
    const isCurrent = team.regulation === regulation;
    const teamWeight = isCurrent ? weight(team) : 0;
    for (const member of team.members) {
      const values = parseChampionsSpread(member.spread);
      if (!isCompleteSpread(values)) continue;
      const nature = canonicalNature(member.nature);
      if (!nature) continue;
      const form = resolveBattleForm(member);
      if (form.error) continue;
      const species = normalize(form.pokemon);
      let options = bySpecies.get(species);
      if (!options) {
        options = new Map();
        bySpecies.set(species, options);
      }
      const spread = formatChampionsSpread(values);
      const key = `${normalize(nature)}|${normalize(spread)}`;
      let option = options.get(key);
      if (!option) {
        option = {
          spread,
          nature,
          values,
          currentCount: 0,
          currentWeight: 0,
          totalCount: 0,
          itemWeights: new Map(),
          sources: [],
        };
        options.set(key, option);
      }
      option.totalCount++;
      if (isCurrent) option.currentCount++;
      option.currentWeight += teamWeight;
      option.sources.push(team);
      const item = normalize(member.item ?? '');
      if (item)
        option.itemWeights.set(
          item,
          (option.itemWeights.get(item) ?? 0) + teamWeight
        );
    }
  }
  const indexed = new Map<string, CatalogSpreadOption[]>();
  for (const [species, options] of bySpecies)
    indexed.set(species, [...options.values()]);
  spreadCache.set(teams, { regulation, bySpecies: indexed });
  return indexed;
}

const NEAR_COPY_SHARED = 4;

export function catalogSpreadSuggestions(
  self: Member,
  teams: Team[],
  currentRegulation: string,
  limit = 5,
  teammates: Member[] = []
): CatalogSpreadSuggestion[] {
  const nature = canonicalNature(self.nature);
  if (!nature || limit <= 0) return [];
  const form = resolveBattleForm(self);
  if (form.error) return [];
  const options =
    catalogSpreadIndex(teams, currentRegulation).get(normalize(form.pokemon)) ??
    [];
  const eligible = options.filter(
    (option) => normalize(option.nature) === normalize(nature)
  );
  if (!eligible.length) return [];
  const initial = parseChampionsSpread(self.spread);
  const fitCache = new Map<Team, SourceTeamFit>();
  const fitFor = (team: Team) => {
    const cached = fitCache.get(team);
    if (cached) return cached;
    const fit = sourceTeamFit(team, teammates);
    fitCache.set(team, fit);
    return fit;
  };
  const itemKey = normalize(self.item ?? '');
  const ranked = eligible.map((option) => {
    let source = option.sources[0];
    let fit = fitFor(source);
    for (let i = 1; i < option.sources.length; i++) {
      const candidate = option.sources[i];
      const candidateFit = fitFor(candidate);
      if (
        candidateFit.shared > fit.shared ||
        (candidateFit.shared === fit.shared &&
          (candidateFit.details > fit.details ||
            (candidateFit.details === fit.details &&
              compareTeams(candidate, source, currentRegulation) < 0)))
      ) {
        source = candidate;
        fit = candidateFit;
      }
    }
    return {
      option,
      source,
      fit,
      near: fit.shared >= NEAR_COPY_SHARED ? fit.shared : 0,
      itemWeight: option.itemWeights.get(itemKey) ?? 0,
    };
  });
  ranked.sort(
    (a, b) =>
      b.near - a.near ||
      (a.near ? b.fit.details - a.fit.details : 0) ||
      b.itemWeight - a.itemWeight ||
      b.option.currentWeight - a.option.currentWeight ||
      b.fit.shared - a.fit.shared ||
      b.fit.details - a.fit.details ||
      compareTeams(
        a.source,
        b.source,
        currentRegulation,
        b.option.totalCount - a.option.totalCount
      ) ||
      a.option.spread.localeCompare(b.option.spread)
  );
  return ranked.slice(0, limit).map(({ option }) => {
    const deltas = spreadDeltas(initial, option.values);
    return {
      spread: option.spread,
      nature: option.nature,
      currentCount: option.currentCount,
      totalCount: option.totalCount,
      deltas,
      movedPoints: spreadMoved(deltas) / 2,
      speed: speedFor(form.pokemon, option.values, option.nature),
    };
  });
}
