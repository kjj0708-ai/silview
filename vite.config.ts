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
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
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
              src: '/new-icon.png',
              sizes: '500x500',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/new-icon.png',
              sizes: '500x500',
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
