// @ts-expect-error 型定義のない .mjs スクリプト
import { needsTests } from './ci-changes.mjs'

describe('needsTests（統合テスト・E2E が必要な変更か）', () => {
  it('ドキュメントだけの変更なら不要', () => {
    expect(needsTests(['docs/spec.md', 'docs/dev-process.md', 'CLAUDE.md', 'README.md'])).toBe(
      false,
    )
  })

  it('コード・テスト・設定・ワークフローが 1 つでも含まれていれば必要', () => {
    for (const file of [
      'src/App.tsx',
      'src/index.css',
      'tests/e2e/login.spec.ts',
      'supabase/migrations/1_x.sql',
      'supabase/config.toml',
      'package-lock.json',
      '.github/workflows/ci.yml',
      'scripts/test-db.mjs',
      'public/icon.svg',
    ]) {
      expect(needsTests(['docs/spec.md', file])).toBe(true)
    }
  })

  it('変更が分からない（空）なら、安全側に倒して必要とする', () => {
    expect(needsTests([])).toBe(true)
  })
})
