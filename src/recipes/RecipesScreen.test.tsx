import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FakeInventoryRepository } from '../inventory/FakeInventoryRepository'
import { SAMPLE_SUGGESTIONS } from '../meals/FakeMealsApi'
import { FakeRecipesRepository } from './FakeRecipesRepository'
import type { CookingRecord, Dish, SuggestedDish } from './RecipesRepository'
import { RecipesScreen } from './RecipesScreen'

const teriyaki = SAMPLE_SUGGESTIONS[0].main
const pickles = SAMPLE_SUGGESTIONS[0].side

function setup(
  repo = new FakeRecipesRepository([pickles, teriyaki]),
  location: 'fridge' | 'freezer' = 'fridge',
) {
  const inventory = new FakeInventoryRepository([
    {
      id: 'c1',
      name: '鶏もも肉',
      category: 'meat',
      location,
      quantity: 'enough',
      expiresOn: null,
      expiresOnEstimated: false,
      thawedOn: null,
    },
  ])
  render(<RecipesScreen repo={repo} inventory={inventory} today="2026-10-25" />)
  return { repo, inventory, user: userEvent.setup() }
}

describe('RecipesScreen ★保存した料理（D-39）', () => {
  it('保存した料理を新しい順に並べる', async () => {
    setup()
    const list = await screen.findByRole('list', { name: '保存した料理' })
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['キャベツの浅漬け', '鶏の照り焼き'])
  })

  it('タップするとレシピを表示する', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: '鶏の照り焼き' }))
    const dialog = screen.getByRole('dialog', { name: '鶏の照り焼き' })
    expect(within(dialog).getByRole('list', { name: '手順' })).toHaveTextContent('鶏肉を焼く')
    expect(within(dialog).getByRole('button', { name: '鶏の照り焼きを保存' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('「レンジで作る料理」として保存した料理のレシピには「レンジ」の印を付ける（D-50）', async () => {
    const { user } = setup(
      new FakeRecipesRepository([
        { ...pickles, microwave: true },
        { ...teriyaki, microwave: false },
      ]),
    )
    await user.click(await screen.findByRole('button', { name: 'キャベツの浅漬け' }))
    const dialog = screen.getByRole('dialog', { name: 'キャベツの浅漬け' })
    expect(within(dialog).getByRole('heading', { name: /キャベツの浅漬け/ })).toHaveTextContent(
      'レンジ',
    )
    await user.click(within(dialog).getByRole('button', { name: '閉じる' }))

    await user.click(screen.getByRole('button', { name: '鶏の照り焼き' }))
    expect(screen.getByRole('dialog', { name: '鶏の照り焼き' })).not.toHaveTextContent('レンジ')
  })

  it('冷凍の肉を使うレシピは、今の在庫で「冷凍・要解凍」の印と解凍の案内を出す（D-49）', async () => {
    const { user } = setup(undefined, 'freezer')
    await user.click(await screen.findByRole('button', { name: '鶏の照り焼き' }))
    const dialog = screen.getByRole('dialog', { name: '鶏の照り焼き' })
    expect(await within(dialog).findByRole('region', { name: '解凍の案内' })).toHaveTextContent(
      '冷凍の 鶏もも肉 を使います',
    )
    expect(dialog).toHaveTextContent('冷凍・要解凍')
  })

  it('★を外して閉じると一覧から消える', async () => {
    const { repo, user } = setup()
    await user.click(await screen.findByRole('button', { name: '鶏の照り焼き' }))
    await user.click(screen.getByRole('button', { name: '鶏の照り焼きを保存' }))
    await user.click(screen.getByRole('button', { name: '閉じる' }))

    expect(screen.queryByRole('button', { name: '鶏の照り焼き' })).not.toBeInTheDocument()
    expect(repo.saved.map((d) => d.name)).toEqual(['キャベツの浅漬け'])
  })

  it('保存した料理がなければ案内を表示する', async () => {
    setup(new FakeRecipesRepository())
    expect(await screen.findByText(/献立のレシピで★を押すと/)).toBeInTheDocument()
  })
})

const record = (cookedOn: string, dishes: Dish[] | string[], actorName = 'はな'): CookingRecord => {
  const withRecipe = typeof dishes[0] !== 'string'
  return {
    cookedOn,
    dishNames: withRecipe ? (dishes as Dish[]).map((d) => d.name) : (dishes as string[]),
    dishes: withRecipe ? (dishes as Dish[]) : null,
    actorName,
  }
}

const calendar = () => screen.getByRole('grid', { name: /調理履歴/ })

describe('RecipesScreen 調理履歴のカレンダー（D-45）', () => {
  it('今月のカレンダーを日曜始まりで出し、作った日に印を付け、今日の記録を表示する', async () => {
    const repo = new FakeRecipesRepository()
    repo.records = [
      record('2026-10-25', [teriyaki, pickles], 'けん'),
      record('2026-10-20', ['カレー']),
      record('2026-09-30', ['肉じゃが']),
    ]
    setup(repo)

    expect(await screen.findByRole('heading', { name: '2026年10月' })).toBeInTheDocument()
    expect(
      within(calendar())
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['日', '月', '火', '水', '木', '金', '土'])
    expect(await within(calendar()).findByRole('button', { name: '10月20日 作った日' }))
    expect(within(calendar()).getByRole('button', { name: '10月25日 作った日' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(calendar()).getByRole('button', { name: '10月21日' })).toBeInTheDocument()
    expect(repo.historyCalls.at(-1)).toEqual(['2026-10-01', '2026-10-31'])

    const day = screen.getByRole('list', { name: '10月25日の記録' })
    expect(within(day).getByRole('listitem')).toHaveTextContent(
      '鶏の照り焼き・キャベツの浅漬けけん',
    )
  })

  it('日付をタップするとその日の記録を記録ごとに表示し、作っていない日は案内を出す', async () => {
    const repo = new FakeRecipesRepository()
    // 履歴は新しい順。画面ではその日に作った順に並べる
    repo.records = [record('2026-10-20', ['うどん'], 'けん'), record('2026-10-20', ['カレー'])]
    const { user } = setup(repo)

    await user.click(await within(calendar()).findByRole('button', { name: '10月20日 作った日' }))
    const rows = within(screen.getByRole('list', { name: '10月20日の記録' })).getAllByRole(
      'listitem',
    )
    expect(rows.map((r) => r.textContent)).toEqual(['カレーはな', 'うどんけん'])

    await user.click(within(calendar()).getByRole('button', { name: '10月21日' }))
    expect(screen.getByText('この日の記録はありません')).toBeInTheDocument()
  })

  it('前の月・次の月へ移り、その月の作った日に印を付ける', async () => {
    const repo = new FakeRecipesRepository()
    repo.records = [record('2026-09-30', ['肉じゃが'])]
    const { user } = setup(repo)

    await user.click(await screen.findByRole('button', { name: '前の月' }))
    expect(screen.getByRole('heading', { name: '2026年9月' })).toBeInTheDocument()
    expect(
      await within(calendar()).findByRole('button', { name: '9月30日 作った日' }),
    ).toBeInTheDocument()
    expect(repo.historyCalls.at(-1)).toEqual(['2026-09-01', '2026-09-30'])

    await user.click(screen.getByRole('button', { name: '次の月' }))
    await user.click(screen.getByRole('button', { name: '次の月' }))
    expect(screen.getByRole('heading', { name: '2026年11月' })).toBeInTheDocument()
  })

  it('履歴から開いたレシピも、「レンジで作る料理」として保存した料理なら「レンジ」の印を付ける（D-50）', async () => {
    const repo = new FakeRecipesRepository([{ ...pickles, microwave: true }])
    repo.records = [record('2026-10-25', [teriyaki, pickles])]
    const { user } = setup(repo)

    const day = await screen.findByRole('list', { name: '10月25日の記録' })
    await user.click(within(day).getByRole('button', { name: 'キャベツの浅漬け' }))
    expect(screen.getByRole('dialog', { name: 'キャベツの浅漬け' })).toHaveTextContent('レンジ')
    await user.click(screen.getByRole('button', { name: '閉じる' }))
    await user.click(within(day).getByRole('button', { name: '鶏の照り焼き' }))
    expect(screen.getByRole('dialog', { name: '鶏の照り焼き' })).not.toHaveTextContent('レンジ')
  })

  it('レシピを記録した料理はタップでレシピを開け、★保存と「作った」ができる', async () => {
    const repo = new FakeRecipesRepository()
    repo.records = [record('2026-10-25', [teriyaki, pickles])]
    const { user } = setup(repo)

    const day = await screen.findByRole('list', { name: '10月25日の記録' })
    await user.click(within(day).getByRole('button', { name: 'キャベツの浅漬け' }))
    const dialog = screen.getByRole('dialog', { name: 'キャベツの浅漬け' })
    expect(within(dialog).getByRole('list', { name: '手順' })).toHaveTextContent('揉む')
    const star = within(dialog).getByRole('button', { name: 'キャベツの浅漬けを保存' })
    await user.click(star)
    expect(repo.saved.map((d) => d.name)).toEqual(['キャベツの浅漬け'])

    await user.click(within(dialog).getByRole('button', { name: '作った' }))
    await user.click(await screen.findByRole('button', { name: '在庫を更新して記録する' }))
    await waitFor(() => expect(repo.records).toHaveLength(2))
    expect(repo.records[0].dishNames).toEqual(['キャベツの浅漬け'])
  })

  it('レシピを記録する前の記録は、料理名をタップできない', async () => {
    const repo = new FakeRecipesRepository()
    repo.records = [record('2026-10-25', ['カレー'])]
    setup(repo)
    const day = await screen.findByRole('list', { name: '10月25日の記録' })
    expect(within(day).getByText('カレー')).toBeInTheDocument()
    expect(within(day).queryByRole('button')).not.toBeInTheDocument()
  })

  it('保存した料理のレシピから「作った」を記録でき、カレンダーの今日の記録に加わる', async () => {
    const { repo, inventory, user } = setup()
    await user.click(await screen.findByRole('button', { name: '鶏の照り焼き' }))
    await user.click(screen.getByRole('button', { name: '作った' }))
    const chicken = await screen.findByRole('group', { name: '鶏もも肉' })
    await user.click(within(chicken).getByRole('radio', { name: '使い切った' }))
    await user.click(screen.getByRole('button', { name: '在庫を更新して記録する' }))

    const day = await screen.findByRole('list', { name: '10月25日の記録' })
    expect(await within(day).findByRole('button', { name: '鶏の照り焼き' })).toBeInTheDocument()
    expect(repo.records[0].dishNames).toEqual(['鶏の照り焼き'])
    expect(inventory.items).toEqual([])
  })
})

const suggested = (
  dish: Dish,
  suggestedOn: string,
  actorName = 'けん',
  microwave = false,
): SuggestedDish => ({ dish, microwave, suggestedOn, actorName })

const soup: Dish = { name: '豆腐の味噌汁', minutes: 10, ingredients: [], steps: ['煮る'] }

describe('RecipesScreen 最近提案された料理（D-51）', () => {
  it('「保存した料理」と「調理履歴」の間に、7 日以内に提案された料理を新しい順に日付・提案した人つきで並べる', async () => {
    const repo = new FakeRecipesRepository()
    repo.suggested = [
      suggested(teriyaki, '2026-10-25', 'はな'),
      suggested(soup, '2026-10-19'),
      suggested(pickles, '2026-10-18'),
    ]
    setup(repo)

    const list = await screen.findByRole('list', { name: '最近提案された料理' })
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['鶏の照り焼き10/25 はな', '豆腐の味噌汁10/19 けん'])
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      '保存した料理',
      '最近提案された料理',
      '調理履歴',
    ])
  })

  it('料理名をタップするとレシピを開き、★保存と「作った」ができる', async () => {
    const repo = new FakeRecipesRepository()
    repo.suggested = [suggested(teriyaki, '2026-10-25')]
    const { user } = setup(repo)

    const list = await screen.findByRole('list', { name: '最近提案された料理' })
    await user.click(within(list).getByRole('button', { name: '鶏の照り焼き' }))
    const dialog = screen.getByRole('dialog', { name: '鶏の照り焼き' })
    expect(within(dialog).getByRole('list', { name: '手順' })).toHaveTextContent('鶏肉を焼く')
    await user.click(within(dialog).getByRole('button', { name: '鶏の照り焼きを保存' }))
    expect(repo.saved).toEqual([{ ...teriyaki, microwave: false }])

    await user.click(within(dialog).getByRole('button', { name: '作った' }))
    await user.click(await screen.findByRole('button', { name: '在庫を更新して記録する' }))
    await waitFor(() => expect(repo.records).toHaveLength(1))
    expect(repo.records[0].dishNames).toEqual(['鶏の照り焼き'])
    // 「作った」を記録しても、最近提案された料理からは消さない
    expect(
      within(screen.getByRole('list', { name: '最近提案された料理' })).getByRole('button', {
        name: '鶏の照り焼き',
      }),
    ).toBeInTheDocument()
  })

  it('「レンジ」の印が付いていた料理は、行とレシピに印を付け、★保存で「レンジで作る料理」として覚える（D-50）', async () => {
    const repo = new FakeRecipesRepository()
    repo.suggested = [
      suggested(pickles, '2026-10-25', 'けん', true),
      suggested(teriyaki, '2026-10-25'),
    ]
    const { user } = setup(repo)

    const list = await screen.findByRole('list', { name: '最近提案された料理' })
    const [first, second] = within(list).getAllByRole('listitem')
    expect(first).toHaveTextContent('レンジ')
    expect(second).not.toHaveTextContent('レンジ')

    await user.click(within(first).getByRole('button', { name: 'キャベツの浅漬け' }))
    const dialog = screen.getByRole('dialog', { name: 'キャベツの浅漬け' })
    expect(within(dialog).getByRole('heading', { name: /キャベツの浅漬け/ })).toHaveTextContent(
      'レンジ',
    )
    await user.click(within(dialog).getByRole('button', { name: 'キャベツの浅漬けを保存' }))
    expect(repo.saved).toEqual([{ ...pickles, microwave: true }])
  })

  it('7 日以内に提案された料理がなければ案内を表示する', async () => {
    const repo = new FakeRecipesRepository()
    repo.suggested = [suggested(teriyaki, '2026-10-18')]
    setup(repo)
    expect(await screen.findByText('献立を提案すると、ここに 7 日間残ります')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '最近提案された料理' })).not.toBeInTheDocument()
  })

  it('オフラインでは表示せず、オンラインに戻ったら読み直す（D-17）', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      const repo = new FakeRecipesRepository()
      repo.suggested = [suggested(teriyaki, '2026-10-25')]
      setup(repo)
      await screen.findByRole('heading', { name: '調理履歴' })
      expect(screen.queryByRole('heading', { name: '最近提案された料理' })).not.toBeInTheDocument()
      expect(repo.suggestedCalls).toBe(0)

      online.mockReturnValue(true)
      act(() => void window.dispatchEvent(new Event('online')))
      const list = await screen.findByRole('list', { name: '最近提案された料理' })
      expect(within(list).getByRole('button', { name: '鶏の照り焼き' })).toBeInTheDocument()
    } finally {
      online.mockRestore()
    }
  })
})
