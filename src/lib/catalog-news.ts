export const catalogNewsKey = 'champions-atlas:catalog-news:v1';
export const notificationSettingsKey = 'champions-atlas:notifications:v1';

export interface CatalogNews {
  known: string[];
  fresh: string[];
}

export interface NotificationSettings {
  newTeams: boolean;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

export function readCatalogNews(
  storage: Pick<Storage, 'getItem'>
): CatalogNews | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(catalogNewsKey) ?? '');
    if (
      typeof value === 'object' &&
      value !== null &&
      'known' in value &&
      'fresh' in value &&
      isStringArray(value.known) &&
      isStringArray(value.fresh)
    )
      return { known: value.known, fresh: value.fresh };
  } catch {
    void 0;
  }
  return null;
}

export function nextCatalogNews(
  previous: CatalogNews | null,
  ids: readonly string[],
  newVisit: boolean
): CatalogNews {
  if (!previous) return { known: [...new Set(ids)], fresh: [] };
  const known = new Set(
    newVisit ? [...previous.known, ...previous.fresh] : previous.known
  );
  return { known: [...known], fresh: ids.filter((id) => !known.has(id)) };
}

export function readNotificationSettings(
  storage: Pick<Storage, 'getItem'>
): NotificationSettings {
  try {
    const value: unknown = JSON.parse(
      storage.getItem(notificationSettingsKey) ?? ''
    );
    return {
      newTeams:
        typeof value === 'object' &&
        value !== null &&
        'newTeams' in value &&
        value.newTeams === true,
    };
  } catch {
    return { newTeams: false };
  }
}

export function writeNotificationSettings(
  storage: Pick<Storage, 'setItem'>,
  settings: NotificationSettings
): void {
  storage.setItem(
    notificationSettingsKey,
    JSON.stringify({ newTeams: settings.newTeams })
  );
}
