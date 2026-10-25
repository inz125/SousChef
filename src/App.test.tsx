import { render, screen } from '@testing-library/react'
import App from './App'
import { FakeAuth } from './auth/FakeAuth'

describe('App', () => {
  it('未ログインならログイン画面を表示する', async () => {
    render(<App auth={new FakeAuth()} />)
    expect(await screen.findByRole('heading', { name: 'SousChef' })).toBeInTheDocument()
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument()
  })

  it('ログイン済みならホームを表示する', async () => {
    render(<App auth={new FakeAuth({ signedInAs: 'me@example.com' })} />)
    expect(await screen.findByRole('button', { name: 'ログアウト' })).toBeInTheDocument()
  })
})
