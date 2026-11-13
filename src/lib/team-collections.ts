import { isPasteUrl, teamHeading, type Team } from './catalog.ts';
import type { PokepastePayload } from './pokepaste.ts';
import { canonicalSnapshot } from './team-history.ts';
import {
  activeTeamKey,
  deleteTeam,
  newCustomTeam,
  newSavedTeam,
  orderKeyOf,
  readSavedTeams,
  saveTeam,
  storageKey,
  type SavedTeam,
} from './workbench.ts';

export const isSavedTeam = (team: SavedTeam): boolean =>
  team.collection !== 'wishlist';

export const hasSetEdits = (
  team: Pick<SavedTeam, 'members' | 'original'>
): boolean =>
  canonicalSnapshot(team.members) !== canonicalSnapshot(team.original.members);

export const WISHLIST_EDITED_ERROR =
  'Wishlist only holds original teams. This team has set edits, so it stays in Saved.';

export const savedTeamHeading = (entry: SavedTeam) =>
  teamHeading(entry.name, entry.origin === 'custom' ? null : entry.original);

export type WinLossRecord = NonNullable<SavedTeam['record']>;

export function recordSummary({ wins, losses }: WinLossRecord): {
  text: string;
  label: string;
  rate: number | null;
} {
  const games = wins + losses;
  const rate = games ? Math.round((wins / games) * 100) : null;
  return {
    text: `${wins}W – ${losses}L${rate === null ? '' : ` · ${rate}%`}`,
    label: `${wins} ${wins === 1 ? 'win' : 'wins'}, ${losses} ${losses === 1 ? 'loss' : 'losses'}${rate === null ? '' : `, ${rate}% win rate`}`,
    rate,
  };
}

const played = ({ record }: SavedTeam) =>
  record ? record.wins + record.losses : 0;
const winRate = (team: SavedTeam) =>
  played(team) ? (team.record?.wins ?? 0) / played(team) : -1;

export function sortByWinRate(teams: SavedTeam[]): SavedTeam[] {
  return [...teams].sort(
    (a, b) => winRate(b) - winRate(a) || played(b) - played(a)
  );
}

export interface GameTally {
  teamId: string;
  wins: number;
  losses: number;
}

export interface ShortcutTeam {
  id: string;
  name: string;
  wins: number;
  losses: number;
}

export function applyGameResults(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  results: GameTally[]
): boolean {
  const tallies = new Map(results.map((result) => [result.teamId, result]));
  let changed = false;
  const raw = JSON.stringify(
    readSavedTeams(storage).map((team) => {
      const tally = tallies.get(team.id);
      if (!tally || !(tally.wins || tally.losses)) return team;
      changed = true;
      const record = team.record ?? { wins: 0, losses: 0 };
      return {
        ...team,
        record: {
          wins: Math.min(9999, record.wins + tally.wins),
          losses: Math.min(9999, record.losses + tally.losses),
        },
      };
    })
  );
  if (!changed) return false;
  readSavedTeams({ getItem: () => raw });
  storage.setItem(storageKey, raw);
  return true;
}

export function shortcutTeam(
  storage: Pick<Storage, 'getItem'>
): ShortcutTeam | null {
  const saved = orderedSaved(readSavedTeams(storage));
  const active = storage.getItem(activeTeamKey);
  const team = saved.find((entry) => entry.id === active) ?? saved[0];
  return team
    ? {
        id: team.id,
        name: savedTeamHeading(team).title,
        ...(team.record ?? { wins: 0, losses: 0 }),
      }
    : null;
}

export const displaySavedTeam = (entry: SavedTeam): Team =>
  ({
    sheetIds: [],
    creator: '',
    publishedAt: '',
    replicaCode: null,
    replicaStatus: '',
    reports: [],
    pasteNotes: null,
    ...entry.original,
    name: entry.name,
    members: entry.members,
  }) as Team;

export class SavedTeamError extends Error {}

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function orderedCollection(
  teams: SavedTeam[],
  orderKey: 'wishlistOrder' | 'savedOrder'
): SavedTeam[] {
  return teams
    .filter((team) => orderKeyOf(team) === orderKey)
    .reverse()
    .sort((a, b) => {
      const rankA = a[orderKey];
      const rankB = b[orderKey];
      if (rankA === undefined) return rankB === undefined ? 0 : -1;
      if (rankB === undefined) return 1;
      return rankA - rankB || compareIds(a.id, b.id);
    });
}

