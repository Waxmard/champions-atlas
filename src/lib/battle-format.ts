import { z } from 'zod';

export const battleFormats = ['doubles', 'singles'] as const;
export type BattleFormat = (typeof battleFormats)[number];
export interface BattleFormatSetting {
  format: BattleFormat;
  at: number;
}

export const battleFormatKey = 'champions-atlas:battle-format:v1';

export const teamFormat = (team: { format?: unknown }): BattleFormat =>
  team.format === 'singles' ? 'singles' : 'doubles';

const settingSchema = z.object({
  format: z.enum(battleFormats),
  at: z.number(),
});

export function parseBattleFormat(value: unknown): BattleFormatSetting {
  return settingSchema.parse(value);
}

export function readBattleFormat(
  storage: Pick<Storage, 'getItem'>
): BattleFormatSetting {
  try {
    const raw = storage.getItem(battleFormatKey);
    return raw === null
      ? { format: 'doubles', at: 0 }
      : parseBattleFormat(JSON.parse(raw));
  } catch {
    return { format: 'doubles', at: 0 };
  }
}

export function writeBattleFormat(
  storage: Pick<Storage, 'setItem'>,
  setting: BattleFormatSetting
): void {
  storage.setItem(battleFormatKey, JSON.stringify(setting));
}

export const newestBattleFormat = (
  remote: BattleFormatSetting | null,
  local: BattleFormatSetting
): BattleFormatSetting => (remote && remote.at >= local.at ? remote : local);
