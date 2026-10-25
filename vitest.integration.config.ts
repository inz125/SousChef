import { defineConfig } from 'vitest/config'

// Supabase ローカル環境（npx supabase start）に対する統合テスト
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    globals: true,
    globalSetup: ['./tests/support/global-setup.ts'],
    environment: 'node',
    fileParallelism: false,
  },
})
