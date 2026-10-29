import { expect, test } from '@playwright/test'
import {
  answerMealInterview,
  FIRST,
  loginAsNewMember,
  routeSuggestMeals,
  suggestMeals,
} from './helpers'

test('インタビューで条件を答えて献立を提案してもらい、レシピを見られる（D-53）', async ({
  page,
}) => {
  await routeSuggestMeals(page)
  await loginAsNewMember(page)

  const item = `鶏もも肉${Date.now()}`
  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(item)
  await page.getByLabel('カテゴリ').selectOption({ label: '肉' })
  await page.getByRole('button', { name: '追加する' }).click()

  await page.getByRole('link', { name: '献立' }).click()
  await expect(page.getByText('1 / 6')).toBeVisible()
  await page.getByRole('radio', { name: '30 分' }).click()
  await page.getByRole('radio', { name: '在庫のみ' }).click()

  // 使いたい食材には期限を残り日数で表示する。肉は冷凍で登録され（D-46）、期限は目安
  const box = page.getByRole('checkbox', { name: item })
  await expect(box).not.toBeChecked()
  await expect(box).toHaveAccessibleDescription(/^あと \d+ 日・目安$/)
  // 長い食材名があっても画面が横にはみ出さない（iPhone で横スクロールが出ない）
  expect(
    // モバイルでは内容がはみ出すと innerWidth も広がるので、端末の画面幅と比べる
    await page.evaluate(() => document.documentElement.scrollWidth - window.screen.width),
  ).toBeLessThanOrEqual(0)
  await box.check()
  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('radio', { name: 'あり', exact: true }).click()
  await page.getByRole('radio', { name: 'どちらでも' }).click()
  await page.getByRole('textbox', { name: '気分やリクエストはある？' }).fill('和食')
  await page.getByRole('button', { name: '次へ' }).click()
  await expect(page.getByRole('button', { name: /^使いたい食材/ })).toContainText(item)
  await expect(page.getByRole('button', { name: /^気分/ })).toContainText('和食')
  await page.getByRole('button', { name: '献立を提案してもらう' }).click()

  // 他のテストのメンバーが登録したアレルギーで一部の案が除かれることがあるので、件数ではなく案の中身で確認する
  const card = page.getByRole('article', { name: FIRST })
  await expect(card).toContainText('合計 25 分')

  await card.getByRole('button', { name: 'レシピを見る' }).click()
  const recipe = page.getByRole('dialog', { name: '鶏もも肉の照り焼き' })
  await expect(recipe).toContainText('1 枚（300g）')
  await expect(recipe).toContainText('皮目から中火で 6 分焼く')
  await expect(recipe).toContainText('鶏肉を焼いている間にキャベツを塩もみしておく')
  await expect(recipe.getByRole('region', { name: '汁物 豆腐とねぎの味噌汁' })).toBeVisible()
  await recipe.getByRole('button', { name: '閉じる' }).click()
  await expect(recipe).toHaveCount(0)
})

test('提案した献立は、タブを移っても開き直しても次の提案まで残り、「作った」を押せる（D-43）', async ({
  page,
}) => {
  await routeSuggestMeals(page)
  await loginAsNewMember(page)

  await page.getByRole('link', { name: '献立' }).click()
  await suggestMeals(page, { minutes: '15 分' })
  const card = page.getByRole('article', { name: FIRST })
  await expect(card).toBeVisible()

  await page.getByRole('link', { name: '在庫' }).click()
  await page.getByRole('link', { name: 'レシピ' }).click()
  await page.getByRole('link', { name: '献立' }).click()
  await expect(card).toBeVisible()

  await page.reload()
  await expect(card).toBeVisible()
  // 新しく提案するときは前回の答えを選んでおく。やめると結果に戻る
  await page.getByRole('button', { name: '新しく提案してもらう' }).click()
  await expect(page.getByRole('radio', { name: '15 分' })).toBeChecked()
  await page.getByRole('button', { name: 'やめる' }).click()
  await card.getByRole('button', { name: 'レシピを見る' }).click()
  await page.getByRole('button', { name: '作った' }).click()
  await expect(page.getByRole('dialog', { name: '使った食材' })).toBeVisible()
})

test('副菜を「レンジで」にして提案すると副菜に印が付き、★保存すると次からもレンジで作る料理になる（D-50）', async ({
  page,
}) => {
  await routeSuggestMeals(page)
  await loginAsNewMember(page)

  await page.getByRole('link', { name: '献立' }).click()
  await answerMealInterview(page, { side: 'レンジで' })
  await expect(page.getByRole('button', { name: /^副菜/ })).toContainText('レンジで')
  await page.getByRole('button', { name: '献立を提案してもらう' }).click()

  const card = page.getByRole('article', { name: FIRST })
  await expect(card.getByText('＋ キャベツの塩もみ')).toContainText('レンジ')
  await expect(card.getByRole('heading', { name: '鶏もも肉の照り焼き' })).not.toContainText(
    'レンジ',
  )

  await page.reload()
  await card.getByRole('button', { name: 'レシピを見る' }).click()
  const recipe = page.getByRole('dialog', { name: '鶏もも肉の照り焼き' })
  const side = recipe.getByRole('region', { name: '副菜 キャベツの塩もみ' })
  await expect(side.getByRole('heading')).toContainText('レンジ')
  await expect(recipe.getByRole('region', { name: '主菜 鶏もも肉の照り焼き' })).not.toContainText(
    'レンジ',
  )
  const star = side.getByRole('button', { name: 'キャベツの塩もみを保存' })
  // 1 世帯で共有するので、前のテストで保存済みのこともある
  if ((await star.getAttribute('aria-pressed')) === 'true') await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'true')
  await recipe.getByRole('button', { name: '閉じる' }).click()

  await page.getByRole('link', { name: 'レシピ' }).click()
  await page
    .getByRole('list', { name: '保存した料理' })
    .getByRole('button', { name: 'キャベツの塩もみ', exact: true })
    .click()
  const saved = page.getByRole('dialog', { name: 'キャベツの塩もみ' })
  await expect(saved.getByRole('heading', { name: /キャベツの塩もみ/ })).toContainText('レンジ')

  // 他のテストに影響しないよう保存をやめておく
  await saved.getByRole('button', { name: 'キャベツの塩もみを保存' }).click()
  await expect(saved.getByRole('button', { name: 'キャベツの塩もみを保存' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})
