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
  const inventory = page.getByRole('heading', { level: 1, name: '在庫' })
  await expect(inventory).toBeVisible()

  // PWA を開き直してもログインが続く
  await page.reload()
  await expect(inventory).toBeVisible()

  // ログアウトは設定画面の一番下（D-41）
  await page.getByRole('link', { name: '設定' }).click()
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
