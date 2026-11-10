export const SPREAD = '32 HP / 32 Atk / 1 Def / 1 SpD';
export const set = (pokemon, overrides = {}) => ({
  pokemon,
  item: 'Leftovers',
  ability: 'Intimidate',
  nature: 'Adamant',
  spread: SPREAD,
  moves: ['Fake Out', 'Flare Blitz', 'Knock Off', 'Parting Shot'],
  ...overrides,
});
export const team = (id, members, overrides = {}) => ({
  id,
  name: id,
  regulation: 'M-C',
  publishedAt: '2026-09-01',
  paste: null,
  pasteUrl: '',
  reports: [],
  sheetIds: [],
  creator: '',
  replicaCode: null,
  replicaStatus: '',
  pasteNotes: null,
  members,
  ...overrides,
});
