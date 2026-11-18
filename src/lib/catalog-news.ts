export const notificationSettingsKey = 'champions-atlas:notifications:v1';

export interface NotificationSettings {
  newTeams: boolean;
  newTeamsWithoutEvs: boolean;
  pokemon: string[];
  pokemonWithoutEvs: boolean;
}

export function readNotificationSettings(
  storage: Pick<Storage, 'getItem'>
): NotificationSettings {
  let stored: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(
      storage.getItem(notificationSettingsKey) ?? ''
    );
    stored =
      typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : {};
  } catch {
    stored = {};
  }
  return {
    newTeams: stored.newTeams !== false,
    newTeamsWithoutEvs: stored.newTeamsWithoutEvs !== false,
    pokemon: Array.isArray(stored.pokemon)
      ? stored.pokemon.filter(
          (name): name is string => typeof name === 'string' && name !== ''
        )
      : [],
    pokemonWithoutEvs: stored.pokemonWithoutEvs !== false,
  };
}

export function writeNotificationSettings(
  storage: Pick<Storage, 'setItem'>,
  settings: NotificationSettings
): void {
  storage.setItem(notificationSettingsKey, JSON.stringify(settings));
}
