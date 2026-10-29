import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InventoryItem } from '../domain/inventory'
import { FakeInventoryRepository } from '../inventory/FakeInventoryRepository'
import { memoryStore, type KeyValueStore } from '../offline/offlineCache'
import { FakeRecipesRepository } from '../recipes/FakeRecipesRepository'
import { FakeMealsApi, SAMPLE_SUGGESTIONS } from './FakeMealsApi'
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
  recipes = new FakeRecipesRepository(),
) {
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

type User = ReturnType<typeof userEvent.setup>

type Answers = {
  minutes?: string
  shopping?: string
  mustUse?: string[]
  soup?: string
  side?: string
  mood?: string
}

const heading = (name: string) => screen.findByRole('heading', { name })
const radio = (name: string) => screen.getByRole('radio', { name })

/** インタビューに答えて確認まで進む（D-53）。指定しない質問は選ばれている答えのまま進む */
async function answer(user: User, a: Answers = {}) {
  await heading('調理時間はどのくらい？')
  await user.click(a.minutes ? radio(a.minutes) : checkedRadio())
  await heading('食材を買い足してもいい？')
  await user.click(a.shopping ? radio(a.shopping) : checkedRadio())
  const next = await screen.findByRole('heading', { name: /使いたい食材はある？|汁物はつける？/ })
  if (next.textContent === '使いたい食材はある？') {
    for (const name of a.mustUse ?? []) {
      await user.click(screen.getByRole('checkbox', { name }))
    }
    await user.click(screen.getByRole('button', { name: '次へ' }))
  }
  await heading('汁物はつける？')
  await user.click(a.soup ? radio(a.soup) : checkedRadio())
  await heading('副菜はレンジで作る？')
  await user.click(a.side ? radio(a.side) : checkedRadio())
  await heading('気分やリクエストはある？')
  if (a.mood)
    await user.type(screen.getByRole('textbox', { name: '気分やリクエストはある？' }), a.mood)
  await user.click(screen.getByRole('button', { name: '次へ' }))
  await heading('この条件で提案します')
}

function checkedRadio() {
  const checked = screen.getAllByRole('radio').find((r) => (r as HTMLInputElement).checked)
  if (!checked) throw new Error('選ばれている答えがありません')
  return checked
}

/** インタビューに答えて提案してもらう */
async function suggest(user: User, a: Answers = {}) {
  await answer(user, a)
  await user.click(screen.getByRole('button', { name: '献立を提案してもらう' }))
}

describe('MealsScreen インタビュー（D-53）', () => {
  it('前回の結果がなければ質問 1 から始まり、何問目かが分かる', async () => {
    setup()
    expect(await heading('調理時間はどのくらい？')).toBeInTheDocument()
    expect(screen.getByText('1 / 6')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '戻る' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'やめる' })).not.toBeInTheDocument()
  })

  it('既定は 30 分・在庫のみ・汁物あり・どちらでも。答えた条件で提案を依頼する', async () => {
    const { api, user } = setup()
    await heading('調理時間はどのくらい？')
    expect(radio('30 分')).toBeChecked()
    await user.click(radio('指定なし'))
    expect(radio('在庫のみ')).toBeChecked()
    await user.click(radio('買い足し OK'))
    await heading('使いたい食材はある？')
    expect(screen.getByText('3 / 6')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: '鶏もも肉' }))
    await user.click(screen.getByRole('button', { name: '次へ' }))
    expect(radio('あり')).toBeChecked()
    await user.click(radio('なし'))
    expect(radio('どちらでも')).toBeChecked()
    await user.click(radio('どちらでも'))
    await user.type(
      screen.getByRole('textbox', { name: '気分やリクエストはある？' }),
      '和食でさっぱり',
    )
    await user.click(screen.getByRole('button', { name: '次へ' }))

    const confirm = (await heading('この条件で提案します')).closest('section')!
    expect(
      within(confirm)
        .getAllByRole('button', { name: /^(調理時間|食材|使いたい食材|汁物|副菜|気分)/ })
        .map((b) => b.textContent),
    ).toEqual([
      '調理時間指定なし',
      '食材買い足し OK',
      '使いたい食材鶏もも肉',
      '汁物なし',
      '副菜どちらでも',
      '気分和食でさっぱり',
    ])
    await user.click(screen.getByRole('button', { name: '献立を提案してもらう' }))

    expect(api.calls).toEqual([
      {
        maxMinutes: null,
        allowShopping: true,
        soup: false,
        sideMicrowave: false,
        mood: '和食でさっぱり',
        mustUse: ['鶏もも肉'],
      },
    ])
    expect(await screen.findAllByRole('article')).toHaveLength(3)
    expect(screen.queryByRole('heading', { name: 'この条件で提案します' })).not.toBeInTheDocument()
  })

  it('使いたい食材・気分を指定しなければ確認に「なし」と出す', async () => {
    const { user } = setup()
    await answer(user)
    expect(screen.getByRole('button', { name: /^使いたい食材/ })).toHaveTextContent(
      '使いたい食材なし',
    )
    expect(screen.getByRole('button', { name: /^気分/ })).toHaveTextContent('気分なし')
  })

  it('使いたい食材は期限が近い順に、残り日数と色つきで並べ、最初は何も選ばない', async () => {
    const inventory = new FakeInventoryRepository([
      item('豆腐', '2026-10-30'),
      item('ツナ缶', null),
      { ...item('牛乳', '2026-10-27'), expiresOnEstimated: true },
      item('鶏むね肉', '2026-10-25'),
      item('ひき肉', '2026-10-24'),
    ])
    const { user } = setup(undefined, undefined, inventory)
    await user.click(radio('30 分'))
    await user.click(radio('在庫のみ'))
    await heading('使いたい食材はある？')

    const boxes = screen.getAllByRole('checkbox')
    expect(boxes.map((b) => [b.getAttribute('name'), (b as HTMLInputElement).checked])).toEqual([
      ['ひき肉', false],
      ['鶏むね肉', false],
      ['牛乳', false],
      ['豆腐', false],
      ['ツナ缶', false],
    ])
    expect(boxes.map((b) => b.closest('label')!.textContent)).toEqual([
      'ひき肉1 日過ぎ',
      '鶏むね肉今日まで',
      '牛乳あと 2 日・目安',
      '豆腐あと 5 日',
      'ツナ缶',
    ])
    expect(boxes.map((b) => b.closest('label')!.dataset.expiry)).toEqual([
      'expired',
      'soon',
      'soon',
      'ok',
      'unknown',
    ])
    expect(screen.getByRole('checkbox', { name: '牛乳' })).toHaveAccessibleDescription(
      'あと 2 日・目安',
    )
  })

  it('同じ名前の食材は 1 つだけ、期限が近い方で表示する', async () => {
    const inventory = new FakeInventoryRepository([
      { ...item('鶏もも肉', '2026-11-20'), location: 'freezer' },
      item('鶏もも肉', '2026-10-26'),
    ])
    const { user } = setup(undefined, undefined, inventory)
    await user.click(radio('30 分'))
    await user.click(radio('在庫のみ'))
    await heading('使いたい食材はある？')
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByRole('checkbox', { name: '鶏もも肉' })).toHaveAccessibleDescription(
      'あと 1 日',
    )
  })

  it('在庫が空なら使いたい食材を飛ばし（戻るときも）、何問目かはそのまま', async () => {
    const { api, user } = setup(undefined, undefined, new FakeInventoryRepository([]))
    await user.click(radio('30 分'))
    await user.click(radio('在庫のみ'))
    await heading('汁物はつける？')
    expect(screen.getByText('4 / 6')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '戻る' }))
    expect(await heading('食材を買い足してもいい？')).toBeInTheDocument()
    await user.click(radio('在庫のみ'))
    await user.click(radio('あり'))
    await user.click(radio('どちらでも'))
    await user.click(screen.getByRole('button', { name: '次へ' }))
    expect(screen.getByRole('button', { name: /^使いたい食材/ })).toHaveTextContent(
      '使いたい食材なし',
    )
    await user.click(screen.getByRole('button', { name: '献立を提案してもらう' }))
    expect(api.calls[0].mustUse).toEqual([])
  })

  it('「戻る」で 1 つ前の質問に戻り、答えは残っている', async () => {
    const { user } = setup()
    await user.click(radio('15 分'))
    await user.click(radio('買い足し OK'))
    await heading('使いたい食材はある？')
    await user.click(screen.getByRole('checkbox', { name: 'キャベツ' }))
    await user.click(screen.getByRole('button', { name: '戻る' }))
    expect(await heading('食材を買い足してもいい？')).toBeInTheDocument()
    expect(radio('買い足し OK')).toBeChecked()
    await user.click(screen.getByRole('button', { name: '戻る' }))
    expect(radio('15 分')).toBeChecked()
    await user.click(radio('15 分'))
    await user.click(radio('買い足し OK'))
    expect(await screen.findByRole('checkbox', { name: 'キャベツ' })).toBeChecked()
  })

  it('確認で答えの行をタップするとその質問へ戻り、順に進んで確認へ戻る', async () => {
    const { api, user } = setup()
    await answer(user, { mood: '和食' })
    await user.click(screen.getByRole('button', { name: /^汁物/ }))
    expect(await heading('汁物はつける？')).toBeInTheDocument()
    await user.click(radio('なし'))
    await user.click(radio('どちらでも'))
    expect(screen.getByRole('textbox', { name: '気分やリクエストはある？' })).toHaveValue('和食')
    await user.click(screen.getByRole('button', { name: '次へ' }))
    expect(screen.getByRole('button', { name: /^汁物/ })).toHaveTextContent('汁物なし')
    await user.click(screen.getByRole('button', { name: '献立を提案してもらう' }))
    expect(api.calls[0]).toMatchObject({ soup: false, mood: '和食' })
  })

  it('提案に失敗したら確認に留まり、答えは残る', async () => {
    const api = new FakeMealsApi()
    api.error = '今日の提案回数の上限に達しました。明日また使えます'
    const { user } = setup(api)
    await answer(user, { mood: '和食' })
    await user.click(screen.getByRole('button', { name: '献立を提案してもらう' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('今日の提案回数の上限に達しました')
    expect(screen.getByRole('heading', { name: 'この条件で提案します' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^気分/ })).toHaveTextContent('気分和食')
  })
})

describe('MealsScreen 前回の結果があるとき（D-53）', () => {
  async function withLast() {
    const store = memoryStore()
    const first = setup(undefined, store)
    await suggest(first.user, {
      minutes: '15 分',
      shopping: '買い足し OK',
      mustUse: ['キャベツ'],
      soup: 'なし',
      side: 'レンジで',
      mood: '和食',
    })
    await screen.findAllByRole('article')
    first.view.unmount()
    return setup(undefined, store)
  }

  it('結果と「新しく提案してもらう」を出し、インタビューは出さない', async () => {
    await withLast()
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(screen.getByRole('button', { name: '新しく提案してもらう' })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '調理時間はどのくらい？' }),
    ).not.toBeInTheDocument()
  })

  it('「新しく提案してもらう」で質問 1 から始め、前回の答えを選んでおく。使いたい食材と気分は空から', async () => {
    const { api, user } = await withLast()
    await user.click(screen.getByRole('button', { name: '新しく提案してもらう' }))
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    await heading('調理時間はどのくらい？')
    expect(radio('15 分')).toBeChecked()
    await user.click(radio('15 分'))
    expect(radio('買い足し OK')).toBeChecked()
    await user.click(radio('買い足し OK'))
    await heading('使いたい食材はある？')
    expect(screen.getByRole('checkbox', { name: 'キャベツ' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: '次へ' }))
    expect(radio('なし')).toBeChecked()
    await user.click(radio('なし'))
    expect(radio('レンジで')).toBeChecked()
    await user.click(radio('レンジで'))
    expect(screen.getByRole('textbox', { name: '気分やリクエストはある？' })).toHaveValue('')
    await user.click(screen.getByRole('button', { name: '次へ' }))
    await user.click(screen.getByRole('button', { name: '献立を提案してもらう' }))
    expect(api.calls[0]).toEqual({
      maxMinutes: 15,
      allowShopping: true,
      soup: false,
      sideMicrowave: true,
      mood: '',
      mustUse: [],
    })
  })

  it('どの質問・確認でも「やめる」で前回の結果に戻り、保存した条件は変えない', async () => {
    const { api, user } = await withLast()
    await user.click(screen.getByRole('button', { name: '新しく提案してもらう' }))
    await user.click(radio('45 分'))
    await user.click(screen.getByRole('button', { name: 'やめる' }))
    expect(screen.getAllByRole('article')).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: '別の案を出す' }))
    expect(api.calls[0]).toMatchObject({ maxMinutes: 15, mood: '和食', mustUse: ['キャベツ'] })

    await screen.findAllByRole('article')
    await user.click(screen.getByRole('button', { name: '新しく提案してもらう' }))
    expect(radio('15 分')).toBeChecked()
    await answer(user)
    await user.click(screen.getByRole('button', { name: 'やめる' }))
    expect(screen.getAllByRole('article')).toHaveLength(3)
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
  it('画面を離れて戻っても、前の提案と条件が残り、レシピを開ける', async () => {
    const { store, view, user } = setup()
    await suggest(user, { minutes: '15 分' })
    await screen.findAllByRole('article')
    view.unmount()

    setup(new FakeMealsApi(), store)
    expect(screen.getAllByRole('article')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: '新しく提案してもらう' }))
    expect(radio('15 分')).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'やめる' }))
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
    await suggest(user)
    const card = await screen.findByRole('article', { name: FIRST })
    expect(card).not.toHaveTextContent('冷凍・要解凍')
    await user.click(within(card).getByRole('button', { name: 'レシピを見る' }))
    expect(screen.queryByRole('region', { name: '解凍の案内' })).not.toBeInTheDocument()
  })
})

