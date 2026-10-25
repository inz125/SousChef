import { expect, test } from '@playwright/test'
import { createUser, latestLoginCode, uniqueEmail } from '../support/supabase'

test('登録済みのメンバーはメールのコードでログインし、ログアウトできる', async ({ page }) => {
  const email = uniqueEmail('e2e')
  await createUser(email, { allowed: true })

  await page.goto('/')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByRole('button', { name: 'コードを送信' }).click()
  await page.getByLabel('ログインコード').fill(await latestLoginCode(email))
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible()

  // PWA を開き直してもログインが続く
  await page.reload()
  await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible()

  await page.getByRole('button', { name: 'ログアウト' }).click()
  await expect(page.getByLabel('メールアドレス')).toBeVisible()
})

test('未登録のメールアドレスではコードを送れない', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('メールアドレス').fill(uniqueEmail('unknown'))
  await page.getByRole('button', { name: 'コードを送信' }).click()
  await expect(page.getByRole('alert')).toContainText('コードを送信できませんでした')
})
