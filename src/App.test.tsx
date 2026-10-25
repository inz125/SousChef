import { act, render, screen, within } from '@testing-library/react'
import App from './App'
import { FakeAuth } from './auth/FakeAuth'
import { FakeInventoryRepository } from './inventory/FakeInventoryRepository'
import { FakeMealsApi } from './meals/FakeMealsApi'
import { FakeSettingsRepository } from './settings/FakeSettingsRepository'
import userEvent from '@testing-library/user-event'

describe('App', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('下部タブで在庫・献立・設定を切り替えられる', async () => {
    const user = userEvent.setup()
    render(
      <App
        auth={new FakeAuth({ signedInAs: 'me@example.com' })}
        inventory={new FakeInventoryRepository()}
        settings={new FakeSettingsRepository()}
        meals={new FakeMealsApi()}
        now={() => new Date(2026, 9, 25)}
      />,
    )
    const nav = await screen.findByRole('navigation')
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['在庫', '献立', '設定'])
    expect(within(nav).getByRole('link', { name: '在庫' })).toHaveAttribute('aria-current', 'page')

    await user.click(within(nav).getByRole('link', { name: '献立' }))
    expect(await screen.findByRole('button', { name: '献立を提案してもらう' })).toBeInTheDocument()

    await user.click(within(nav).getByRole('link', { name: '設定' }))
    expect(await screen.findByLabelText('常備している調味料')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: '設定' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('tab', { name: 'すべて' })).not.toBeInTheDocument()

    await user.click(within(nav).getByRole('link', { name: '在庫' }))
    expect(await screen.findByRole('tab', { name: 'すべて' })).toBeInTheDocument()
  })

  it('未ログインならログイン画面を表示する', async () => {
    render(
      <App
        auth={new FakeAuth()}
        inventory={new FakeInventoryRepository()}
        settings={new FakeSettingsRepository()}
        meals={new FakeMealsApi()}
        now={() => new Date(2026, 9, 25)}
      />,
    )
    expect(await screen.findByRole('heading', { name: 'SousChef' })).toBeInTheDocument()
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument()
  })

  it('ログイン済みなら在庫画面を表示する', async () => {
    render(
      <App
        auth={new FakeAuth({ signedInAs: 'me@example.com' })}
        inventory={new FakeInventoryRepository()}
        settings={new FakeSettingsRepository()}
        meals={new FakeMealsApi()}
        now={() => new Date(2026, 9, 25)}
      />,
    )
    expect(await screen.findByRole('tab', { name: 'すべて' })).toBeInTheDocument()
  })

  it('アプリが前面に戻ったら「今日」を更新する（開いたまま日付が変わっても期限表示が古くならない）', async () => {
    let now = new Date(2026, 9, 25, 23, 50)
    const inventory = new FakeInventoryRepository([
      {
        id: '1',
        name: '牛乳',
        category: 'dairy',
        location: 'fridge',
        quantity: 'enough',
        expiresOn: '2026-10-26',
        expiresOnEstimated: false,
      },
    ])
    render(
      <App
        auth={new FakeAuth({ signedInAs: 'me@example.com' })}
        inventory={inventory}
        settings={new FakeSettingsRepository()}
        meals={new FakeMealsApi()}
        now={() => now}
      />,
    )
    expect(await screen.findByRole('listitem', { name: '牛乳' })).toHaveTextContent('あと1日')

    now = new Date(2026, 9, 26, 7, 0)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(await screen.findByText('今日まで')).toBeInTheDocument()
  })
})
