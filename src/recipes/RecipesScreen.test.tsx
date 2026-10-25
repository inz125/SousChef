import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FakeInventoryRepository } from '../inventory/FakeInventoryRepository'
import { SAMPLE_SUGGESTIONS } from '../meals/FakeMealsApi'
import { FakeRecipesRepository } from './FakeRecipesRepository'
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

describe('RecipesScreen 調理履歴（D-39）', () => {
  it('作った日・料理・作った人を新しい順に表示する', async () => {
    const repo = new FakeRecipesRepository()
    repo.records = [
      { cookedOn: '2026-10-25', dishNames: ['カレー'], actorName: 'けん' },
      {
        cookedOn: '2026-10-24',
        dishNames: ['鶏の照り焼き', 'キャベツの浅漬け'],
        actorName: 'はな',
      },
    ]
    setup(repo)
    const history = await screen.findByRole('list', { name: '調理履歴' })
    const rows = within(history).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('10/25カレーけん')
    expect(rows[1]).toHaveTextContent('10/24鶏の照り焼き・キャベツの浅漬けはな')
  })

  it('保存した料理のレシピから「作った」を記録でき、履歴に加わる', async () => {
    const { repo, inventory, user } = setup()
    await user.click(await screen.findByRole('button', { name: '鶏の照り焼き' }))
    await user.click(screen.getByRole('button', { name: '作った' }))
    const chicken = await screen.findByRole('group', { name: '鶏もも肉' })
    await user.click(within(chicken).getByRole('radio', { name: '使い切った' }))
    await user.click(screen.getByRole('button', { name: '在庫を更新して記録する' }))

    const history = await screen.findByRole('list', { name: '調理履歴' })
    expect(await within(history).findByText('鶏の照り焼き')).toBeInTheDocument()
    expect(repo.records[0].dishNames).toEqual(['鶏の照り焼き'])
    expect(inventory.items).toEqual([])
  })
})
