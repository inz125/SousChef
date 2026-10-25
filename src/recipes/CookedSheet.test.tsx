import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InventoryItem } from '../domain/inventory'
import { FakeInventoryRepository } from '../inventory/FakeInventoryRepository'
import { SAMPLE_SUGGESTIONS } from '../meals/FakeMealsApi'
import { CookedSheet } from './CookedSheet'
import { FakeRecipesRepository } from './FakeRecipesRepository'

const item = (id: string, name: string, over: Partial<InventoryItem> = {}): InventoryItem => ({
  id,
  name,
  category: 'meat',
  location: 'fridge',
  quantity: 'enough',
  expiresOn: null,
  expiresOnEstimated: false,
  ...over,
})

// 照り焼き: 鶏もも肉(在庫) / 醤油(常備) / しょうが(買い足し)、浅漬け: キャベツ(在庫)
const { main, side } = SAMPLE_SUGGESTIONS[0]

function setup(items: InventoryItem[] = [item('c1', '鶏もも肉'), item('k1', 'キャベツ')]) {
  const inventory = new FakeInventoryRepository(items)
  const recipes = new FakeRecipesRepository()
  const onDone = vi.fn()
  const onCancel = vi.fn()
  render(
    <CookedSheet
      dishes={[main, side]}
      inventory={inventory}
      recipes={recipes}
      today="2026-10-25"
      onDone={onDone}
      onCancel={onCancel}
    />,
  )
  return { inventory, recipes, onDone, onCancel, user: userEvent.setup() }
}

const confirm = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: '在庫を更新して記録する' }))

describe('CookedSheet（D-12, D-37）', () => {
  it('在庫にある材料ごとに選択肢を出し、初期値は「まだある」。常備調味料は出さない', async () => {
    setup()
    const sheet = await screen.findByRole('dialog', { name: '使った食材' })
    await within(sheet).findByRole('group', { name: '鶏もも肉' })
    const groups = within(sheet).getAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      '鶏もも肉',
      'キャベツ',
      '買い足した食材',
    ])
    expect(within(groups[0]).getByRole('radio', { name: 'まだある' })).toBeChecked()
    expect(within(sheet).queryByText('醤油')).not.toBeInTheDocument()
  })

  it('選んだとおりに在庫を更新し、余った買い足し食材を追加し、料理を記録する', async () => {
    const { inventory, recipes, onDone, user } = setup()
    const chicken = await screen.findByRole('group', { name: '鶏もも肉' })
    await user.click(within(chicken).getByRole('radio', { name: '使い切った' }))
    const cabbage = screen.getByRole('group', { name: 'キャベツ' })
    await user.click(within(cabbage).getByRole('radio', { name: '少ない' }))
    await user.click(screen.getByRole('checkbox', { name: 'しょうがが余った' }))
    await confirm(user)

    expect(inventory.items.map((i) => [i.name, i.quantity])).toEqual([
      ['キャベツ', 'low'],
      ['しょうが', 'low'],
    ])
    expect(inventory.items[1]).toMatchObject({ category: 'root', location: 'vegetable' })
    expect(recipes.records[0].dishNames).toEqual(['鶏の照り焼き', 'キャベツの浅漬け'])
    expect(onDone).toHaveBeenCalled()
  })

  it('同じ材料の在庫が複数あれば、期限が近いものを初期値にして選べる', async () => {
    const { inventory, user } = setup([
      item('late', '鶏もも肉', { expiresOn: '2026-10-30' }),
      item('soon', '鶏もも肉（特売）', { expiresOn: '2026-10-26' }),
      item('k1', 'キャベツ'),
    ])
    const chicken = await screen.findByRole('group', { name: '鶏もも肉' })
    const select = within(chicken).getByLabelText('使った在庫')
    // 同じ名前が優先
    expect(select).toHaveDisplayValue('鶏もも肉')
    await user.selectOptions(select, '鶏もも肉（特売）')
    await user.click(within(chicken).getByRole('radio', { name: '使い切った' }))
    await confirm(user)

    expect(inventory.items.map((i) => i.id)).toEqual(['late', 'k1'])
  })

  it('在庫が 1 つだけなら選ぶ欄は出さない', async () => {
    setup()
    const chicken = await screen.findByRole('group', { name: '鶏もも肉' })
    expect(within(chicken).queryByLabelText('使った在庫')).not.toBeInTheDocument()
  })

  it('在庫に見つからない材料はその旨を表示する', async () => {
    setup([item('k1', 'キャベツ')])
    expect(await screen.findByText('鶏もも肉 は在庫にありません')).toBeInTheDocument()
  })

  it('記録に失敗したらエラーを表示し、閉じない', async () => {
    const { recipes, onDone, user } = setup()
    recipes.failRecord = true
    await screen.findByRole('group', { name: '鶏もも肉' })
    await confirm(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('記録できませんでした')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('キャンセルできる', async () => {
    const { onCancel, user } = setup()
    await user.click(await screen.findByRole('button', { name: 'キャンセル' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
