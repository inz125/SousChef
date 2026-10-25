// @ts-expect-error 型定義のない .mjs スクリプト
import { checkPublicConfig } from './check-public-config.mjs'

const ref = 'mkfyavfbinoprzwdxglv'
const ok = {
  url: `https://${ref}.supabase.co`,
  anonKey: 'sb_publishable_PjM1tQZhUhf69OiUY-6DXA_eiyYqKmR',
  projectRef: ref,
}

describe('checkPublicConfig（公開前の画面用の設定の確認）', () => {
  it('正しい組み合わせなら問題なし', () => {
    expect(checkPublicConfig(ok)).toEqual([])
  })

  it('旧形式の anon キー（JWT）でも問題なし', () => {
    expect(
      checkPublicConfig({ ...ok, anonKey: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig' }),
    ).toEqual([])
  })

  it('VITE_SUPABASE_URL にキーが入っていたら指摘する（実際に起きた間違い）', () => {
    const problems = checkPublicConfig({ ...ok, url: ok.anonKey }).join()
    expect(problems).toMatch(/VITE_SUPABASE_URL/)
    expect(problems).toMatch(`https://${ref}.supabase.co`)
  })

  it('URL が別のプロジェクトを指していたら指摘する', () => {
    expect(
      checkPublicConfig({ ...ok, url: 'https://otherprojectrefxxxxx.supabase.co' }).join(),
    ).toMatch(/SUPABASE_PROJECT_REF と一致しません/)
  })

  it('末尾のスラッシュは許す', () => {
    expect(checkPublicConfig({ ...ok, url: `${ok.url}/` })).toEqual([])
  })

  it('VITE_SUPABASE_ANON_KEY に URL や秘密鍵が入っていたら指摘する', () => {
    expect(checkPublicConfig({ ...ok, anonKey: ok.url }).join()).toMatch(/VITE_SUPABASE_ANON_KEY/)
    // 秘密鍵は画面に埋め込むと誰でも読めてしまう
    expect(checkPublicConfig({ ...ok, anonKey: 'sb_secret_abcdef' }).join()).toMatch(/秘密鍵/)
  })

  it('前後の空白や改行を指摘する', () => {
    expect(checkPublicConfig({ ...ok, url: `${ok.url}\n` }).join()).toMatch(/空白や改行/)
  })
})
