import { expect, type Page } from '@playwright/test'
import { nodeSuggestMealsHandler } from '../support/suggestMeals'
import { createUser, latestLoginCode, uniqueEmail } from '../support/supabase'

/** 許可メンバーを作成し、ログイン画面からログインする */
export async function loginAsNewMember(page: Page, displayName?: string): Promise<string> {
  const email = uniqueEmail('e2e')
  await createUser(email, { allowed: true, displayName })
  await page.goto('/')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByRole('button', { name: 'コードを送信' }).click()
  await page.getByLabel('ログインコード').fill(await latestLoginCode(email))
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible()
  return email
}

/**
 * ブラウザからの提案リクエストを、Node 上の処理本体（本物のテスト用 DB + モックの Claude）で処理する。
 * Edge Runtime（Deno）上での起動は CI の統合テスト（EDGE_FUNCTIONS=1）で確認している
 */
export async function routeSuggestMeals(page: Page) {
  const handler = nodeSuggestMealsHandler()
  await page.route('**/functions/v1/suggest-meals', async (route) => {
    const req = route.request()
    const res = await handler(
      new Request(req.url(), {
        method: req.method(),
        headers: req.headers(),
        body: req.method() === 'POST' ? req.postData() : undefined,
      }),
    )
    await route.fulfill({
      status: res.status,
      headers: Object.fromEntries(res.headers),
      body: await res.text(),
    })
  })
}
