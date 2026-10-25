import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FakeSettingsRepository } from './FakeSettingsRepository'
import { SettingsScreen } from './SettingsScreen'

const members = () =>
  new FakeSettingsRepository([
    { email: 'hana@example.com', displayName: 'はな', dislikes: ['セロリ'], allergies: [] },
    { email: 'ken@example.com', displayName: 'けん', dislikes: [], allergies: ['えび'] },
  ])

function setup(repo = members()) {
  render(<SettingsScreen repo={repo} me="ken@example.com" />)
  return { repo, user: userEvent.setup() }
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
})
