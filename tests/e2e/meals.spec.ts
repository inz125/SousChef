import { expect, test } from '@playwright/test'
import { mockRequests } from '../support/mockClaude'
import {
  answerMealInterview,
  FIRST,
  loginAsNewMember,
  routeSuggestMeals,
  suggestMeals,
  waitForRecipes,
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
  await expect(page.getByText('1 / 9')).toBeVisible()
  await page.getByRole('radio', { name: '30 分' }).click()
  await page.getByRole('radio', { name: '在庫のみ' }).click()
  await page.getByRole('radio', { name: '炊いてある' }).click()

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
  await waitForRecipes(page)

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

test('ご飯が炊いてないときは麺を選び、副菜・汁物なしなら麺料理 1 品で提案する（D-54）', async ({
  page,
}) => {
  await routeSuggestMeals(page)
  await loginAsNewMember(page)

  await page.getByRole('link', { name: '献立' }).click()
  await answerMealInterview(page, {
    shopping: '買い足し OK',
    rice: '炊いてない',
    noodle: 'パスタ',
    soup: 'なし',
    sideDish: 'なし',
  })
  await expect(page.getByRole('button', { name: /^ご飯/ })).toContainText('炊いてない（パスタ）')
  await expect(page.getByRole('button', { name: /^副菜/ })).toContainText('なし')
  await page.getByRole('button', { name: '献立を提案してもらう' }).click()

  // モックの応答は固定なので、主菜だけが残ることと、AI への依頼に麺の指示が入ったことを確かめる
  const card = page.getByRole('article', { name: '鶏もも肉の照り焼き' })
  await expect(card).toBeVisible()
  await expect(card.getByText(/^＋/)).toHaveCount(0)
  // 案の依頼のあとにレシピの依頼（D-63）も届くので、案の依頼を探す
  const prompt = JSON.stringify(
    (await mockRequests()).findLast((r) => JSON.stringify(r).includes('3 案提案してください'))!
      .messages[0].content,
  )
  expect(prompt).toContain('主菜はパスタを使った料理にする')

  await card.getByRole('button', { name: 'レシピを見る' }).click()
  const recipe = page.getByRole('dialog', { name: '鶏もも肉の照り焼き' })
  await expect(recipe.getByRole('region', { name: /^副菜/ })).toHaveCount(0)
  await expect(recipe).not.toContainText('鶏肉を焼いている間にキャベツを塩もみしておく')
})

test('インタビューは質問・選択肢・確認の各行にイラストを出し、選択肢は 2 列のタイルに並べる（D-62）', async ({
  page,
}) => {
  await loginAsNewMember(page)
  await page.getByRole('link', { name: '献立' }).click()

  await expect(page.getByRole('heading', { name: '調理時間はどのくらい？' })).toBeVisible()
  await expect(page.locator('.question-illustration')).toBeVisible()
  // 15 分・30 分が 1 行目、45 分・指定なしが 2 行目に並ぶ
  const box = async (name: string) =>
    (await page.getByRole('radio', { name }).locator('xpath=..').boundingBox())!
  const [m15, m30, m45, none] = await Promise.all(['15 分', '30 分', '45 分', '指定なし'].map(box))
  expect(m30.y).toBe(m15.y)
  expect(m30.x).toBeGreaterThan(m15.x)
  expect(m45.y).toBeGreaterThan(m15.y)
  expect(m45.x).toBe(m15.x)
  expect(none.y).toBe(m45.y)
  for (const b of [m15, m30, m45, none]) {
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  }

  await answerMealInterview(page)
  const rows = page.locator('.answers li')
  await expect(rows.first()).toBeVisible()
  for (const row of await rows.all())
    await expect(row.locator('.answer-illustration')).toBeVisible()
})

test('「視差効果を減らす」が有効ならイラストを動かさない（D-62）', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loginAsNewMember(page)
  await page.getByRole('link', { name: '献立' }).click()

  const illustration = page.locator('.question-illustration')
  await expect(illustration).toBeVisible()
  expect(await illustration.evaluate((e) => getComputedStyle(e).animationName)).toBe('none')
})

test('案の一覧をレシピより先に出し、レシピはできたら開いたまま埋まる。失敗した案だけ作り直せる（D-63）', async ({
  page,
}) => {
  await routeSuggestMeals(page)
  // レシピ作りを止めておき、照り焼きの案の 1 回目だけ失敗させる（後から登録した route が先に使われる）
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  let failed = false
  await page.route('**/functions/v1/make-recipe', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await gate
    const body = route.request().postDataJSON()
    if (!failed && body.suggestion.main.name === '鶏もも肉の照り焼き') {
      failed = true
      return route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'レシピを作れませんでした。もう一度お試しください' }),
      })
    }
    return route.fallback()
  })
  await loginAsNewMember(page)

  await page.getByRole('link', { name: '献立' }).click()
  await answerMealInterview(page)
  await page.getByRole('button', { name: '献立を提案してもらう' }).click()
  const card = page.getByRole('article', { name: FIRST })
  await expect(card).toContainText('合計 25 分')
  await expect(card).toContainText('レシピを作っています…')

  await card.getByRole('button', { name: 'レシピを見る' }).click()
  const recipe = page.getByRole('dialog', { name: '鶏もも肉の照り焼き' })
  await expect(recipe).toContainText('レシピを作っています…')
  await expect(recipe).toContainText('しょうが')
  await expect(recipe.getByRole('button', { name: '鶏もも肉の照り焼きを保存' })).toBeDisabled()
  await expect(recipe.getByRole('button', { name: '作った' })).toHaveCount(0)

  release()
  await expect(recipe).toContainText('レシピを作れませんでした。もう一度お試しください')
  await recipe.getByRole('button', { name: 'レシピを作る' }).click()
  await expect(recipe).toContainText('皮目から中火で 6 分焼く')
  await expect(recipe).toContainText('1 枚（300g）')
  await expect(recipe.getByRole('button', { name: '鶏もも肉の照り焼きを保存' })).toBeEnabled()
  await expect(recipe.getByRole('button', { name: '作った' })).toBeVisible()
  await recipe.getByRole('button', { name: '閉じる' }).click()
  await expect(card).not.toContainText('レシピを作っています…')
})
