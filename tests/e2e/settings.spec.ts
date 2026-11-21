import { expect, test } from '@playwright/test'
import { loginAsNewMember } from './helpers'

test('設定タブの苦手・アレルギー・常備調味料はチップで追加・削除でき、すぐ保存される（D-81）', async ({
  page,
}) => {
  const name = `たろう${Date.now()}`
  await loginAsNewMember(page, name)

  await page.getByRole('link', { name: '設定' }).click()
  const me = page.getByRole('group', { name })
  const dislikes = me.getByRole('group', { name: '苦手な食材' })
  const allergies = me.getByRole('group', { name: 'アレルギー' })
  await dislikes.getByRole('textbox').fill('セロリ')
  await dislikes.getByRole('button', { name: '追加' }).click()
  await allergies.getByRole('textbox').fill('えび、かに')
  await allergies.getByRole('button', { name: '追加' }).click()
  await expect(dislikes.getByRole('listitem')).toHaveText(['セロリ'])
  await expect(allergies.getByRole('listitem')).toHaveText(['えび', 'かに'])
  await expect(page.getByRole('button', { name: '保存する' })).toHaveCount(0)

  // 「保存する」を押さなくても保存されている
  await page.reload()
  await page.getByRole('link', { name: '設定' }).click()
  await expect(dislikes.getByRole('listitem')).toHaveText(['セロリ'])
  await expect(allergies.getByRole('listitem')).toHaveText(['えび', 'かに'])
  await dislikes.getByRole('button', { name: 'セロリを外す' }).click()
  await expect(dislikes.getByRole('listitem')).toHaveCount(0)
  await page.reload()
  await page.getByRole('link', { name: '設定' }).click()
  await expect(allergies.getByRole('listitem')).toHaveText(['えび', 'かに'])
  await expect(dislikes.getByRole('listitem')).toHaveCount(0)

  // 常備調味料は世帯で 1 つ。同じ名前は重ねず、ほかの名前だけ足す。足した名前は最後に消す
  const extra = `豆板醤${Date.now()}`
  const staples = page.getByRole('group', { name: '常備している調味料' })
  await expect(staples.getByRole('listitem').filter({ hasText: '醤油' }).first()).toBeVisible()
  await staples.getByRole('textbox').fill(`醤油, ${extra}`)
  await staples.getByRole('button', { name: '追加' }).click()
  await expect(staples.getByText('醤油はもう登録しています')).toBeVisible()
  await expect(staples.getByRole('listitem').filter({ hasText: extra })).toBeVisible()
  await staples.getByRole('button', { name: `${extra}を外す` }).click()
  await expect(staples.getByRole('listitem').filter({ hasText: extra })).toHaveCount(0)
})
