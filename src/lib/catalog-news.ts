export const notificationSettingsKey = 'champions-atlas:notifications:v1';

export interface NotificationSettings {
  newTeams: boolean;
}

export function readNotificationSettings(
  storage: Pick<Storage, 'getItem'>
): NotificationSettings {
  try {
    const value: unknown = JSON.parse(
      storage.getItem(notificationSettingsKey) ?? ''
    );
    return {
      newTeams: !(
        typeof value === 'object' &&
        value !== null &&
        'newTeams' in value &&
        value.newTeams === false
      ),
    };
  } catch {
    return { newTeams: true };
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
