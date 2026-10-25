import { expect, test } from '@playwright/test'
import { createUser, TEST_PASSWORD, uniqueEmail } from '../support/supabase'

test('登録済みのメンバーはパスワードでログインし、開き直しても続き、ログアウトできる', async ({
  page,
}) => {
  const email = uniqueEmail('e2e')
  await createUser(email, { allowed: true })

  await page.goto('/')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible()

  // PWA を開き直してもログインが続く
  await page.reload()
  await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible()

  await page.getByRole('button', { name: 'ログアウト' }).click()
  await expect(page.getByLabel('メールアドレス')).toBeVisible()
})

test('パスワードが違えばログインできない', async ({ page }) => {
  const email = uniqueEmail('e2e-wrong')
  await createUser(email, { allowed: true })
  await page.goto('/')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード').fill('wrong-password')
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('alert')).toContainText('メールアドレスかパスワードが違います')
})
