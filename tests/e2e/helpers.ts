import { expect, type Page } from '@playwright/test'
import { createUser, latestLoginCode, uniqueEmail } from '../support/supabase'

/** 許可メンバーを作成し、ログイン画面からログインする */
export async function loginAsNewMember(page: Page): Promise<string> {
  const email = uniqueEmail('e2e')
  await createUser(email, { allowed: true })
  await page.goto('/')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByRole('button', { name: 'コードを送信' }).click()
  await page.getByLabel('ログインコード').fill(await latestLoginCode(email))
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible()
  return email
}