function reorderCollection(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  orderedIds: string[],
  expectedIds: string[],
  orderKey: 'wishlistOrder' | 'savedOrder',
  label: 'Wishlist' | 'Saved'
): SavedTeam[] | null {
  const saved = readSavedTeams(storage);
  const currentIds = orderedCollection(saved, orderKey).map((team) => team.id);
  if (
    currentIds.length !== expectedIds.length ||
    currentIds.some((id, index) => id !== expectedIds[index])
  )
    throw new SavedTeamError(
      `${label} changed elsewhere. Refresh before reordering.`
    );
  const currentIdSet = new Set(currentIds);
  if (
    orderedIds.length !== currentIds.length ||
    new Set(orderedIds).size !== currentIds.length ||
    orderedIds.some((id) => !currentIdSet.has(id))
  )
    throw new SavedTeamError(
      `Could not reorder ${label}. Refresh the list and try again.`
    );
  if (orderedIds.every((id, index) => id === currentIds[index])) return null;
  const ranks = new Map(orderedIds.map((id, index) => [id, index]));
  const raw = JSON.stringify(
    saved.map((team) =>
      orderKeyOf(team) === orderKey
        ? { ...team, [orderKey]: ranks.get(team.id) }
        : team
    )
  );
  const normalized = readSavedTeams({ getItem: () => raw });
  storage.setItem(storageKey, raw);
  return normalized;
}

export function orderedWishlist(teams: SavedTeam[]): SavedTeam[] {
  return orderedCollection(teams, 'wishlistOrder');
}

export function reorderWishlist(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  orderedIds: string[],
  expectedIds: string[]
): SavedTeam[] | null {
  return reorderCollection(
    storage,
    orderedIds,
    expectedIds,
    'wishlistOrder',
    'Wishlist'
  );
}

export function orderedSaved(teams: SavedTeam[]): SavedTeam[] {
  return orderedCollection(teams, 'savedOrder');
}

export function reorderSaved(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  orderedIds: string[],
  expectedIds: string[]
): SavedTeam[] | null {
  return reorderCollection(
    storage,
    orderedIds,
    expectedIds,
    'savedOrder',
    'Saved'
  );
}

const saveAndGet = (
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  team: SavedTeam
): SavedTeam => {
  const saved = saveTeam(storage, team).find((entry) => entry.id === team.id);
  if (!saved)
    throw new SavedTeamError('This team was not saved. Refresh the list.');
  return saved;
};

export function resolveCatalogTeam(
  identity: { id?: string; pasteUrl?: string },
  catalog: Team[]
): Team | undefined {
  const byId = identity.id && catalog.find((team) => team.id === identity.id);
  if (byId) return byId;
  if (!identity.pasteUrl || !isPasteUrl(identity.pasteUrl)) return undefined;
  let match: Team | undefined;
  for (const team of catalog) {
    if (team.pasteUrl !== identity.pasteUrl) continue;
    if (match) return undefined;
    match = team;
  }
  return match;
}

export function wishlistedCatalogEntries(
  saved: SavedTeam[],
  team: Team
): SavedTeam[] {
  const pasteUrl = isPasteUrl(team.pasteUrl) ? team.pasteUrl : '';
  return saved.filter(
    (entry) =>
      entry.collection === 'wishlist' &&
      (entry.original.id === team.id ||
        (pasteUrl !== '' && entry.original.pasteUrl === pasteUrl))
  );
}

export function addCatalogToWishlist(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  team: Team
): SavedTeam {
  const saved = readSavedTeams(storage);
  const existing = wishlistedCatalogEntries(saved, team)[0];
  if (existing) return existing;
  const candidate = { ...newSavedTeam(team), collection: 'wishlist' as const };
  return saveAndGet(storage, candidate);
}

