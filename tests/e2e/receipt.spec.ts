import { expect, test } from '@playwright/test'
import { adminClient } from '../support/supabase'
import { loginAsNewMember, routeReadReceipt } from './helpers'

// 8x8 の PNG。ブラウザで縮小して JPEG にする処理まで通す
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGP4jwMwDC0JALoev0Ewkwr8AAAAAElFTkSuQmCC',
  'base64',
)

test('レシートを撮ると、確認画面で直してから在庫に登録できる', async ({ page }) => {
  await routeReadReceipt(page)
  await loginAsNewMember(page)
  // テスト用 DB は実行をまたいで残るので、「牛乳」の件数は DB で数えて登録の前後で比べる。
  // 画面で数えると、自分の追加が表示される前の件数を数えてしまうことがある（CI で起きた）
  const before = await countMilk()

  // モックのレシートには「牛乳」が載っている。先に在庫に入れておく
  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill('牛乳')
  await page.getByLabel('カテゴリ').selectOption({ label: '乳製品' })
  await page.getByRole('button', { name: '追加する' }).click()
  // 名前は完全一致で数える（「牛乳-repo」など他のテストの食材を含めない）
  const milk = page.getByRole('listitem', { name: '牛乳', exact: true })
  await expect(milk).toHaveCount(before + 1)

  await page.getByLabel('レシートの写真').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: PNG,
  })

  const dialog = page.getByRole('dialog', { name: 'レシートの食材' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('group', { name: '牛乳' })).toContainText('在庫あり')
  // 肉は冷凍が初期値（D-46）
  await expect(dialog.getByRole('group', { name: '鶏むね肉' }).getByLabel('保存場所')).toHaveValue(
    'freezer',
  )

  // 1 件のチェックを外して登録する
  await dialog.getByRole('checkbox', { name: '冷凍餃子を登録する' }).uncheck()
  await dialog.getByRole('button', { name: '登録する（2 件）' }).click()

  await expect(page.getByRole('status', { name: 'お知らせ' })).toHaveText(
    '2 件を在庫に登録しました',
  )
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('listitem', { name: '鶏むね肉', exact: true }).first()).toBeVisible()
  // 既存の「牛乳」は新しい行を作らず更新される
  expect(await countMilk()).toBe(before + 1)
  await expect(milk).toHaveCount(before + 1)
})

async function countMilk() {
  const { count, error } = await adminClient()
    .from('inventory_items')
    .select('id', { count: 'exact', head: true })
    .eq('name', '牛乳')
  if (error) throw error
  return count ?? 0
}
