import { expect, test, type Page } from '@playwright/test'
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

async function addItemOnline(page: Page) {
  await loginAsNewMember(page)
  const name = `オフライン確認${Date.now()}`
  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(name)
  await page.getByLabel('カテゴリ').selectOption({ label: '乳製品' })
  await page.getByRole('button', { name: '追加する' }).click()
  await expect(page.getByRole('listitem', { name })).toBeVisible()
  return name
}

test('オフラインでも最後に同期した在庫をすぐ閲覧できる（D-17）', async ({ page, context }) => {
  const name = await addItemOnline(page)
  // 在庫を端末に保存させるため、一度読み直す
  await page.reload()
  await expect(page.getByRole('listitem', { name })).toBeVisible()

  await context.setOffline(true)
  // タブを切り替えて在庫画面を読み直させる
  await page.getByRole('link', { name: '献立' }).click()
  await page.getByRole('link', { name: '在庫' }).click()
  await expect(page.getByRole('status', { name: '接続状態' })).toContainText('オフラインです')
  // 通信の再試行を待たずにすぐ表示する（以前は約 7 秒かかった）
  await expect(page.getByRole('listitem', { name })).toBeVisible({ timeout: 2000 })
  await context.setOffline(false)
})

test('オフラインの帯はヘッダー右上のボタンと重ならず、スクロールしても上に残る（D-60）', async ({
  page,
  context,
}) => {
  await loginAsNewMember(page)
  await context.setOffline(true)
  const banner = page.getByRole('status', { name: '接続状態' })
  await expect(banner).toBeVisible()
  const bannerBox = (await banner.boundingBox())!
  for (const name of ['食材を追加', 'レシートを読み込む']) {
    const button = (await page.getByRole('button', { name }).boundingBox())!
    expect(
      button.y + button.height <= bannerBox.y || bannerBox.y + bannerBox.height <= button.y,
    ).toBe(true)
  }

  // 在庫が少なくてもスクロールできるよう一覧を縦に伸ばす。モバイルの WebKit は mouse.wheel に未対応なので scrollTo で動かす
  await page.evaluate(() => {
    document.querySelector('main')!.style.minHeight = '300vh'
    window.scrollTo(0, document.body.scrollHeight)
  })
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await expect(banner).toBeInViewport()
  await context.setOffline(false)
})

test('電波がなくてもアプリを開き直せる（Service Worker）', async ({
  page,
  context,
  browserName,
}) => {
  // Playwright の WebKit は、オフライン状態で Service Worker からページを読み直すと
  // 内部エラーになる（CI で確認）。iOS Safari の実機での動作は公開後に確認する
  test.skip(
    browserName === 'webkit',
    'Playwright の WebKit はオフラインでの Service Worker 経由の読み直しに未対応',
  )

  const name = await addItemOnline(page)
  // Service Worker がアプリ本体をキャッシュし終えるのを待つ
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect(page.getByRole('listitem', { name })).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('status', { name: '接続状態' })).toContainText('オフラインです')
  await expect(page.getByRole('listitem', { name })).toBeVisible({ timeout: 2000 })
  await context.setOffline(false)
})
