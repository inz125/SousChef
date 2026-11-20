import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InventoryItem } from '../domain/inventory'
import { FakeShoppingRepository } from '../shopping/FakeShoppingRepository'
import { RecipeDialog } from './RecipeDialog'
import type { Dish } from './RecipesRepository'

const mabo: Dish = {
  name: '麻婆豆腐',
  minutes: 20,
  ingredients: [
    { name: '豆腐', amount: '1 丁', source: 'buy', category: 'soy' },
    { name: '豚ひき肉', amount: '150g', source: 'stock', category: 'meat' },
    // 「在庫」の印だが今の在庫にない（D-69 で「買い足し」扱い）
    { name: '長ねぎ', amount: '1/2 本', source: 'stock', category: 'leafy' },
    { name: '醤油', amount: '大さじ1', source: 'staple', category: 'seasoning' },
  ],
  steps: ['炒める', '煮る'],
}

const salad: Dish = {
  name: '冷奴',
  minutes: 5,
  ingredients: [{ name: '豚ひき肉', amount: '少し', source: 'stock', category: 'meat' }],
  steps: ['切る'],
}

const stock: InventoryItem[] = [
  {
    id: 'p1',
    name: '豚ひき肉',
    category: 'meat',
    location: 'fridge',
    quantity: 'enough',
    expiresOn: null,
    expiresOnEstimated: false,
    thawedOn: null,
  },
]

function setup(shopping = new FakeShoppingRepository()) {
  render(
    <RecipeDialog
      title="レシピ"
      dishes={[{ dish: mabo }, { dish: salad }]}
      savedNames={new Set()}
      onToggleSave={() => {}}
      onClose={() => {}}
      stock={stock}
      onThaw={async () => {}}
      onShop={(names) => shopping.add(names)}
    />,
  )
  return { shopping, user: userEvent.setup() }
}

describe('レシピの「買い足しを買い物リストへ」（D-74）', () => {
  it('買い足しの材料（D-69 の見直しのあと）をまとめて入れる', async () => {
    const { shopping, user } = setup()
    const dish = screen.getByRole('region', { name: '麻婆豆腐' })
    await user.click(within(dish).getByRole('button', { name: '買い足しを買い物リストへ（2 品）' }))
    expect(await within(dish).findByRole('status')).toHaveTextContent('2 品を入れました')
    expect(shopping.names()).toEqual(['豆腐', '長ねぎ'])
  })

  it('すでにある品物は重ねず、そう知らせる', async () => {
    const { shopping, user } = setup(new FakeShoppingRepository({ items: ['豆腐'] }))
    const dish = screen.getByRole('region', { name: '麻婆豆腐' })
    await user.click(within(dish).getByRole('button', { name: /買い足しを買い物リストへ/ }))
    await waitFor(() =>
      expect(within(dish).getByRole('status')).toHaveTextContent(
        '1 品を入れました（1 品はもうありました）',
      ),
    )
    expect(shopping.names()).toEqual(['豆腐', '長ねぎ'])

    await user.click(within(dish).getByRole('button', { name: /買い足しを買い物リストへ/ }))
    await waitFor(() =>
      expect(within(dish).getByRole('status')).toHaveTextContent(
        '2 品はもう買い物リストにあります',
      ),
    )
  })

  it('買い足しが 0 品の料理にはボタンを出さない', () => {
    setup()
    const dish = screen.getByRole('region', { name: '冷奴' })
    expect(within(dish).queryByRole('button', { name: /買い物リスト/ })).not.toBeInTheDocument()
  })

  it('オフラインではボタンを出さない', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      setup()
      expect(screen.queryByRole('button', { name: /買い物リスト/ })).not.toBeInTheDocument()
    } finally {
      online.mockRestore()
    }
  })
})
