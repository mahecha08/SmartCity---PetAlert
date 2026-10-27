import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon.svg',
        'apple-touch-icon-180x180.png',
        'pwa-64x64.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'maskable-icon-512x512.png'
      ],
      manifest: {
        name: 'PetAlert',
        short_name: 'PetAlert',
        description: 'Plataforma ciudadana de identificación de mascotas',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // No cachear llamadas a la API ni modelos de TensorFlow.js
            urlPattern: ({ url }) => {
              const isApi = url.pathname.startsWith('/api');
              const isTfModel =
                url.hostname.includes('storage.googleapis.com') ||
                url.hostname.includes('tfhub.dev') ||
                url.hostname.includes('kaggle.com') ||
                url.pathname.includes('model.json') ||
                url.pathname.endsWith('.bin');
              return isApi || isTfModel;
            },
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ]
})
