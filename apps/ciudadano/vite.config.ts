import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig(({ command, mode, isPreview }) => {
  const android = mode === 'android';
  const bajoEco = !android && (mode === 'eco' || (command === 'serve' && !isPreview));
  const base = bajoEco ? '/eco/' : '/';
  const inicio = bajoEco ? '/eco/index.html' : '/';
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (command === 'build' && !android && !bajoEco && env.VITE_API_ORIGIN?.trim()) {
    throw new Error('La PWA independiente requiere VITE_API_ORIGIN vacío y usa el proxy /api.');
  }
  if (command === 'build' && env.VITE_CLERK_PUBLISHABLE_KEY?.trim() &&
    !/^pk_(test|live)_[A-Za-z0-9+/=]+$/.test(env.VITE_CLERK_PUBLISHABLE_KEY.trim())) {
    throw new Error('VITE_CLERK_PUBLISHABLE_KEY debe ser una clave pública de Clerk.');
  }
  const target = env.VITE_DEV_API_ORIGIN || 'http://127.0.0.1:3000';
  const https = process.env.ECOTRACK_HTTPS === '1' ? {
    key: readFileSync(resolve('.certs/localhost.key')),
    cert: readFileSync(resolve('.certs/localhost.pem')),
  } : undefined;
  if (target) {
    const url = new URL(target);
    if (url.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:')) throw new Error('El proxy de desarrollo requiere HTTPS o localhost.');
  }
  return {
    base,
    appType: 'mpa',
    define: {
      __ANDROID_BUILD__: JSON.stringify(android),
      __PERMITIR_API_LOOPBACK__: JSON.stringify(bajoEco),
    },
    plugins: [react(), ...(!android ? [VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'favicon-32.png', 'favicon-16.png', 'apple-touch-icon.png'],
      manifest: {
        id: base, name: 'EcoTrack Ciudadano', short_name: 'EcoTrack', lang: 'es-MX',
        description: 'Rutas e información del servicio de recolección de Gutiérrez Zamora.',
        start_url: inicio, scope: base, display: 'standalone',
        theme_color: '#0A0F1A', background_color: '#0A0F1A',
        icons: [
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        navigateFallback: base + 'index.html',
        navigateFallbackAllowlist: [bajoEco ? /^\/eco\/(?:index\.html)?$/ : /^\/(?:index\.html)?$/],
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // API, Clerk y tiles no tienen runtime cache: nunca conservar datos privados o tiles sin permiso.
      },
      devOptions: { enabled: false },
    })] : [])],
    build: { outDir: android ? 'dist-android' : bajoEco ? 'dist-eco' : 'dist', sourcemap: false },
    server: {
      port: 5173, strictPort: true, https,
      fs: { deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/.git/**', '**/.certs/**'] },
      proxy: { '/api': { target, changeOrigin: true } },
    },
    preview: { port: 4173, strictPort: true, https, proxy: { '/api': { target, changeOrigin: true } } },
  };
});
