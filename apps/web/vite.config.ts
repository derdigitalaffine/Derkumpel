import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['derkumpel.svg'],
      manifest: {
        name: 'Derkumpel',
        short_name: 'Derkumpel',
        description: 'Offline-fähiger mobiler Redmine-Client für den Bauhof',
        theme_color: '#1c5d99',
        background_color: '#f8f9fa',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [{ src: '/derkumpel.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/sgx\.geodatenzentrum\.de\/gdz_basemapde_vektor\//,
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
