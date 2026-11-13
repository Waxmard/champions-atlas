import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core';
import type { GameTally, ShortcutTeam } from './team-collections.ts';

export interface PushRegistration {
  granted: boolean;
  token?: string;
}

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
  registerPush(options: { authorize: boolean }): Promise<PushRegistration>;
  addListener(
    eventName: 'newTeamsTap',
    listener: () => void
  ): Promise<PluginListenerHandle>;
}

export const isNativeApp = Capacitor.isNativePlatform();
export const AtlasNative = registerPlugin<AtlasNativePlugin>('AtlasNative');
