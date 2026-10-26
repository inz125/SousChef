import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InventoryItem } from '../domain/inventory'
import { FakeInventoryRepository } from '../inventory/FakeInventoryRepository'
import { memoryStore, type KeyValueStore } from '../offline/offlineCache'
import { FakeRecipesRepository } from '../recipes/FakeRecipesRepository'
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
  thawedOn: null,
})

function setup(
  api = new FakeMealsApi(),
  store: KeyValueStore = memoryStore(),
  inventory = new FakeInventoryRepository([
    item('キャベツ', '2026-11-03'),
    item('鶏もも肉', '2026-10-26'),
  ]),
) {
  const recipes = new FakeRecipesRepository()
  const view = render(
    <MealsScreen
      api={api}
      inventory={inventory}
      recipes={recipes}
      store={store}
      today="2026-10-25"
    />,
  )
  return { api, inventory, recipes, store, view, user: userEvent.setup() }
}

const FIRST = '鶏の照り焼き・キャベツの浅漬け・わかめの味噌汁'

const suggest = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: '献立を提案してもらう' }))

describe('MealsScreen 条件', () => {
  it('既定は 30 分・在庫のみ・汁物あり。指定した条件で提案を依頼する', async () => {
    const { api, user } = setup()
    expect(screen.getByRole('radio', { name: '30 分' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '在庫のみ' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '汁物あり' })).toBeChecked()

    await user.click(screen.getByRole('radio', { name: '指定なし' }))
    await user.click(screen.getByRole('radio', { name: '買い足し OK' }))
    await user.click(screen.getByRole('radio', { name: '汁物なし' }))
    await user.type(screen.getByLabelText('気分・リクエスト'), '和食でさっぱり')
    await user.click(await screen.findByRole('checkbox', { name: '鶏もも肉' }))
    await suggest(user)

    expect(api.calls).toEqual([
      {
        maxMinutes: null,
        allowShopping: true,
        soup: false,
        mood: '和食でさっぱり',
        mustUse: ['鶏もも肉'],
      },
    ])
  })

  it('使いたい食材の候補は在庫から、期限が近い順に並べる', async () => {
    setup()
    const boxes = await screen.findAllByRole('checkbox')
    expect(boxes.map((b) => b.getAttribute('name'))).toEqual(['鶏もも肉', 'キャベツ'])
  })
})

