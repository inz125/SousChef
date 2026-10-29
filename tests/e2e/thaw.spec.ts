import { expect, test, type Page } from '@playwright/test'
import { adminClient } from '../support/supabase'
import { FIRST, loginAsNewMember, routeSuggestMeals, suggestMeals, swipeRow } from './helpers'

async function addMeat(page: Page, name: string) {
  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(name)
  await page.getByLabel('カテゴリ').selectOption({ label: '肉' })
  await page.getByRole('button', { name: '追加する' }).click()
}

test('肉は冷凍で登録され、一部だけ解凍すると冷蔵に「解凍中」の行ができる（D-46, D-47）', async ({
  page,
}) => {
  await loginAsNewMember(page)
  const name = `豚こま肉${Date.now()}`

  // 冷蔵タブで追加しても、肉なら冷凍が初期値になる
  await page.getByRole('tab', { name: '冷蔵' }).click()
  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(name)
  await page.getByLabel('カテゴリ').selectOption({ label: '肉' })
  await expect(page.getByLabel('保存場所')).toHaveValue('freezer')
  await page.getByRole('button', { name: '追加する' }).click()

  await page.getByRole('tab', { name: '冷凍' }).click()
  const frozen = page.getByRole('listitem', { name })
  await swipeRow(page, frozen)
  await frozen.getByRole('button', { name: '解凍' }).click()

  const sheet = page.getByRole('dialog', { name: `${name}を解凍` })
  await sheet.getByRole('button', { name: '一部' }).click()
  await sheet.getByRole('radio', { name: '少ない' }).check()
  await sheet.getByRole('button', { name: '解凍する' }).click()

  await expect(page.getByRole('listitem', { name })).toContainText('少ない')
  await page.getByRole('tab', { name: '冷蔵' }).click()
  const thawing = page.getByRole('listitem', { name })
  await expect(thawing).toContainText('解凍中')
  await expect(thawing).toContainText('あと2日')

  // 再読み込みしても解凍中のまま
  await page.reload()
  await page.getByRole('tab', { name: '冷蔵' }).click()
  await expect(page.getByRole('listitem', { name })).toContainText('解凍中')
})

test('18 時以降は在庫画面に解凍の勧めが出て、そこから解凍できる（D-48）', async ({ page }) => {
  // 1 世帯で在庫を共有するので、他のテストが残した解凍中の肉を消してから確かめる
  await adminClient().from('inventory_items').delete().not('thawed_on', 'is', null)
  // 前日の 19 時に固定する（未来の時刻にするとログインのセッションが期限切れに見えるため）
  // ブラウザは日本時間（playwright.config.ts）なので、日本時間の前日 19 時にする
  const yesterday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(
    Date.now() - 86_400_000,
  )
  const evening = new Date(`${yesterday}T19:00:00+09:00`)
  await page.clock.setFixedTime(evening)
  await loginAsNewMember(page)
  const name = `牛こま肉${Date.now()}`
  await addMeat(page, name)

  const banner = page.getByRole('region', { name: '解凍の勧め' })
  await expect(banner).toContainText('明日の肉を解凍しませんか？')
  await banner.getByRole('button', { name: `${name}を解凍` }).click()
  const sheet = page.getByRole('dialog', { name: `${name}を解凍` })
  await sheet.getByRole('button', { name: '全部' }).click()
  await sheet.getByRole('button', { name: '解凍する' }).click()

  await expect(banner).toHaveCount(0)
  await page.getByRole('tab', { name: '冷蔵' }).click()
  await expect(page.getByRole('listitem', { name })).toContainText('解凍中')
})

test('冷凍の肉を使うレシピには「冷凍・要解凍」の印と解凍の案内が出る（D-49）', async ({ page }) => {
  // モックの献立は「鶏もも肉」を使う。他のテストが残した冷蔵の鶏もも肉があると印が付かないので消す
  await adminClient().from('inventory_items').delete().like('name', '%鶏もも肉%')
  await routeSuggestMeals(page)
  await loginAsNewMember(page)
  const name = `鶏もも肉${Date.now()}`
  await addMeat(page, name)

  await page.getByRole('link', { name: '献立' }).click()
  await suggestMeals(page)
  const card = page.getByRole('article', { name: FIRST })
  await expect(card).toContainText('冷凍・要解凍')
  await card.getByRole('button', { name: 'レシピを見る' }).click()

  const recipe = page.getByRole('dialog', { name: '鶏もも肉の照り焼き' })
  const notice = recipe.getByRole('region', { name: '解凍の案内' })
  await expect(notice).toContainText(`冷凍の ${name} を使います`)
  await expect(recipe.getByRole('listitem').filter({ hasText: '1 枚（300g）' })).toContainText(
    '冷凍・要解凍',
  )
  await notice.getByRole('button', { name: `${name}を解凍` }).click()
  const sheet = page.getByRole('dialog', { name: `${name}を解凍` })
  await sheet.getByRole('button', { name: '全部' }).click()
  await sheet.getByRole('button', { name: '解凍する' }).click()

  await expect(notice).toHaveCount(0)
  await expect(recipe).not.toContainText('冷凍・要解凍')
})

test('編集画面から一部を解凍すると、編集画面も閉じる（D-47）', async ({ page }) => {
  await loginAsNewMember(page)
  const name = `牛ひき肉${Date.now()}`
  await addMeat(page, name)

  await page.getByRole('button', { name: `${name}を編集` }).click()
  await page.getByRole('button', { name: '解凍' }).click()
  const sheet = page.getByRole('dialog', { name: `${name}を解凍` })
  await sheet.getByRole('button', { name: '一部' }).click()
  await sheet.getByRole('button', { name: '解凍する' }).click()

  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('form', { name: '食材を編集' })).toHaveCount(0)
  await expect(page.getByRole('listitem', { name })).toHaveCount(2)
})
