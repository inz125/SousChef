import { startMockClaude } from './mockClaude'
import { setupTestSupabaseEnv } from './supabase'

export default async function globalSetup() {
  setupTestSupabaseEnv()
  // 返り値の関数はテスト終了時に呼ばれ、モックサーバを止める
  return startMockClaude()
}
