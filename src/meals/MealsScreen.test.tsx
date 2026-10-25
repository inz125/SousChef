import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InventoryItem } from '../domain/inventory'
import { FakeInventoryRepository } from '../inventory/FakeInventoryRepository'
import { FakeMealsApi } from './FakeMealsApi'
import { MealsScreen } from './MealsScreen'

const item = (name: string, expiresOn: string | null): InventoryItem => ({
  id: crypto.randomUUID(),
  name,
  category: 'meat',
  location: 'fridge',
  quantity: 'enough',
  expiresOn,
  expiresOnEstimated: false,
})

function setup(api = new FakeMealsApi()) {
  const inventory = new FakeInventoryRepository([
    item('キャベツ', '2026-11-03'),
    item('鶏もも肉', '2026-10-26'),
  ])
  render(<MealsScreen api={api} inventory={inventory} />)
  return { api, user: userEvent.setup() }
}

const suggest = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: '献立を提案してもらう' }))

describe('MealsScreen 条件', () => {
  it('既定は 30 分・在庫のみ。指定した条件で提案を依頼する', async () => {
    const { api, user } = setup()
    expect(screen.getByRole('radio', { name: '30 分' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '在庫のみ' })).toBeChecked()

    await user.click(screen.getByRole('radio', { name: '指定なし' }))
    await user.click(screen.getByRole('radio', { name: '買い足し OK' }))
    await user.type(screen.getByLabelText('気分・リクエスト'), '和食でさっぱり')
    await user.click(await screen.findByRole('checkbox', { name: '鶏もも肉' }))
    await suggest(user)

    expect(api.calls).toEqual([
      { maxMinutes: null, allowShopping: true, mood: '和食でさっぱり', mustUse: ['鶏もも肉'] },
    ])
  })

  it('使いたい食材の候補は在庫から、期限が近い順に並べる', async () => {
    setup()
    const boxes = await screen.findAllByRole('checkbox')
    expect(boxes.map((b) => b.getAttribute('name'))).toEqual(['鶏もも肉', 'キャベツ'])
  })
})

describe('MealsScreen 結果', () => {
  it('3 案を主菜・副菜・合計時間・期限が近い食材・買い足しの数とともに表示する', async () => {
    const { user } = setup()
    await suggest(user)

    const cards = await screen.findAllByRole('article')
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      '鶏の照り焼き・キャベツの浅漬け',
      '豆腐ステーキ・みそ汁',
      '野菜炒め・冷奴',
    ])
    expect(cards[0]).toHaveTextContent('合計 25 分')
    expect(cards[0]).toHaveTextContent('期限が近い: 鶏もも肉')
    expect(cards[0]).toHaveTextContent('買い足し 1 品')
    expect(cards[1]).not.toHaveTextContent('買い足し')
  })

  it('提案を待つ間は「考えています」と表示し、ボタンを押せない', async () => {
    const api = new FakeMealsApi()
    api.hold = true
    const { user } = setup(api)
    await suggest(user)

    expect(screen.getByRole('status')).toHaveTextContent('考えています')
    expect(screen.getByRole('button', { name: '献立を提案してもらう' })).toBeDisabled()
    await act(async () => api.release())
    expect(await screen.findAllByRole('article')).toHaveLength(3)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('提案できなかったら理由を表示する', async () => {
    const api = new FakeMealsApi()
    api.error = '今日の提案回数の上限に達しました。明日また使えます'
    const { user } = setup(api)
    await suggest(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('今日の提案回数の上限に達しました')
  })

  it('「別の案を出す」で同じ条件のまま提案し直す', async () => {
    const { api, user } = setup()
    await suggest(user)
    await user.click(await screen.findByRole('button', { name: '別の案を出す' }))
    expect(api.calls).toHaveLength(2)
    expect(api.calls[1]).toEqual(api.calls[0])
  })
})

describe('MealsScreen レシピ', () => {
  it('材料（在庫・常備・買い足しの印つき）、手順、段取りのコツを表示し、閉じられる', async () => {
    const { user } = setup()
    await suggest(user)
    const card = await screen.findByRole('article', { name: '鶏の照り焼き・キャベツの浅漬け' })
    await user.click(within(card).getByRole('button', { name: 'レシピを見る' }))

    const dialog = screen.getByRole('dialog', { name: '鶏の照り焼き' })
    const main = within(dialog).getByRole('region', { name: '主菜 鶏の照り焼き' })
    const rows = within(main).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('鶏もも肉300g在庫')
    expect(rows[1]).toHaveTextContent('醤油大さじ2常備')
    expect(rows[2]).toHaveTextContent('しょうが1 かけ買い足し')
    expect(within(main).getByRole('list', { name: '手順' })).toHaveTextContent('鶏肉を焼く')
    expect(
      within(dialog).getByRole('region', { name: '副菜 キャベツの浅漬け' }),
    ).toBeInTheDocument()
    expect(dialog).toHaveTextContent('段取り: 漬けている間に焼く')

    await user.click(within(dialog).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