export function addPokepasteToWishlist(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  payload: PokepastePayload,
  currentRegulation: string,
  catalog: Team[]
): SavedTeam {
  const saved = readSavedTeams(storage);
  const existing = saved.find(
    (entry) =>
      entry.collection === 'wishlist' && entry.original.pasteUrl === payload.url
  );
  if (existing) return existing;
  if (catalog.filter((team) => team.pasteUrl === payload.url).length > 1)
    throw new SavedTeamError(
      'Multiple catalog teams use this Poképaste. Open the team from Browse instead.'
    );
  const team = resolveCatalogTeam({ pasteUrl: payload.url }, catalog);
  if (team) return addCatalogToWishlist(storage, team);
  const custom = newCustomTeam(payload.title, currentRegulation, payload.paste);
  return saveAndGet(storage, {
    ...custom,
    collection: 'wishlist',
    original: { ...custom.original, pasteUrl: payload.url },
    sources: [{ name: payload.title, pasteUrl: payload.url }],
  });
}

export function useWishlistedTeam(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  id: string
): SavedTeam {
  const saved = readSavedTeams(storage);
  const entry = saved.find((team) => team.id === id);
  if (!entry)
    throw new SavedTeamError(
      'This Wishlist team is no longer saved. Refresh the list.'
    );
  if (isSavedTeam(entry)) return entry;
  const promoted = { ...entry };
  delete promoted.collection;
  return saveAndGet(storage, promoted);
}

function rejectWishlistCopy(saved: SavedTeam[], latest: SavedTeam) {
  if (
    saved.some(
      (team) =>
        team.id !== latest.id &&
        team.collection === 'wishlist' &&
        (team.original.id === latest.original.id ||
          (latest.original.pasteUrl !== '' &&
            team.original.pasteUrl === latest.original.pasteUrl))
    )
  )
    throw new SavedTeamError(
      'A copy of this team is already in Wishlist. Move or remove that copy first.'
    );
}

export function moveSavedTeamToWishlist(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  id: string,
  baseline: string
): SavedTeam {
  const saved = readSavedTeams(storage);
  const latest = saved.find((team) => team.id === id);
  if (
    !latest ||
    !isSavedTeam(latest) ||
    canonicalSnapshot({ name: latest.name, members: latest.members }) !==
      baseline
  )
    throw new SavedTeamError(
      'This team changed elsewhere. Reopen it before moving it.'
    );
  if (hasSetEdits(latest)) throw new SavedTeamError(WISHLIST_EDITED_ERROR);
  rejectWishlistCopy(saved, latest);
  return saveAndGet(storage, { ...latest, collection: 'wishlist' });
}

export function useCatalogTeam(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  team: Team
): SavedTeam {
  const saved = readSavedTeams(storage);
  const bookmarked = wishlistedCatalogEntries(saved, team);
  if (bookmarked.length > 1)
    throw new SavedTeamError(
      'Multiple copies are in Wishlist. Choose a copy in Wishlist.'
    );
  if (bookmarked[0]) return useWishlistedTeam(storage, bookmarked[0].id);
  const candidate = newSavedTeam(team);
  return saveAndGet(storage, candidate);
}

export function removeWishlistedTeam(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  id: string
): SavedTeam[] {
  const saved = readSavedTeams(storage);
  const entry = saved.find((team) => team.id === id);
  if (!entry) return saved;
  if (entry.collection !== 'wishlist')
    throw new SavedTeamError(
      'This team is no longer in Wishlist. Refresh the list.'
    );
  return deleteTeam(storage, id);
}

export function removeSavedTeam(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  id: string
): SavedTeam[] {
  const saved = readSavedTeams(storage);
  const entry = saved.find((team) => team.id === id);
  if (!entry) return saved;
  if (entry.collection === 'wishlist')
    throw new SavedTeamError(
      'This team is no longer in Saved. Refresh the list.'
    );
  return deleteTeam(storage, id);
}

export function setTeamFavorite(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  id: string,
  favorite: boolean
): SavedTeam {
  const entry = readSavedTeams(storage).find((team) => team.id === id);
  if (!entry || entry.collection === 'wishlist')
    throw new SavedTeamError(
      'This team is no longer in Saved. Refresh the list.'
    );
  const rest = { ...entry };
  delete rest.favorite;
  return saveAndGet(storage, favorite ? { ...rest, favorite: true } : rest);
}

export const favoriteTeams = (teams: SavedTeam[]): SavedTeam[] =>
  orderedSaved(teams).filter((team) => team.favorite);

export function liveSavedTeam(
  storage: Pick<Storage, 'getItem'>,
  id: string
): SavedTeam | null {
  const latest = readSavedTeams(storage).find((team) => team.id === id);
  return latest && isSavedTeam(latest) ? latest : null;
}
