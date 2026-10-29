import { expect, test } from '@playwright/test'
import { deleteItem, loginAsNewMember, openItemMenu } from './helpers'

test('食材を追加し、長押しメニューで量を切り替え、削除して元に戻せる', async ({ page }) => {
  await loginAsNewMember(page)
  const name = `豚バラ肉${Date.now()}`

  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(name)
  await page.getByLabel('カテゴリ').selectOption({ label: '肉' })
  await page.getByLabel('保存場所').selectOption({ label: '冷蔵' })
  await expect(page.getByLabel('期限')).not.toHaveValue('')
  await page.getByRole('button', { name: '追加する' }).click()

  const tile = page.getByRole('listitem', { name, exact: true })
  await expect(tile).toContainText('目安')

  // 量は長押しメニューで切り替え、「少ない」のときだけ印が出る（D-41・D-56）
  await expect(tile).not.toContainText('少ない')
  await (await openItemMenu(page, name)).getByRole('button', { name: '少ないにする' }).click()
  await expect(tile).toContainText('少ない')

  // 冷凍タブには出ない
  await page.getByRole('tab', { name: '冷凍' }).click()
  await expect(tile).toHaveCount(0)
  await page.getByRole('tab', { name: '冷蔵' }).click()

  await deleteItem(page, name)
  await expect(tile).toHaveCount(0)
  await page.getByRole('button', { name: '元に戻す' }).click()
  await expect(tile).toBeVisible()

  // 再読み込みしても残っている（サーバに保存されている）
  await page.reload()
  await expect(page.getByRole('listitem', { name, exact: true })).toContainText('少ない')
})

test('食材のイラストを出し、イラストのない食材は「作成中」にして設定画面に並べる（D-56）', async ({
  page,
}) => {
  await loginAsNewMember(page)
  const pending = `ズッキーニ${Date.now()}`
  for (const [name, category] of [
    ['たまご', '卵'],
    [pending, '根菜・いも'],
  ]) {
    await page.getByRole('button', { name: '食材を追加' }).click()
    await page.getByLabel('食材名').fill(name)
    await page.getByLabel('カテゴリ').selectOption({ label: category })
    await page.getByRole('button', { name: '追加する' }).click()
  }

  // 他のテストの「たまご」が残っていることもあるので先頭で確かめる
  const egg = page.getByRole('listitem', { name: 'たまご', exact: true }).first()
  await expect(egg.locator('img')).toBeVisible()
  await expect(egg).not.toContainText('作成中')
  const zucchini = page.getByRole('listitem', { name: pending, exact: true })
  await expect(zucchini).toContainText('作成中')
  await expect(zucchini.locator('img')).toHaveCount(0)

  await page.getByRole('link', { name: '設定' }).click()
  const waiting = page.getByRole('region', { name: 'イラスト待ち' })
  await expect(waiting.getByRole('listitem').filter({ hasText: pending })).toBeVisible()
  await expect(waiting.getByRole('listitem').filter({ hasText: 'たまご' })).toHaveCount(0)
})

test('長押しメニューはホーム画面のように食材の近くに出て、外のタップで閉じる（D-59）', async ({
  page,
}) => {
  await loginAsNewMember(page)
  const name = `卵${Date.now()}`
  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(name)
  await page.getByLabel('カテゴリ').selectOption({ label: '卵' })
  await page.getByRole('button', { name: '追加する' }).click()

  const menu = await openItemMenu(page, name)
  await expect(menu.getByRole('button')).toHaveText(['少ないにする', '削除'])

  // 食材のすぐ下に出て、画面の左右 16px より外に出ない
  const tile = (await page.getByRole('button', { name, exact: true }).boundingBox())!
  const box = (await menu.boundingBox())!
  const width = page.viewportSize()!.width
  expect(box.y).toBeGreaterThan(tile.y + 40)
  expect(box.x).toBeGreaterThanOrEqual(16)
  expect(box.x + box.width).toBeLessThanOrEqual(width - 16)

  // 背景はぼかし、食材のイラストが手前に浮く
  const backdrop = page.locator('.lift-backdrop')
  expect(await backdrop.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur')
  await expect(page.locator('.lifted-tile .food-illustration')).toBeVisible()

  // メニューの外をタップすると何もせずに閉じる
  await page.mouse.click(width / 2, 10)
  await expect(menu).toHaveCount(0)
  await expect(page.getByRole('form', { name: '食材を編集' })).toHaveCount(0)
  await expect(page.getByRole('listitem', { name, exact: true })).not.toContainText('少ない')

  // 右の 2 列の食材は、浮いたタイルの右端にメニューの右端をそろえる
  for (const n of [1, 2, 3]) {
    await page.getByRole('button', { name: '食材を追加' }).click()
    await page.getByLabel('食材名').fill(`${name}-${n}`)
    await page.getByLabel('カテゴリ').selectOption({ label: '卵' })
    await page.getByRole('button', { name: '追加する' }).click()
  }
  await expect(page.getByRole('listitem', { name: `${name}-3`, exact: true })).toBeVisible()
  let right: string | null = null
  for (const n of ['', '-1', '-2', '-3']) {
    const b = (await page.getByRole('button', { name: name + n, exact: true }).boundingBox())!
    if (b.x + b.width / 2 > width / 2) right = name + n
  }
  const rightMenu = await openItemMenu(page, right!)
  const r = (await page.getByRole('button', { name: right!, exact: true }).boundingBox())!
  const rb = (await rightMenu.boundingBox())!
  // 浮いたタイルは中心から 1.12 倍に広がる
  const liftedRight = Math.min(r.x + r.width * 1.06, width - 16)
  expect(Math.abs(rb.x + rb.width - liftedRight)).toBeLessThan(2)
})
