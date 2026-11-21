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
  const chips = (group: HTMLElement) =>
    within(group)
      .queryAllByRole('listitem')
      .map((li) => li.textContent)

  it('夫婦それぞれの苦手・アレルギーをチップで表示する（自分が先頭。D-81）', async () => {
    setup()
    const ken = await screen.findByRole('group', { name: 'けん' })
    const hana = screen.getByRole('group', { name: 'はな' })
    expect(
      screen
        .getAllByRole('group')
        .filter((g) => ['けん', 'はな'].includes(g.getAttribute('aria-label')!))
        .map((g) => g.getAttribute('aria-label')),
    ).toEqual(['けん', 'はな'])
    expect(chips(within(hana).getByRole('group', { name: '苦手な食材' }))).toEqual(['セロリ'])
    expect(chips(within(ken).getByRole('group', { name: 'アレルギー' }))).toEqual(['えび'])
    expect(screen.queryByRole('button', { name: '保存する' })).not.toBeInTheDocument()
  })

  it('もう一人の分も、追加するとすぐ保存する。「、」「,」で分けて複数足せる（D-81）', async () => {
    const { repo, user } = setup()
    const hana = await screen.findByRole('group', { name: 'はな' })
    const dislikes = within(hana).getByRole('group', { name: '苦手な食材' })
    await user.type(within(dislikes).getByRole('textbox'), 'パクチー, ゴーヤ')
    await user.click(within(dislikes).getByRole('button', { name: '追加' }))
    await waitFor(() => expect(chips(dislikes)).toEqual(['セロリ', 'パクチー', 'ゴーヤ']))
    expect(within(dislikes).getByRole('textbox')).toHaveValue('')
    expect(repo.memberList.find((m) => m.email === 'hana@example.com')).toMatchObject({
      dislikes: ['セロリ', 'パクチー', 'ゴーヤ'],
      allergies: [],
    })

    const allergies = within(hana).getByRole('group', { name: 'アレルギー' })
    await user.type(within(allergies).getByRole('textbox'), 'そば')
    await user.click(within(allergies).getByRole('button', { name: '追加' }))
    await waitFor(() =>
      expect(repo.memberList.find((m) => m.email === 'hana@example.com')).toMatchObject({
        dislikes: ['セロリ', 'パクチー', 'ゴーヤ'],
        allergies: ['そば'],
      }),
    )
  })

  it('「×」で外すとすぐ保存する（D-81）', async () => {
    const { repo, user } = setup()
    const hana = await screen.findByRole('group', { name: 'はな' })
    const dislikes = within(hana).getByRole('group', { name: '苦手な食材' })
    await user.click(within(dislikes).getByRole('button', { name: 'セロリを外す' }))
    await waitFor(() => expect(chips(dislikes)).toEqual([]))
    expect(repo.memberList.find((m) => m.email === 'hana@example.com')!.dislikes).toEqual([])
  })

  it('同じ名前は足さずに知らせ、ほかの名前は足す（D-81）', async () => {
    const { repo, user } = setup()
    const staples = await screen.findByRole('group', { name: '常備している調味料' })
    await user.type(within(staples).getByRole('textbox'), '醤油, 豆板醤')
    await user.click(within(staples).getByRole('button', { name: '追加' }))
    expect(await within(staples).findByRole('alert')).toHaveTextContent('醤油はもう登録しています')
    expect(chips(staples)).toContain('豆板醤')
    expect(repo.stapleList.filter((n) => n === '醤油')).toHaveLength(1)
    expect(repo.stapleList).toContain('豆板醤')
  })

  it('アレルギーは提案から必ず除外されることを説明する', async () => {
    setup()
    expect(await screen.findAllByText(/アレルギーの食材は献立の提案に一切使いません/)).toHaveLength(
      2,
    )
    expect(screen.queryByText(/「、」で区切って入力/)).not.toBeInTheDocument()
    expect(screen.getByText('在庫に登録しなくても、ある前提で献立を提案します')).toBeInTheDocument()
  })

  it('保存に失敗したら一覧を変えずにエラーを表示する（D-81）', async () => {
    const repo = members()
    repo.failSave = true
    const { user } = setup(repo)
    const ken = await screen.findByRole('group', { name: 'けん' })
    const allergies = within(ken).getByRole('group', { name: 'アレルギー' })
    await user.type(within(allergies).getByRole('textbox'), 'かに')
    await user.click(within(allergies).getByRole('button', { name: '追加' }))
    expect(await within(allergies).findByRole('alert')).toHaveTextContent(
      '保存できませんでした。通信状況を確認してください',
    )
    expect(chips(allergies)).toEqual(['えび'])

    await user.click(within(allergies).getByRole('button', { name: 'えびを外す' }))
    expect(chips(allergies)).toEqual(['えび'])
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
    ).toEqual(['卵'])
    // 過去の登録から補完する
    expect(section.querySelector('datalist option[value="牛乳"]')).not.toBeNull()

    await user.type(within(section).getByLabelText('常備食品を追加'), '牛乳')
    await user.click(within(section).getByRole('button', { name: '追加' }))
    await waitFor(() =>
      expect(
        within(section)
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual(['卵', '牛乳']),
    )
    expect(shopping.stockedNames).toEqual(['卵', '牛乳'])
    expect(within(section).getByLabelText('常備食品を追加')).toHaveValue('')

    await user.click(within(section).getByRole('button', { name: '卵を外す' }))
    await waitFor(() => expect(shopping.stockedNames).toEqual(['牛乳']))
    expect(
      within(section)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['牛乳'])
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
