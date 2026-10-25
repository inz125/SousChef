// @ts-expect-error 型定義のない .mjs スクリプト
import { checkDbUrl } from './check-db-url.mjs'

const ok =
  'postgresql://postgres.abcdefghijklmnopqrst:s3cretPass@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'

describe('checkDbUrl（公開前の SUPABASE_DB_URL の確認）', () => {
  it('Session pooler の正しい接続文字列なら問題なし', () => {
    expect(checkDbUrl(ok)).toEqual([])
  })

  it('記号を URL 用に変換したパスワードは問題なし', () => {
    expect(checkDbUrl(ok.replace('s3cretPass', 'p%40ss%23word'))).toEqual([])
  })

  it('[YOUR-PASSWORD] の角かっこが残っていたら指摘する', () => {
    expect(checkDbUrl(ok.replace('s3cretPass', '[s3cretPass]')).join()).toMatch(/角かっこ/)
  })

  it('パスワードの記号が変換されていなければ指摘する', () => {
    for (const raw of ['p@ss', 'pa#ss', 'pa/ss', 'pa?ss', 'pa%ss']) {
      expect(checkDbUrl(ok.replace('s3cretPass', raw)).join(), raw).toMatch(/記号/)
    }
  })

  it('前後の空白や改行が入っていたら指摘する', () => {
    expect(checkDbUrl(` ${ok}\n`).join()).toMatch(/空白や改行/)
  })

  it('Direct connection（db.xxx.supabase.co）なら Session pooler を使うよう指摘する', () => {
    expect(
      checkDbUrl(
        'postgresql://postgres:pass@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
      ).join(),
    ).toMatch(/Session pooler/)
  })

  it('Transaction pooler（ポート 6543）なら 5432 を使うよう指摘する', () => {
    expect(checkDbUrl(ok.replace(':5432/', ':6543/')).join()).toMatch(/5432/)
  })

  it('指摘にパスワードそのものは含めない', () => {
    const messages = checkDbUrl(ok.replace('s3cretPass', '[p@ss#word]')).join()
    expect(messages).not.toContain('p@ss#word')
  })
})
