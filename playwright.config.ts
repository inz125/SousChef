import { defineConfig, devices } from '@playwright/test'

const iphone = devices['iPhone 15']

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone-chromium', use: { ...iphone, defaultBrowserType: 'chromium' } },
    // iOS Safari に近い WebKit は CI でのみ実行（ローカル環境には Chromium のみ）
    ...(process.env.CI ? [{ name: 'iphone-webkit', use: { ...iphone } }] : []),
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
})
