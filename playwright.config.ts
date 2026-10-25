import { defineConfig, devices } from '@playwright/test'

const iphone = devices['iPhone 15']

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone-chromium', use: { ...iphone, defaultBrowserType: 'chromium' } },
    // iOS Safari に近い WebKit は CI でのみ実行（ローカル環境には Chromium のみ）
    ...(process.env.CI ? [{ name: 'iphone-webkit', use: { ...iphone } }] : []),
  ],
  // .env.test を読み込み、テスト用 Supabase に接続する開発サーバ（開発用の 5173 とは別ポート）
  webServer: {
    command: 'npx vite --mode test --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: !process.env.CI,
  },
})
