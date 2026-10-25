import { act, render, screen } from '@testing-library/react'
import App from './App'
import { FakeAuth } from './auth/FakeAuth'
import { FakeInventoryRepository } from './inventory/FakeInventoryRepository'

describe('App', () => {
  it('未ログインならログイン画面を表示する', async () => {
    render(
      <App
        auth={new FakeAuth()}
        inventory={new FakeInventoryRepository()}
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
        now={() => now}
      />,
    )
    expect(await screen.findByRole('listitem', { name: '牛乳' })).toHaveTextContent('あと1日')

    now = new Date(2026, 9, 26, 7, 0)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(await screen.findByText('今日まで')).toBeInTheDocument()
  })
})
