import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: [
          'favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg',
          'silview.ico',
          'silview-32.png', 'silview-48.png', 'silview-96.png',
          'silview-128.png', 'silview-192.png', 'silview-256.png', 'silview-512.png',
        ],
        manifest: {
          name: '실뷰(SilView) - 이미지 뷰어',
          short_name: '실뷰',
          description: '광고 없는 깔끔한 이미지 뷰어 및 편집 도구',
          theme_color: '#2563EB',
          background_color: '#111827',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/silview.ico',
              sizes: '16x16 32x32 48x48 256x256',
              type: 'image/x-icon',
              purpose: 'any'
            },
            {
              src: '/silview-32.png',
              sizes: '32x32',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/silview-48.png',
              sizes: '48x48',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/silview-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/silview-256.png',
              sizes: '256x256',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/silview-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/silview-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ],
          // File Handler API — allows setting SilView as default image viewer on Windows
          file_handlers: [
            {
              action: '/',
              accept: {
                'image/jpeg':  ['.jpg', '.jpeg'],
                'image/png':   ['.png'],
                'image/gif':   ['.gif'],
                'image/webp':  ['.webp'],
                'image/bmp':   ['.bmp'],
                'image/avif':  ['.avif'],
                'image/tiff':  ['.tiff', '.tif'],
                'image/svg+xml': ['.svg'],
              },
              // launch_type is a newer spec property not yet in plugin types
              ...({ launch_type: 'single-client' } as object),
            }
          ]
        },
        devOptions: {
          enabled: true
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
