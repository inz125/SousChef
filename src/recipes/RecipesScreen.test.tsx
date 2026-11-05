import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FakeInventoryRepository } from '../inventory/FakeInventoryRepository'
import { SAMPLE_SUGGESTIONS } from '../meals/FakeMealsApi'
import { FakeRecipesRepository } from './FakeRecipesRepository'
import type { CookingRecord, Dish, SuggestedDish } from './RecipesRepository'
import { RecipesScreen } from './RecipesScreen'

const teriyaki = SAMPLE_SUGGESTIONS[0].main
const pickles = SAMPLE_SUGGESTIONS[0].side!

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

const suggested = (
  dish: Dish,
  suggestedOn: string,
  actorName = 'けん',
  microwave = false,
): SuggestedDish => ({ dish, microwave, suggestedOn, actorName })

const soup: Dish = { name: '豆腐の味噌汁', minutes: 10, ingredients: [], steps: ['煮る'] }

/** 上部の切替で区分を選ぶ（D-58） */
const openTab = async (name: '保存' | '最近の提案' | '調理履歴') =>
  userEvent.setup().click(await screen.findByRole('tab', { name }))

describe('RecipesScreen 区分の切替（D-58）', () => {
  it('開いたときは「保存」を選び、保存した料理だけを表示する', async () => {
    const repo = new FakeRecipesRepository([teriyaki])
    repo.suggested = [suggested(soup, '2026-10-25')]
    setup(repo)
    expect(
      (await screen.findAllByRole('tab')).map((t) => [
        t.textContent,
        t.getAttribute('aria-selected'),
      ]),
    ).toEqual([
      ['保存', 'true'],
      ['最近の提案', 'false'],
      ['調理履歴', 'false'],
    ])
    expect(await screen.findByRole('list', { name: '保存した料理' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '最近提案された料理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('grid', { name: /調理履歴/ })).not.toBeInTheDocument()
  })

  it('「最近の提案」「調理履歴」を選ぶと、その区分だけを表示する', async () => {
    const repo = new FakeRecipesRepository([teriyaki])
    repo.suggested = [suggested(soup, '2026-10-25')]
    setup(repo)

    await openTab('最近の提案')
    expect(await screen.findByRole('list', { name: '最近提案された料理' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '保存した料理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('grid', { name: /調理履歴/ })).not.toBeInTheDocument()

    await openTab('調理履歴')
    expect(screen.getByRole('grid', { name: /調理履歴/ })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '最近提案された料理' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '調理履歴' })).toHaveAttribute('aria-selected', 'true')
  })
})

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
    // 修正できるのは献立の提案結果だけ（D-64）
    expect(within(dialog).queryByRole('button', { name: /を修正$/ })).not.toBeInTheDocument()
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
    await openTab('調理履歴')

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
    await openTab('調理履歴')

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
    await openTab('調理履歴')

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
    await openTab('調理履歴')

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
    await openTab('調理履歴')

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
    await openTab('調理履歴')
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
    await openTab('調理履歴')

    const day = await screen.findByRole('list', { name: '10月25日の記録' })
    expect(await within(day).findByRole('button', { name: '鶏の照り焼き' })).toBeInTheDocument()
    expect(repo.records[0].dishNames).toEqual(['鶏の照り焼き'])
    expect(inventory.items).toEqual([])
  })
})

