import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/alisveris-listesi-ve-fiyat-takibi/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Alışveriş Listesi ve Fiyat Takibi',
        short_name: 'FiyatHafızası',
        description: 'Çevrimdışı çalışan yerel alışveriş listesi ve çoklu market fiyat takip uygulaması',
        theme_color: '#059669',
        background_color: '#f8fafc',
        display: 'standalone',
        lang: 'tr',
        start_url: '/alisveris-listesi-ve-fiyat-takibi/',
        scope: '/alisveris-listesi-ve-fiyat-takibi/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      }
    })
  ]
});
