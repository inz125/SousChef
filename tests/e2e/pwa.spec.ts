import { expect, test } from '@playwright/test'
import { loginAsNewMember } from './helpers'

test('ホーム画面に追加できる PWA としての情報を持つ', async ({ page, request }) => {
  await page.goto('/')
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  const manifest = await (await request.get(manifestHref!)).json()
  expect(manifest).toMatchObject({
    name: 'SousChef',
    short_name: 'SousChef',
    display: 'standalone',
    lang: 'ja',
    start_url: '/',
  })
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  )

  // iPhone の「ホーム画面に追加」用
  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
  expect((await request.get(touchIcon!)).headers()['content-type']).toBe('image/png')
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes',
  )
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/,
  )
})

test('電波がなくても開き直せて、最後に同期した在庫を閲覧できる（D-17）', async ({
  page,
  context,
}) => {
  await loginAsNewMember(page)
  const name = `オフライン確認${Date.now()}`
  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(name)
  await page.getByLabel('カテゴリ').selectOption({ label: '乳製品' })
  await page.getByRole('button', { name: '追加する' }).click()
  await expect(page.getByRole('listitem', { name })).toBeVisible()

  // Service Worker がアプリ本体をキャッシュし終えるのを待つ
  await page.evaluate(() => navigator.serviceWorker.ready)
  // 在庫を端末に保存させるため、一度読み直す
  await page.reload()
  await expect(page.getByRole('listitem', { name })).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('status', { name: '接続状態' })).toContainText('オフラインです')
  // 通信の再試行を待たずにすぐ表示する（以前は約 7 秒かかった）
  await expect(page.getByRole('listitem', { name })).toBeVisible({ timeout: 2000 })
  await context.setOffline(false)
})
