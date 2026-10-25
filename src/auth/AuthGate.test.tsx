import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthGate } from './AuthGate'
import { FakeAuth } from './FakeAuth'

function setup(auth = new FakeAuth({ users: { 'me@example.com': 'correct-horse' } })) {
  render(<AuthGate auth={auth}>{(session) => <p>アプリ本体（{session.email}）</p>}</AuthGate>)
  return { auth, user: userEvent.setup() }
}

async function signIn(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(await screen.findByLabelText('メールアドレス'), email)
  await user.type(screen.getByLabelText('パスワード'), password)
  await user.click(screen.getByRole('button', { name: 'ログイン' }))
}

describe('AuthGate（D-15: メールアドレスとパスワード）', () => {
  it('未ログインならログイン画面を表示し、アプリ本体は表示しない', async () => {
    setup()
    expect(await screen.findByLabelText('メールアドレス')).toBeInTheDocument()
    expect(screen.queryByText(/アプリ本体/)).not.toBeInTheDocument()
  })

  it('iPhone のパスワード自動入力が使えるよう、入力欄の種類を指定する', async () => {
    setup()
    expect(await screen.findByLabelText('メールアドレス')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('パスワード')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('パスワード')).toHaveAttribute('autocomplete', 'current-password')
  })

  it('正しいメールアドレスとパスワードでログインするとアプリ本体を表示する', async () => {
    const { user } = setup()
    await signIn(user, 'me@example.com', 'correct-horse')
    expect(await screen.findByText('アプリ本体（me@example.com）')).toBeInTheDocument()
  })

  it('前後の空白は無視してメールアドレスを送る', async () => {
    const { user } = setup()
    await signIn(user, '  me@example.com ', 'correct-horse')
    expect(await screen.findByText(/アプリ本体/)).toBeInTheDocument()
  })

  it('パスワードが違えばエラーを表示し、パスワード欄を空にする', async () => {
    const { user } = setup()
    await signIn(user, 'me@example.com', 'wrong')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'メールアドレスかパスワードが違います',
    )
    expect(screen.getByLabelText('パスワード')).toHaveValue('')
    expect(screen.getByLabelText('メールアドレス')).toHaveValue('me@example.com')
    expect(screen.queryByText(/アプリ本体/)).not.toBeInTheDocument()
  })

  it('入力し直すと前のエラーは消える', async () => {
    const { user } = setup()
    await signIn(user, 'me@example.com', 'wrong')
    await screen.findByRole('alert')
    await user.type(screen.getByLabelText('パスワード'), 'c')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ログイン済みならアプリ本体を表示し、ログアウトできる', async () => {
    const auth = new FakeAuth({ signedInAs: 'me@example.com' })
    const { user } = setup(auth)
    expect(await screen.findByText('アプリ本体（me@example.com）')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(await screen.findByLabelText('メールアドレス')).toBeInTheDocument()
  })
})
