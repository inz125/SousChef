import { expect, test } from '@playwright/test'
import { loginAsNewMember } from './helpers'

test('もう一人の変更が再読み込みなしで反映され、誰が何をしたか通知される', async ({ browser }) => {
  const wife = await (await browser.newContext()).newPage()
  const husband = await (await browser.newContext()).newPage()
  await loginAsNewMember(wife, 'はな')
  await loginAsNewMember(husband, 'けん')
  const name = `牛乳${Date.now()}`

  await wife.getByRole('button', { name: '食材を追加' }).click()
  await wife.getByLabel('食材名').fill(name)
  await wife.getByLabel('カテゴリ').selectOption({ label: '乳製品' })
  await wife.getByRole('button', { name: '追加する' }).click()

  await expect(husband.getByRole('listitem', { name })).toBeVisible()
  await expect(husband.getByText(`はなさんが ${name} を追加しました`)).toBeVisible()
  // 自分の操作は通知しない
  await expect(wife.getByText(`はなさんが ${name} を追加しました`)).toHaveCount(0)

  await husband.getByRole('listitem', { name }).getByRole('button', { name: 'なくなった' }).click()
  await expect(wife.getByRole('listitem', { name })).toHaveCount(0)
  await expect(wife.getByText(`けんさんが ${name} を削除しました`)).toBeVisible()
})
