import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FakeInventoryRepository } from '../inventory/FakeInventoryRepository'
import type { CatalogEntry } from '../inventory/InventoryRepository'
import { FakeShoppingRepository } from '../shopping/FakeShoppingRepository'
import { FakeSettingsRepository } from './FakeSettingsRepository'
import { SettingsScreen } from './SettingsScreen'

const members = () =>
  new FakeSettingsRepository([
    { email: 'hana@example.com', displayName: 'はな', dislikes: ['セロリ'], allergies: [] },
    { email: 'ken@example.com', displayName: 'けん', dislikes: [], allergies: ['えび'] },
  ])

function setup(
  repo = members(),
  onSignOut = () => {},
  catalog: CatalogEntry[] = [],
  shopping = new FakeShoppingRepository(),
) {
  render(
    <SettingsScreen
      repo={repo}
      shopping={shopping}
      inventory={new FakeInventoryRepository([], catalog)}
      me="ken@example.com"
      onSignOut={onSignOut}
    />,
  )
  return { repo, shopping, user: userEvent.setup() }
}

describe('SettingsScreen', () => {
  it('夫婦それぞれの苦手・アレルギーを表示する（自分が先頭）', async () => {
    setup()
    const groups = await screen.findAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['けん', 'はな', '常備調味料'])
    expect(within(groups[1]).getByLabelText('苦手な食材')).toHaveValue('セロリ')
    expect(within(groups[0]).getByLabelText('アレルギー')).toHaveValue('えび')
  })

  it('もう一人の分も編集して保存できる', async () => {
    const { repo, user } = setup()
    const hana = await screen.findByRole('group', { name: 'はな' })
    await user.clear(within(hana).getByLabelText('苦手な食材'))
    await user.type(within(hana).getByLabelText('苦手な食材'), 'セロリ、パクチー')
    await user.type(within(hana).getByLabelText('アレルギー'), 'そば')
    await user.click(within(hana).getByRole('button', { name: '保存する' }))

    expect(await within(hana).findByText('保存しました')).toBeInTheDocument()
    expect(repo.memberList.find((m) => m.email === 'hana@example.com')).toMatchObject({
      dislikes: ['セロリ', 'パクチー'],
      allergies: ['そば'],
    })
  })

  it('アレルギーは提案から必ず除外されることを説明する', async () => {
    setup()
    expect(await screen.findAllByText(/アレルギーの食材は献立の提案に一切使いません/)).toHaveLength(
      2,
    )
  })

  it('常備調味料を表示・保存できる', async () => {
    const { repo, user } = setup()
    const staples = await screen.findByLabelText<HTMLTextAreaElement>('常備している調味料')
    expect(staples.value).toContain('醤油')
    await user.type(staples, '、オイスターソース')
    await user.click(
      within(screen.getByRole('group', { name: '常備調味料' })).getByRole('button', {
        name: '保存する',
      }),
    )
    expect(
      await within(screen.getByRole('group', { name: '常備調味料' })).findByText('保存しました'),
    ).toBeInTheDocument()
    expect(repo.stapleList).toContain('オイスターソース')
  })

  it('保存に失敗したらエラーを表示する', async () => {
    const repo = members()
    repo.failSave = true
    const { user } = setup(repo)
    const ken = await screen.findByRole('group', { name: 'けん' })
    await user.click(within(ken).getByRole('button', { name: '保存する' }))
    expect(await within(ken).findByRole('alert')).toHaveTextContent('保存できませんでした')
  })

  it('一番下の「ログアウト」でログアウトする（D-41）', async () => {
    const onSignOut = vi.fn()
    setup(members(), onSignOut)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'ログアウト' }))
    expect(onSignOut).toHaveBeenCalled()
  })

  describe('イラスト待ち（D-56）', () => {
    const entry = (name: string): CatalogEntry => ({ name, category: 'leafy', location: 'fridge' })

    it('補完候補のうちイラストのない食材名を五十音順に並べる', async () => {
      setup(members(), () => {}, [entry('牛乳'), entry('ズッキーニ'), entry('アボカド')])
      const section = await screen.findByRole('region', { name: 'イラスト待ち' })
      expect((await within(section).findAllByRole('listitem')).map((li) => li.textContent)).toEqual(
        ['アボカド', 'ズッキーニ'],
      )
    })

    it('すべてにイラストがあればそう表示する', async () => {
      setup(members(), () => {}, [entry('牛乳')])
      const section = await screen.findByRole('region', { name: 'イラスト待ち' })
      expect(
        await within(section).findByText('すべての食材にイラストがあります'),
      ).toBeInTheDocument()
    })

    it('ログアウトより上に置く', async () => {
      setup(members(), () => {}, [entry('ズッキーニ')])
      const section = await screen.findByRole('region', { name: 'イラスト待ち' })
      const signOut = screen.getByRole('button', { name: 'ログアウト' })
      expect(
        section.compareDocumentPosition(signOut) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })
  })
})

describe('SettingsScreen 常備食品（D-71）', () => {
  it('名前を入れて追加し、「×」で消せる。献立の常備調味料とは別', async () => {
    const shopping = new FakeShoppingRepository({ stocked: ['卵'] })
    const { user } = setup(
      members(),
      () => {},
      [{ name: '牛乳', category: 'dairy', location: 'fridge' }],
      shopping,
    )
    const section = await screen.findByRole('region', { name: '常備食品' })
    expect(
      within(section)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['卵×'])
    // 過去の登録から補完する
    expect(section.querySelector('datalist option[value="牛乳"]')).not.toBeNull()

    await user.type(within(section).getByLabelText('常備食品を追加'), '牛乳')
    await user.click(within(section).getByRole('button', { name: '追加' }))
    await waitFor(() =>
      expect(
        within(section)
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual(['卵×', '牛乳×']),
    )
    expect(shopping.stockedNames).toEqual(['卵', '牛乳'])
    expect(within(section).getByLabelText('常備食品を追加')).toHaveValue('')

    await user.click(within(section).getByRole('button', { name: '卵を外す' }))
    await waitFor(() => expect(shopping.stockedNames).toEqual(['牛乳']))
    expect(
      within(section)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['牛乳×'])
  })

  it('同じ名前は重ねて登録できない', async () => {
    const shopping = new FakeShoppingRepository({ stocked: ['卵'] })
    const { user } = setup(members(), () => {}, [], shopping)
    const section = await screen.findByRole('region', { name: '常備食品' })
    await user.type(within(section).getByLabelText('常備食品を追加'), '卵')
    await user.click(within(section).getByRole('button', { name: '追加' }))
    expect(await within(section).findByRole('alert')).toHaveTextContent('卵はもう登録しています')
    expect(shopping.stockedNames).toEqual(['卵'])
  })

  it('在庫にない食材を登録すると買い物リストにも載る（D-73）', async () => {
    const shopping = new FakeShoppingRepository()
    const { user } = setup(members(), () => {}, [], shopping)
    const section = await screen.findByRole('region', { name: '常備食品' })
    await user.type(within(section).getByLabelText('常備食品を追加'), '納豆')
    await user.click(within(section).getByRole('button', { name: '追加' }))
    await waitFor(() => expect(shopping.names()).toEqual(['納豆']))
  })
})
