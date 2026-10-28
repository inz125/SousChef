/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // ホーム画面に追加できる PWA（D-04）。オフラインでもアプリ本体を開けるよう Service Worker でキャッシュする（D-17）
    // 新しいバージョンは自動で再読み込みせず、帯の「更新」で反映する（D-52。src/update/pwaUpdater.ts で登録）
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'SousChef',
        short_name: 'SousChef',
        description: '冷蔵庫と食品庫の在庫から献立を提案するアプリ',
        lang: 'ja',
        start_url: '/',
        display: 'standalone',
        background_color: '#f2f2f7',
        theme_color: '#34a853',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 画面遷移はすべてアプリ本体（index.html）で処理する
        navigateFallback: '/index.html',
      },
    }),
  ],
  test: {
    globals: true,
    // 日本時間で動かし、UTC とのずれによる日付バグを検出できるようにする
    env: { TZ: 'Asia/Tokyo' },
    // 実行順に依存するテストを検出するため、毎回ランダムな順で実行する
    sequence: { shuffle: true },
    projects: [
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['scripts/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
        },
      },
    ],
  },
})
