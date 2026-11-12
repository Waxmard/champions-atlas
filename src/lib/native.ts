import { Capacitor, registerPlugin } from '@capacitor/core';
import type { GameTally, ShortcutTeam } from './team-collections.ts';

interface AtlasNativePlugin {
  signInWithGoogle(): Promise<{ idToken: string }>;
  signOut(): Promise<void>;
  getPendingShares(): Promise<{
    shares: Array<{ id: string; url: string; createdAt: number }>;
  }>;
  acknowledgeShare(options: { id: string }): Promise<void>;
  setActiveTeam(options: { team: ShortcutTeam | null }): Promise<void>;
  getPendingResults(): Promise<{ results: GameTally[] }>;
  acknowledgeResults(options: { results: GameTally[] }): Promise<void>;
}

export const isNativeApp = Capacitor.isNativePlatform();
export const AtlasNative = registerPlugin<AtlasNativePlugin>('AtlasNative');