describe('MealsScreen 結果', () => {
  it('3 案を主菜・副菜・汁物・合計時間・期限が近い食材・買い足しの数とともに表示する', async () => {
    const { user } = setup()
    await suggest(user)

    const cards = await screen.findAllByRole('article')
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      FIRST,
      '豆腐ステーキ・もやしのナムル・みそ汁',
      '野菜炒め・冷奴・かき玉汁',
    ])
    expect(cards[0]).toHaveTextContent('＋ キャベツの浅漬け')
    expect(cards[0]).toHaveTextContent('＋ わかめの味噌汁')
    expect(cards[0]).toHaveTextContent('合計 25 分')
    expect(cards[0]).toHaveTextContent('期限が近い: 鶏もも肉')
    expect(cards[0]).toHaveTextContent('買い足し 2 品')
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
    const card = await screen.findByRole('article', { name: FIRST })
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
    expect(within(dialog).getByRole('region', { name: '汁物 わかめの味噌汁' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'わかめの味噌汁を保存' })).toBeInTheDocument()
    expect(dialog).toHaveTextContent('段取り: 漬けている間に焼く')

    await user.click(within(dialog).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('MealsScreen ★保存（D-36）', () => {
  it('レシピの料理ごとに★で保存・解除できる', async () => {
    const { recipes, user } = setup()
    await suggest(user)
    const card = await screen.findByRole('article', { name: FIRST })
    await user.click(within(card).getByRole('button', { name: 'レシピを見る' }))
    const dialog = screen.getByRole('dialog', { name: '鶏の照り焼き' })

    const star = within(dialog).getByRole('button', { name: '鶏の照り焼きを保存' })
    expect(star).toHaveAttribute('aria-pressed', 'false')
    await user.click(star)
    expect(star).toHaveAttribute('aria-pressed', 'true')
    expect(recipes.saved.map((d) => d.name)).toEqual(['鶏の照り焼き'])

    await user.click(within(dialog).getByRole('button', { name: 'キャベツの浅漬けを保存' }))
    expect(recipes.saved.map((d) => d.name)).toEqual(['キャベツの浅漬け', '鶏の照り焼き'])

    await user.click(star)
    expect(star).toHaveAttribute('aria-pressed', 'false')
    expect(recipes.saved.map((d) => d.name)).toEqual(['キャベツの浅漬け'])
  })
})

describe('MealsScreen 作った（D-37）', () => {
  it('レシピから「作った」で使った食材を確認し、記録すると閉じてお知らせする', async () => {
    const { inventory, recipes, user } = setup()
    await suggest(user)
    const card = await screen.findByRole('article', { name: FIRST })
    await user.click(within(card).getByRole('button', { name: 'レシピを見る' }))
    await user.click(screen.getByRole('button', { name: '作った' }))

    const chicken = await screen.findByRole('group', { name: '鶏もも肉' })
    await user.click(within(chicken).getByRole('radio', { name: '使い切った' }))
    await user.click(screen.getByRole('button', { name: '在庫を更新して記録する' }))

    expect(await screen.findByRole('status')).toHaveTextContent('記録しました')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(inventory.items.map((i) => i.name)).toEqual(['キャベツ'])
    expect(recipes.records[0].dishNames).toEqual([
      '鶏の照り焼き',
      'キャベツの浅漬け',
      'わかめの味噌汁',
    ])
    expect(recipes.records[0].dishes?.map((d) => d.steps)).toEqual([
      ['鶏肉を焼く', 'たれをからめる'],
      ['切る', '揉む'],
      ['湯を沸かす', '味噌を溶く'],
    ])
    // 作ったあとも提案は残る（D-43）
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })
})

describe('MealsScreen 提案の保持（D-43）', () => {
  it('画面を離れて戻っても、前の提案と条件が表示され、レシピを開ける', async () => {
    const { store, view, user } = setup()
    await user.click(screen.getByRole('radio', { name: '15 分' }))
    await user.type(screen.getByLabelText('気分・リクエスト'), '和食')
    await user.click(await screen.findByRole('checkbox', { name: 'キャベツ' }))
    await suggest(user)
    await screen.findAllByRole('article')
    view.unmount()

    setup(new FakeMealsApi(), store)
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: '15 分' })).toBeChecked()
    expect(screen.getByLabelText('気分・リクエスト')).toHaveValue('和食')
    expect(await screen.findByRole('checkbox', { name: 'キャベツ' })).toBeChecked()
    await user.click(
      within(screen.getByRole('article', { name: FIRST })).getByRole('button', {
        name: 'レシピを見る',
      }),
    )
    expect(screen.getByRole('dialog', { name: '鶏の照り焼き' })).toBeInTheDocument()
  })

  it('提案に失敗しても前の提案は残る', async () => {
    const api = new FakeMealsApi()
    const { user } = setup(api)
    await suggest(user)
    await screen.findAllByRole('article')
    api.error = '献立の提案に失敗しました'
    await user.click(screen.getByRole('button', { name: '別の案を出す' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('失敗しました')
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })

  it('保存した使いたい食材が在庫からなくなっていたら、選択から外す', async () => {
    const store = memoryStore()
    store.set(
      'souschef:last-suggestions',
      JSON.stringify({
        conditions: {
          maxMinutes: 30,
          allowShopping: false,
          soup: true,
          mood: '',
          mustUse: ['キャベツ', '豚こま'],
        },
        suggestions: [],
      }),
    )
    const { api, user } = setup(new FakeMealsApi(), store)
    expect(await screen.findByRole('checkbox', { name: 'キャベツ' })).toBeChecked()
    await suggest(user)
    expect(api.calls[0].mustUse).toEqual(['キャベツ'])
  })
})

describe('MealsScreen 冷凍の肉（D-49）', () => {
  const frozenChicken = (): InventoryItem => ({
    ...item('鶏もも肉', '2026-11-20'),
    id: 'f',
    location: 'freezer',
  })
  const withFrozen = () =>
    new FakeInventoryRepository([item('キャベツ', '2026-11-03'), frozenChicken()])

  it('冷凍の肉を使う案とレシピの材料に「冷凍・要解凍」の印を付ける', async () => {
    const { user } = setup(undefined, undefined, withFrozen())
    await screen.findByRole('checkbox', { name: '鶏もも肉' })
    await suggest(user)

    const card = await screen.findByRole('article', { name: FIRST })
    expect(card).toHaveTextContent('冷凍・要解凍: 鶏もも肉')
    await user.click(within(card).getByRole('button', { name: 'レシピを見る' }))
    const dialog = screen.getByRole('dialog', { name: '鶏の照り焼き' })
    const chicken = within(dialog)
      .getAllByRole('listitem')
      .find((li) => li.textContent?.startsWith('鶏もも肉'))
    expect(chicken).toHaveTextContent('冷凍・要解凍')
  })

  it('レシピに解凍の案内を出し、その場で解凍すると印と案内が消える', async () => {
    const { user, inventory } = setup(undefined, undefined, withFrozen())
    await screen.findByRole('checkbox', { name: '鶏もも肉' })
    await suggest(user)
    const card = await screen.findByRole('article', { name: FIRST })
    await user.click(within(card).getByRole('button', { name: 'レシピを見る' }))

    const dialog = screen.getByRole('dialog', { name: '鶏の照り焼き' })
    const notice = await within(dialog).findByRole('region', { name: '解凍の案内' })
    expect(notice).toHaveTextContent(
      '冷凍の 鶏もも肉 を使います。明日作るなら今のうちに冷蔵へ移しましょう',
    )
    await user.click(within(notice).getByRole('button', { name: '鶏もも肉を解凍' }))
    const sheet = screen.getByRole('dialog', { name: '鶏もも肉を解凍' })
    await user.click(within(sheet).getByRole('button', { name: '全部' }))
    await user.click(within(sheet).getByRole('button', { name: '解凍する' }))

    expect(inventory.items.find((i) => i.id === 'f')).toMatchObject({
      location: 'fridge',
      thawedOn: '2026-10-25',
    })
    await waitFor(() =>
      expect(within(dialog).queryByRole('region', { name: '解凍の案内' })).not.toBeInTheDocument(),
    )
    expect(dialog).not.toHaveTextContent('冷凍・要解凍')
    expect(card).not.toHaveTextContent('冷凍・要解凍')
  })

  it('冷蔵の肉なら印も案内も出さない', async () => {
    const { user } = setup()
    await screen.findByRole('checkbox', { name: '鶏もも肉' })
    await suggest(user)
    const card = await screen.findByRole('article', { name: FIRST })
    expect(card).not.toHaveTextContent('冷凍・要解凍')
    await user.click(within(card).getByRole('button', { name: 'レシピを見る' }))
    expect(screen.queryByRole('region', { name: '解凍の案内' })).not.toBeInTheDocument()
  })
})
