import { Capacitor, registerPlugin } from '@capacitor/core';

interface AtlasNativePlugin {
  signInWithGoogle(): Promise<{ idToken: string }>;
  signOut(): Promise<void>;
}

export const isNativeApp = Capacitor.isNativePlatform();
export const AtlasNative = registerPlugin<AtlasNativePlugin>('AtlasNative');
