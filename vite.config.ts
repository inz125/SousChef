/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
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
