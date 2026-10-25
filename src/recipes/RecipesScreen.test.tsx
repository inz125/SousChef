import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SAMPLE_SUGGESTIONS } from '../meals/FakeMealsApi'
import { FakeRecipesRepository } from './FakeRecipesRepository'
import { RecipesScreen } from './RecipesScreen'

const teriyaki = SAMPLE_SUGGESTIONS[0].main
const pickles = SAMPLE_SUGGESTIONS[0].side

function setup(repo = new FakeRecipesRepository([pickles, teriyaki])) {
  render(<RecipesScreen repo={repo} />)
  return { repo, user: userEvent.setup() }
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
