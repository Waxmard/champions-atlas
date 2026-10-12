import { matchesTeam, type Member, type Team } from '../src/lib/catalog.ts';

const members: Member[] = [
  {
    pokemon: 'Garchomp',
    item: 'Haban Berry',
    ability: 'Rough Skin',
    nature: 'Adamant',
    moves: ['Rock Slide', 'Dragon Rush', 'Stomping Tantrum', 'Protect'],
    spread: null,
  },
  {
    pokemon: 'Delphox-Mega',
    item: 'Delphoxite',
    ability: 'Blaze',
    nature: 'Modest',
    moves: ['Heat Wave', 'Psychic', 'Protect', 'Substitute'],
    spread: null,
  },
  {
    pokemon: 'Lopunny-Mega',
    item: 'Lopunnite',
    ability: 'Limber',
    nature: 'Jolly',
    moves: ['Close Combat', 'Triple Axel', 'Protect', 'Fake Out'],
    spread: null,
  },
  {
    pokemon: 'Klefki',
    item: 'Light Clay',
    ability: 'Prankster',
    nature: 'Bold',
    moves: ['Light Screen', 'Reflect', 'Dazzling Gleam', 'Sunny Day'],
    spread: null,
  },
  {
    pokemon: 'Slowking-Galar',
    item: 'Sitrus Berry',
    ability: 'Regenerator',
    nature: 'Sassy',
    moves: ['Sludge Bomb', 'Protect', 'Trick Room', 'Chilly Reception'],
    spread: null,
  },
  {
    pokemon: 'Sylveon',
    item: 'Fairy Feather',
    ability: 'Pixilate',
    nature: 'Modest',
    moves: ['Hyper Voice', 'Hyper Beam', 'Quick Attack', 'Protect'],
    spread: null,
  },
].map((member) => ({
  ...member,
  set: `${member.pokemon} @ ${member.item}\nAbility: ${member.ability}\n${member.nature} Nature\n${member.moves.map((move) => `- ${move}`).join('\n')}`,
}));

export const customRulesTeam: Team = {
  id: 'poch-tournament-6ab431f2e905c1db68748c9c-1',
  sheetIds: [],
  name: "Duckoooo — Mudkip's Marsh Pit #6",
  creator: 'Duckoooo',
  regulation: 'M-C',
  publishedAt: '2026-10-04',
  pasteUrl: '',
  replicaCode: null,
  replicaStatus: '',
  pasteNotes: null,
  reports: [
    {
      event: "Mudkip's Marsh Pit #6",
      rank: '1st',
      sourceUrl: 'https://poch.ms/en/leaderboard',
      entrants: 40,
    },
    {
      event: 'Poch.ms collection',
      rank: '',
      sourceUrl: 'https://poch.ms/en/leaderboard',
    },
  ],
  members,
  paste: members.map((member) => member.set).join('\n\n'),
};

export function withE2eCatalog<
  T extends { currentRegulation: string; teams: Team[] },
>(catalog: T): T {
  const filters = customRulesTeam.members.map(({ pokemon }) => ({
    pokemon,
    item: '',
    ability: '',
    move: '',
  }));
  return {
    ...catalog,
    teams: [
      ...catalog.teams.filter(
        (team) => team.id !== customRulesTeam.id && !matchesTeam(team, filters)
      ),
      { ...customRulesTeam, regulation: catalog.currentRegulation },
    ],
  };
}
