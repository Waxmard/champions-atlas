import { normalize, type Member, type Team } from './catalog.ts';

export type RoleFlag =
  'speed_control' | 'redirection' | 'weather' | 'hazard_control' | 'disruption';

export const ROLE_FLAGS: RoleFlag[] = [
  'speed_control',
  'redirection',
  'weather',
  'hazard_control',
  'disruption',
];

export const ROLE_KEYWORDS: Record<RoleFlag, Set<string>> = {
  speed_control: new Set(
    ['Tailwind', 'Trick Room', 'Icy Wind', 'Thunder Wave', 'Electroweb'].map(
      normalize
    )
  ),
  redirection: new Set(
    ['Follow Me', 'Rage Powder', 'Spotlight', 'Wide Guard', 'Quick Guard'].map(
      normalize
    )
  ),
  weather: new Set(
    [
      'Rain Dance',
      'Sunny Day',
      'Sandstorm',
      'Snowscape',
      'Chilly Reception',
      'Drizzle',
      'Drought',
      'Sand Stream',
      'Snow Warning',
    ].map(normalize)
  ),
  hazard_control: new Set(
    [
      'Stealth Rock',
      'Spikes',
      'Toxic Spikes',
      'Sticky Web',
      'Rapid Spin',
      'Defog',
    ].map(normalize)
  ),
  disruption: new Set(
    [
      'Spore',
      'Sleep Powder',
      'Will-O-Wisp',
      'Encore',
      'Taunt',
      'Fake Out',
      'Parting Shot',
    ].map(normalize)
  ),
};

export function roleFlags(member: Member): RoleFlag[] {
  const names = [member.ability, ...member.moves]
    .filter((name): name is string => Boolean(name))
    .map(normalize);
  return ROLE_FLAGS.filter((role) =>
    names.some((name) => ROLE_KEYWORDS[role].has(name))
  );
}

export interface TeamTag {
  archetype: string;
  speedMode: string;
  roles: Record<string, string>;
}

export interface TeamTagsIndex {
  teams: Record<string, TeamTag>;
}

export function tagsForTeam(
  index: TeamTagsIndex | undefined,
  id: string
): TeamTag | null {
  return index?.teams?.[id] || null;
}

/* Modal tagged slot role, with slots located through the catalog teams. */
export function postalRole(
  pokemon: string,
  teams: Team[],
  index: TeamTagsIndex | undefined
): string | null {
  if (!index) return null;
  const key = normalize(pokemon);
  const counts = new Map<string, number>();
  for (const team of teams) {
    const tag = tagsForTeam(index, team.id);
    if (!tag) continue;
    const slot = team.members.findIndex((m) => normalize(m.pokemon) === key);
    const role = slot < 0 ? undefined : tag.roles[String(slot + 1)];
    if (role) counts.set(role, (counts.get(role) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  return ranked[0]?.[0] ?? null;
}

/* A tagged support posture means helping the partner, which is what the
   redirection and disruption keywords describe. */
export function missingRoles(
  members: Member[],
  teams: Team[],
  index: TeamTagsIndex | undefined
): RoleFlag[] {
  const covered = new Set<RoleFlag>();
  for (const member of members) {
    for (const role of roleFlags(member)) covered.add(role);
    if (postalRole(member.pokemon, teams, index) === 'support') {
      covered.add('redirection');
      covered.add('disruption');
    }
  }
  return ROLE_FLAGS.filter((role) => !covered.has(role));
}

const ROLE_LABELS: Record<string, string> = {
  fast_attacker: 'Fast attacker',
  bulky_attacker: 'Bulky attacker',
  win_condition: 'Win condition',
  support: 'Support',
  other: 'Other',
  speed_control: 'Speed control',
  redirection: 'Redirection',
  weather: 'Weather',
  hazard_control: 'Hazard control',
  disruption: 'Disruption',
};

const ARCHETYPE_LABELS: Record<string, string> = {
  rain: 'Rain',
  sun: 'Sun',
  sand: 'Sand',
  snow: 'Snow',
  trick_room: 'Trick Room',
  tailwind_offense: 'Tailwind offense',
  hyper_offense: 'Hyper offense',
  balance: 'Balance',
  other: 'Other',
};

export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;
export const archetypeLabel = (archetype: string) =>
  ARCHETYPE_LABELS[archetype] ?? archetype;