describe('RecipesScreen 最近提案された料理（D-51）', () => {
  it('7 日以内に提案された料理を新しい順に日付・提案した人つきで並べる', async () => {
    const repo = new FakeRecipesRepository()
    repo.suggested = [
      suggested(teriyaki, '2026-10-25', 'はな'),
      suggested(soup, '2026-10-19'),
      suggested(pickles, '2026-10-18'),
    ]
    setup(repo)
    await openTab('最近の提案')

    const list = await screen.findByRole('list', { name: '最近提案された料理' })
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['鶏の照り焼き10/25 はな', '豆腐の味噌汁10/19 けん'])
  })

  it('料理名をタップするとレシピを開き、★保存と「作った」ができる', async () => {
    const repo = new FakeRecipesRepository()
    repo.suggested = [suggested(teriyaki, '2026-10-25')]
    const { user } = setup(repo)
    await openTab('最近の提案')

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
    await openTab('最近の提案')

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
    await openTab('最近の提案')
    expect(await screen.findByText('献立を提案すると、ここに 7 日間残ります')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '最近提案された料理' })).not.toBeInTheDocument()
  })

  it('オフラインでは表示せず、オンラインに戻ったら読み直す（D-17）', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      const repo = new FakeRecipesRepository()
      repo.suggested = [suggested(teriyaki, '2026-10-25')]
      setup(repo)
      await openTab('最近の提案')
      expect(await screen.findByText('オフラインでは表示できません')).toBeInTheDocument()
      expect(screen.queryByRole('list', { name: '最近提案された料理' })).not.toBeInTheDocument()
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

describe('RecipesScreen 横スワイプで切替（D-68）', () => {
  const pager = () => document.querySelector<HTMLElement>('.swipe-pager')!
  const selectedTab = () => screen.getByRole('tab', { selected: true })
  const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)))

  /** 指で横（dy を渡せば縦にも）に動かして離す。指を離したあとに届く click も再現する */
  function swipe(dx: number, { dy = 0, target = pager() }: { dy?: number; target?: Element } = {}) {
    const at = (f: number) => ({ pointerId: 1, clientX: 200 + dx * f, clientY: 200 + dy * f })
    fireEvent.pointerDown(target, at(0))
    for (const f of [0.25, 0.5, 0.75, 1]) fireEvent.pointerMove(target, at(f))
    fireEvent.pointerUp(target, at(1))
    fireEvent.click(target)
  }

  function repoWithAll() {
    const repo = new FakeRecipesRepository([teriyaki])
    repo.suggested = [suggested(soup, '2026-10-25')]
    repo.records = [record('2026-10-20', ['カレー'])]
    return repo
  }

  it('左へスワイプすると右隣の区分へ移り、上部の切替も変わる', async () => {
    setup(repoWithAll())
    await screen.findByRole('button', { name: '鶏の照り焼き' })
    swipe(-300)
    await waitFor(() => expect(selectedTab()).toHaveAccessibleName('最近の提案'))
    const list = screen.getByRole('list', { name: '最近提案された料理' })
    expect(within(list).getByRole('button', { name: '豆腐の味噌汁' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '保存した料理' })).not.toBeInTheDocument()

    swipe(-300)
    await waitFor(() => expect(selectedTab()).toHaveAccessibleName('調理履歴'))
    expect(calendar()).toBeInTheDocument()
  })

  it('右へスワイプすると左隣の区分へ移る', async () => {
    setup(repoWithAll())
    await openTab('最近の提案')
    swipe(300)
    await waitFor(() => expect(selectedTab()).toHaveAccessibleName('保存'))
    expect(screen.getByRole('list', { name: '保存した料理' })).toBeInTheDocument()
  })

  it('端では止まり、反対の端へは回らない', async () => {
    setup(repoWithAll())
    await screen.findByRole('button', { name: '鶏の照り焼き' })
    swipe(300)
    await wait(400)
    expect(selectedTab()).toHaveAccessibleName('保存')

    await openTab('調理履歴')
    swipe(-300)
    await wait(400)
    expect(selectedTab()).toHaveAccessibleName('調理履歴')
  })

  it('縦に動かし始めたらスクロールとして扱い、切り替えない', async () => {
    setup(repoWithAll())
    await screen.findByRole('button', { name: '鶏の照り焼き' })
    swipe(-300, { dy: 400 })
    await wait(400)
    expect(selectedTab()).toHaveAccessibleName('保存')
  })

  it('カレンダーの上のスワイプは区分を切り替え、月は変えない。戻ると前の月・選んだ日のまま', async () => {
    const { user } = setup(repoWithAll())
    await openTab('調理履歴')
    await user.click(await screen.findByRole('button', { name: '前の月' }))
    await user.click(within(calendar()).getByRole('button', { name: '9月10日' }))

    swipe(300, { target: within(calendar()).getByRole('button', { name: '9月15日' }) })
    await waitFor(() => expect(selectedTab()).toHaveAccessibleName('最近の提案'))

    await openTab('調理履歴')
    expect(screen.getByRole('heading', { name: '2026年9月' })).toBeInTheDocument()
    expect(within(calendar()).getByRole('button', { name: '9月10日' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('日付の上から横にスワイプしても、その日付を選ばない', async () => {
    setup(repoWithAll())
    await openTab('調理履歴')
    // 端なので区分は変わらない
    swipe(-300, { target: within(calendar()).getByRole('button', { name: '10月20日 作った日' }) })
    await wait(400)
    expect(selectedTab()).toHaveAccessibleName('調理履歴')
    expect(within(calendar()).getByRole('button', { name: '10月20日 作った日' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(within(calendar()).getByRole('button', { name: '10月25日' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('料理名の上から横にスワイプしても、レシピを開かない', async () => {
    setup(repoWithAll())
    swipe(-300, { target: await screen.findByRole('button', { name: '鶏の照り焼き' }) })
    await waitFor(() => expect(selectedTab()).toHaveAccessibleName('最近の提案'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('保存した料理がないときも案内の所でスワイプできる', async () => {
    setup(new FakeRecipesRepository())
    expect(await screen.findByText(/献立のレシピで★を押すと/)).toBeInTheDocument()
    swipe(-300)
    await waitFor(() => expect(selectedTab()).toHaveAccessibleName('最近の提案'))
  })

  it('レシピの画面を開いている間はスワイプで切り替えない', async () => {
    const { user } = setup(repoWithAll())
    await user.click(await screen.findByRole('button', { name: '鶏の照り焼き' }))
    expect(screen.getByRole('dialog', { name: '鶏の照り焼き' })).toBeInTheDocument()
    swipe(-300)
    await wait(400)
    expect(selectedTab()).toHaveAccessibleName('保存')
  })

  it('「作った」の画面を開いている間はスワイプで切り替えない', async () => {
    const { user } = setup(repoWithAll())
    await user.click(await screen.findByRole('button', { name: '鶏の照り焼き' }))
    await user.click(screen.getByRole('button', { name: '作った' }))
    expect(await screen.findByRole('dialog', { name: '使った食材' })).toBeInTheDocument()
    swipe(-300)
    await wait(400)
    expect(selectedTab()).toHaveAccessibleName('保存')
  })

  it('オフラインでも「最近の提案」へ移れて、そこから左右へ移れる', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      setup(repoWithAll())
      await screen.findByRole('button', { name: '鶏の照り焼き' })
      swipe(-300)
      await waitFor(() => expect(selectedTab()).toHaveAccessibleName('最近の提案'))
      expect(screen.getByText('オフラインでは表示できません')).toBeInTheDocument()
      swipe(-300)
      await waitFor(() => expect(selectedTab()).toHaveAccessibleName('調理履歴'))
    } finally {
      online.mockRestore()
    }
  })

  it('スワイプ中は隣の区分も横に並べて描き、上部の切替は動かさない', async () => {
    setup(repoWithAll())
    await screen.findByRole('button', { name: '鶏の照り焼き' })
    fireEvent.pointerDown(pager(), { pointerId: 1, clientX: 200, clientY: 200 })
    fireEvent.pointerMove(pager(), { pointerId: 1, clientX: 150, clientY: 200 })
    fireEvent.pointerMove(pager(), { pointerId: 1, clientX: 100, clientY: 200 })
    const neighbor = document.querySelector<HTMLElement>('.pager-page.neighbor')!
    expect(neighbor).toHaveAttribute('data-side', 'right')
    expect(neighbor).toHaveTextContent('豆腐の味噌汁')
    expect(pager().contains(screen.getByRole('tablist'))).toBe(false)
    fireEvent.pointerUp(pager(), { pointerId: 1, clientX: 100, clientY: 200 })
  })
})
