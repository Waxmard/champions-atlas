import { Capacitor, registerPlugin } from '@capacitor/core';

interface AtlasNativePlugin {
  signInWithGoogle(): Promise<{ idToken: string }>;
  signOut(): Promise<void>;
  getPendingShares(): Promise<{
    shares: Array<{ id: string; url: string; createdAt: number }>;
  }>;
  acknowledgeShare(options: { id: string }): Promise<void>;
}

export const isNativeApp = Capacitor.isNativePlatform();
export const AtlasNative = registerPlugin<AtlasNativePlugin>('AtlasNative');
