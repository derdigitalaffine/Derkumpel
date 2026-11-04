import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'derkumpel-logo-v2.png',
        'derkumpel-icon-192-v2.png',
        'derkumpel-icon-512-v2.png',
        'derkumpel-icon-maskable-512-v2.png',
        'favicon-32-v2.png',
        'favicon-64-v2.png',
        'apple-touch-icon-v2.png',
      ],
      manifest: {
        id: '/',
        name: 'DerKumpel',
        short_name: 'DerKumpel',
        description: 'Offline-fähiger mobiler Redmine-Client für den Bauhof',
        theme_color: '#1c5d99',
        background_color: '#f8f9fa',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          { src: '/derkumpel-icon-192-v2.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/derkumpel-icon-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/derkumpel-icon-maskable-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/sgx\.geodatenzentrum\.de\/wmts_basemapde\/tile\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'derkumpel-map',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:8080' } },
});