describe('MealsScreen 副菜をレンジで（D-50）', () => {
  /** 「レンジ」の印が付いている料理名 */
  const microwaveNames = (container: HTMLElement) =>
    within(container)
      .queryAllByText('レンジ')
      .map((badge) => badge.parentElement!.textContent!.replace(/^＋ /, '').split(/レンジ| /)[0])

  it('「レンジで」を選ぶと、その条件で提案を依頼し、案とレシピの副菜にだけ印を付ける', async () => {
    const { api, user } = setup()
    await suggest(user, { side: 'レンジで' })
    expect(api.calls[0].sideMicrowave).toBe(true)

    const card = await screen.findByRole('article', { name: FIRST })
    expect(microwaveNames(card)).toEqual(['キャベツの浅漬け'])

    await user.click(within(card).getByRole('button', { name: 'レシピを見る' }))
    const dialog = screen.getByRole('dialog', { name: '鶏の照り焼き' })
    expect(
      within(within(dialog).getByRole('region', { name: '副菜 キャベツの浅漬け' })).getByRole(
        'heading',
      ),
    ).toHaveTextContent('レンジ')
    expect(within(dialog).getByRole('region', { name: '主菜 鶏の照り焼き' })).not.toHaveTextContent(
      'レンジ',
    )
    expect(
      within(dialog).getByRole('region', { name: '汁物 わかめの味噌汁' }),
    ).not.toHaveTextContent('レンジ')
  })

  it('「どちらでも」なら印を付けない', async () => {
    const { user } = setup()
    await suggest(user)
    const card = await screen.findByRole('article', { name: FIRST })
    expect(microwaveNames(card)).toEqual([])
  })

  it('提案のあとでインタビューで「どちらでも」を選んでやめても、表示中の案の印は消えない', async () => {
    const { user } = setup()
    await suggest(user, { side: 'レンジで' })
    await screen.findByRole('article', { name: FIRST })
    await user.click(screen.getByRole('button', { name: '新しく提案してもらう' }))
    await answer(user, { side: 'どちらでも' })
    await user.click(screen.getByRole('button', { name: 'やめる' }))
    expect(microwaveNames(screen.getByRole('article', { name: FIRST }))).toEqual([
      'キャベツの浅漬け',
    ])
  })

  it('画面を離れて戻っても「レンジで」の条件と印が残る（D-43）', async () => {
    const store = memoryStore()
    const first = setup(undefined, store)
    await suggest(first.user, { side: 'レンジで' })
    await screen.findByRole('article', { name: FIRST })
    first.view.unmount()

    const { user } = setup(undefined, store)
    expect(microwaveNames(screen.getByRole('article', { name: FIRST }))).toEqual([
      'キャベツの浅漬け',
    ])
    await user.click(screen.getByRole('button', { name: '新しく提案してもらう' }))
    await user.click(radio('30 分'))
    await user.click(radio('在庫のみ'))
    await user.click(await screen.findByRole('button', { name: '次へ' }))
    await user.click(radio('あり'))
    expect(radio('レンジで')).toBeChecked()
  })

  it('印の付いた料理を★保存すると「レンジで作る料理」として保存し、印がなければそうしない', async () => {
    const { recipes, user } = setup()
    await suggest(user, { side: 'レンジで' })
    const card = await screen.findByRole('article', { name: FIRST })
    await user.click(within(card).getByRole('button', { name: 'レシピを見る' }))
    const dialog = screen.getByRole('dialog', { name: '鶏の照り焼き' })
    await user.click(within(dialog).getByRole('button', { name: 'キャベツの浅漬けを保存' }))
    await user.click(within(dialog).getByRole('button', { name: '鶏の照り焼きを保存' }))

    expect(recipes.saved.map((d) => [d.name, d.microwave])).toEqual([
      ['鶏の照り焼き', false],
      ['キャベツの浅漬け', true],
    ])
  })

  it('「レンジで作る料理」として★保存した料理は、「どちらでも」で提案しても主菜・副菜・汁物のどれでも印を付ける', async () => {
    const recipes = new FakeRecipesRepository([
      { ...SAMPLE_SUGGESTIONS[0].main, microwave: true },
      { ...SAMPLE_SUGGESTIONS[0].soup!, microwave: false },
    ])
    const { user } = setup(undefined, undefined, undefined, recipes)
    await suggest(user)
    const card = await screen.findByRole('article', { name: FIRST })
    await waitFor(() => expect(microwaveNames(card)).toEqual(['鶏の照り焼き']))

    // ★を外すと記録も印も消えるので、もう一度保存すると「レンジで作る料理」ではなくなる
    await user.click(within(card).getByRole('button', { name: 'レシピを見る' }))
    const dialog = screen.getByRole('dialog', { name: '鶏の照り焼き' })
    const star = within(dialog).getByRole('button', { name: '鶏の照り焼きを保存' })
    await user.click(star)
    expect(recipes.saved.map((d) => d.name)).not.toContain('鶏の照り焼き')
    expect(microwaveNames(card)).toEqual([])
    await user.click(star)
    expect(recipes.saved.find((d) => d.name === '鶏の照り焼き')?.microwave).toBe(false)
  })
})
