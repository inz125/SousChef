// @ts-expect-error 型定義のない .mjs スクリプト
import { toTestConfig } from './test-db.mjs'

describe('toTestConfig', () => {
  const dev = [
    'project_id = "SousChef"',
    '[api]',
    'port = 54321',
    '[db]',
    'port = 54322',
    'shadow_port = 54320',
    'inspector_port = 8083',
    'site_url = "http://127.0.0.1:5173"',
    'jwt_expiry = 3600',
  ].join('\n')

  it('プロジェクト名とポートをテスト用に変え、他の設定は変えない', () => {
    expect(toTestConfig(dev)).toBe(
      [
        'project_id = "SousChef-test"',
        '[api]',
        'port = 54421',
        '[db]',
        'port = 54422',
        'shadow_port = 54420',
        'inspector_port = 8183',
        'site_url = "http://127.0.0.1:5174"',
        'jwt_expiry = 3600',
      ].join('\n'),
    )
  })

  it('実際の設定ファイルに開発用ポートが残らない', async () => {
    const { readFileSync } = await import('node:fs')
    const generated = toTestConfig(readFileSync('supabase/config.toml', 'utf8'))
    expect(generated).not.toMatch(/\b543\d\d\b/)
    expect(generated).not.toMatch(/:5173\b/)
  })
})
