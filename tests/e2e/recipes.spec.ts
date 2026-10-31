import { expect, test } from '@playwright/test'
import { FIRST, loginAsNewMember, routeSuggestMeals, suggestMeals } from './helpers'

test('提案された料理を★で保存し、レシピタブで見て、保存をやめられる', async ({ page }) => {
  await routeSuggestMeals(page)
  await loginAsNewMember(page)

  await page.getByRole('link', { name: '献立' }).click()
  await suggestMeals(page)
  await page
    .getByRole('article', { name: FIRST })
    .getByRole('button', { name: 'レシピを見る' })
    .click()

  const recipe = page.getByRole('dialog', { name: '鶏もも肉の照り焼き' })
  const star = recipe.getByRole('button', { name: '鶏もも肉の照り焼きを保存' })
  // 1 世帯で共有するので、前のテストで保存済みのこともある
  if ((await star.getAttribute('aria-pressed')) === 'true') await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'true')
  await recipe.getByRole('button', { name: '閉じる' }).click()

  await page.getByRole('link', { name: 'レシピ' }).click()
  // 開いたときは「保存」の区分だけを表示する（D-58）
  await expect(page.getByRole('tab', { name: '保存' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('grid', { name: /調理履歴/ })).toHaveCount(0)
  const savedList = page.getByRole('list', { name: '保存した料理' })
  await savedList.getByRole('button', { name: '鶏もも肉の照り焼き', exact: true }).click()
  const saved = page.getByRole('dialog', { name: '鶏もも肉の照り焼き' })
  await expect(saved).toContainText('皮目から中火で 6 分焼く')

  await saved.getByRole('button', { name: '鶏もも肉の照り焼きを保存' }).click()
  await saved.getByRole('button', { name: '閉じる' }).click()
  await expect(
    savedList.getByRole('button', { name: '鶏もも肉の照り焼き', exact: true }),
  ).toHaveCount(0)
})

test('レシピタブの中身を横にスワイプして「保存 / 最近の提案 / 調理履歴」を移れる（D-68）', async ({
  page,
}) => {
  await loginAsNewMember(page)
  await page.getByRole('link', { name: 'レシピ' }).click()
  const selected = page.getByRole('tab', { selected: true })
  await expect(selected).toHaveText('保存')

  /** 中身の上のほうから指で横に動かして離す */
  async function swipe(dx: number) {
    const box = await page.locator('.recipes .swipe-pager').boundingBox()
    if (!box) throw new Error('中身が表示されていません')
    const x = box.x + box.width / 2
    const y = box.y + 40
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dx, y, { steps: 10 })
    await page.mouse.up()
  }

  // 左へで右隣へ
  await swipe(-200)
  await expect(selected).toHaveText('最近の提案')
  await swipe(-200)
  await expect(selected).toHaveText('調理履歴')
  const month = page.locator('.month-nav h3')
  const title = await month.textContent()

  // 端（調理履歴）では止まる。カレンダーの上でも月は変わらない
  await swipe(-200)
  await page.waitForTimeout(500)
  await expect(selected).toHaveText('調理履歴')
  await expect(month).toHaveText(title!)

  // 右へで左隣へ
  await swipe(200)
  await expect(selected).toHaveText('最近の提案')
})
