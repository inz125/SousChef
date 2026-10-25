// テスト専用のローカル Supabase を操作する。開発用（supabase/）とは別のコンテナ・ポート・データを使う。
// 設定は supabase/config.toml から生成し、マイグレーションとメールテンプレートはコマンドごとにコピーする。
//
//   node scripts/test-db.mjs start | stop | status -o json | db reset ...
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const TEST_WORKDIR = resolve(import.meta.dirname, '..', '.test-supabase')
const SOURCE = resolve(import.meta.dirname, '..', 'supabase')
const target = join(TEST_WORKDIR, 'supabase')

/** 開発用の 543xx → テスト用の 544xx、開発サーバ 5173 → 5174 */
export function toTestConfig(config) {
  return config
    .replace(/^project_id = "(.+)"$/m, 'project_id = "$1-test"')
    .replace(/\b543(\d\d)\b/g, '544$1')
    .replace(/inspector_port = 8083/, 'inspector_port = 8183')
    .replace(/127\.0\.0\.1:5173/g, '127.0.0.1:5174')
}

function generate() {
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  writeFileSync(
    join(target, 'config.toml'),
    `# 自動生成（scripts/test-db.mjs）。編集は supabase/config.toml に\n` +
      toTestConfig(readFileSync(join(SOURCE, 'config.toml'), 'utf8')),
  )
  for (const dir of ['migrations', 'templates']) {
    cpSync(join(SOURCE, dir), join(target, dir), { recursive: true })
  }
}

if (import.meta.main) {
  generate()
  const result = spawnSync(
    'npx',
    ['supabase', ...process.argv.slice(2), '--workdir', TEST_WORKDIR],
    {
      stdio: 'inherit',
    },
  )
  process.exit(result.status ?? 1)
}
