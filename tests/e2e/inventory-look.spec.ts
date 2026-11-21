import { expect, test, type Page } from '@playwright/test'
import { loginAsNewMember } from './helpers'

/** 日本時間の今日から days 日後（YYYY-MM-DD） */
function tokyoDate(days = 0) {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(d)
}

async function addItem(
  page: Page,
  { name, category, expiresOn }: { name: string; category: string; expiresOn?: string },
) {
  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(name)
  await page.getByLabel('カテゴリ').selectOption({ label: category })
  if (expiresOn) await page.getByLabel('期限').fill(expiresOn)
  await page.getByRole('button', { name: '追加する' }).click()
  await expect(page.getByRole('listitem', { name, exact: true })).toBeVisible()
}

test('在庫のアイコンの下は 1 行の期限と状態の行で、どの食材も同じ高さ（D-75）', async ({
  page,
}) => {
  await loginAsNewMember(page)
  const stamp = Date.now()
  const estimated = `しめじ${stamp}`
  const manual = `キャベツ${stamp}`
  await addItem(page, { name: estimated, category: 'きのこ' })
  await addItem(page, { name: manual, category: '葉野菜', expiresOn: tokyoDate(10) })

  const est = page.getByRole('listitem', { name: estimated, exact: true })
  const man = page.getByRole('listitem', { name: manual, exact: true })
  const [, month, day] = tokyoDate(10).split('-').map(Number)
  // 期限は「まで」を付けず 1 行。「（目安）」の文字は見えない
  await expect(man.locator('.tile-expiry')).toHaveText(`${month}/${day}`)
  await expect(est.locator('.tile-expiry')).not.toContainText('まで')
  // 「目安」は読み上げにだけ伝え、画面には出さない（1px に縮めて切り取る）
  const hidden = (await est.getByText('目安').boundingBox())!
  expect(hidden.width).toBeLessThanOrEqual(1)
  // 目安は薄い色、手入力は濃い色
  const color = (l: typeof est) =>
    l.locator('.tile-expiry').evaluate((e) => getComputedStyle(e).color)
  expect(await color(est)).not.toBe(await color(man))

  // 「少ない」の食材とそうでない食材のタイルの高さがそろう
  await page.getByRole('button', { name: manual, exact: true }).click()
  await page.getByRole('radiogroup', { name: '量' }).getByRole('radio', { name: '少ない' }).check()
  await page.getByRole('button', { name: '保存する' }).click()
  await expect(man).toContainText('少ない')
  const height = async (l: typeof est) => (await l.boundingBox())!.height
  expect(await height(man)).toBe(await height(est))
})

test('入力画面の保存場所・量はボタンで選び、期限はボタンで入れられる（D-79）', async ({ page }) => {
  await loginAsNewMember(page)
  const name = `にんじん${Date.now()}`
  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(name)
  await page.getByLabel('カテゴリ').selectOption({ label: '根菜・いも' })
  const place = page.getByRole('radiogroup', { name: '保存場所' })
  await place.getByRole('radio', { name: '野菜室' }).check()
  await expect(place.getByRole('radio', { name: '野菜室' })).toBeChecked()
  await expect(page.getByRole('radiogroup', { name: '量' })).toHaveCount(0)

  await page.getByRole('button', { name: '+1週間' }).click()
  await expect(page.getByLabel('期限')).toHaveValue(tokyoDate(7))
  await expect(page.getByText('推定した目安です')).toHaveCount(0)
  await page.getByRole('button', { name: '+3日' }).click()
  await expect(page.getByLabel('期限')).toHaveValue(tokyoDate(3))
  await page.getByRole('button', { name: '追加する' }).click()

  const tile = page.getByRole('listitem', { name, exact: true })
  await expect(tile).toBeVisible()
  await page.getByRole('tab', { name: '野菜室' }).click()
  await expect(tile).toBeVisible()
  await expect(tile.getByText('目安')).toHaveCount(0)
})

test('在庫の切替は食品庫と買い物の間に区切りがあり、幅 375px でも 1 行に収まる（D-83）', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await loginAsNewMember(page)
  const tabs = page.getByRole('tablist')
  const shopping = page.getByRole('tab', { name: '買い物' })
  await expect(shopping.locator('svg')).toBeVisible()
  await expect(tabs.locator('.tab-divider')).toBeVisible()
  // 1 行に収まる（どのタブも同じ高さの位置にあり、文字が切れない）
  const all = await tabs.getByRole('tab').all()
  const tops = await Promise.all(all.map(async (t) => (await t.boundingBox())!.y))
  expect(new Set(tops).size).toBe(1)
  for (const t of all) {
    expect(await t.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true)
  }
})
