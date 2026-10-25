import { render, screen } from '@testing-library/react'
import App from './App'
import { FakeAuth } from './auth/FakeAuth'
import { FakeInventoryRepository } from './inventory/FakeInventoryRepository'

const renderApp = (auth: FakeAuth) =>
  render(<App auth={auth} inventory={new FakeInventoryRepository()} today="2026-10-25" />)

describe('App', () => {
  it('未ログインならログイン画面を表示する', async () => {
    renderApp(new FakeAuth())
    expect(await screen.findByRole('heading', { name: 'SousChef' })).toBeInTheDocument()
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument()
  })

  it('ログイン済みなら在庫画面を表示する', async () => {
    renderApp(new FakeAuth({ signedInAs: 'me@example.com' }))
    expect(await screen.findByRole('tab', { name: 'すべて' })).toBeInTheDocument()
  })
})
