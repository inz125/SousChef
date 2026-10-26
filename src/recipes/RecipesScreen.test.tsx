import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FakeInventoryRepository } from '../inventory/FakeInventoryRepository'
import { SAMPLE_SUGGESTIONS } from '../meals/FakeMealsApi'
import { FakeRecipesRepository } from './FakeRecipesRepository'
import type { CookingRecord, Dish } from './RecipesRepository'
import { RecipesScreen } from './RecipesScreen'

const teriyaki = SAMPLE_SUGGESTIONS[0].main
const pickles = SAMPLE_SUGGESTIONS[0].side

function setup(repo = new FakeRecipesRepository([pickles, teriyaki])) {
  const inventory = new FakeInventoryRepository([
    {
      id: 'c1',
      name: '鶏もも肉',
      category: 'meat',
      location: 'fridge',
      quantity: 'enough',
      expiresOn: null,
      expiresOnEstimated: false,
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
