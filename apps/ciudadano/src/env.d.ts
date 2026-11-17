/// <reference types="vite/client" />
declare const __ANDROID_BUILD__: boolean;
declare module 'virtual:pwa-register' {
  export function registerSW(options?: { onNeedRefresh?: () => void; onOfflineReady?: () => void; onRegisterError?: (error: unknown) => void }): (reloadPage?: boolean) => Promise<void>;
}
