declare global {
  const __LOCAL_IMAGE_ASSETS__: Readonly<Record<string, true>>;

  interface ImportMetaEnv {
    readonly VITE_FIREBASE_API_KEY?: string;
    readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
    readonly VITE_FIREBASE_PROJECT_ID?: string;
    readonly VITE_FIREBASE_APP_ID?: string;
    readonly VITE_BUILD_ID?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  namespace App {
    interface PageState {
      fromCatalog?: boolean;
    }
  }
}

export {};
