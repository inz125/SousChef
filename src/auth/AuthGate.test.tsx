import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthGate } from './AuthGate'
import { FakeAuth } from './FakeAuth'

function setup(auth = new FakeAuth()) {
  render(
    <AuthGate auth={auth}>
      <p>アプリ本体</p>
    </AuthGate>,
  )
  return { auth, user: userEvent.setup() }
}

describe('AuthGate', () => {
  it('未ログインならメールアドレス入力欄を表示し、アプリ本体は表示しない', async () => {
    setup()
    expect(await screen.findByLabelText('メールアドレス')).toBeInTheDocument()
    expect(screen.queryByText('アプリ本体')).not.toBeInTheDocument()
  })

  it('メールアドレスを送信するとコード入力欄を表示する', async () => {
    const { auth, user } = setup()
    await user.type(await screen.findByLabelText('メールアドレス'), 'me@example.com')
    await user.click(screen.getByRole('button', { name: 'コードを送信' }))

    expect(auth.sentTo).toEqual(['me@example.com'])
    expect(await screen.findByLabelText('ログインコード')).toBeInTheDocument()
    expect(screen.getByText(/me@example.com に送信しました/)).toBeInTheDocument()
  })

  it('コード送信に失敗したらエラーを表示する', async () => {
    const auth = new FakeAuth({ registeredEmails: [] })
    const { user } = setup(auth)
    await user.type(await screen.findByLabelText('メールアドレス'), 'who@example.com')
    await user.click(screen.getByRole('button', { name: 'コードを送信' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('コードを送信できませんでした')
    expect(screen.queryByLabelText('ログインコード')).not.toBeInTheDocument()
  })

  it('正しいコードを入力するとアプリ本体を表示する', async () => {
    const { user } = setup()
    await user.type(await screen.findByLabelText('メールアドレス'), 'me@example.com')
    await user.click(screen.getByRole('button', { name: 'コードを送信' }))
    await user.type(await screen.findByLabelText('ログインコード'), FakeAuth.VALID_CODE)
    await user.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(await screen.findByText('アプリ本体')).toBeInTheDocument()
  })

  it('コードが誤っていたらエラーを表示する', async () => {
    const { user } = setup()
    await user.type(await screen.findByLabelText('メールアドレス'), 'me@example.com')
    await user.click(screen.getByRole('button', { name: 'コードを送信' }))
    await user.type(await screen.findByLabelText('ログインコード'), '000000')
    await user.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('コードが正しくないか、期限切れです')
    expect(screen.queryByText('アプリ本体')).not.toBeInTheDocument()
  })

  it('メールアドレスを入力し直せる', async () => {
    const { user } = setup()
    await user.type(await screen.findByLabelText('メールアドレス'), 'typo@example.com')
    await user.click(screen.getByRole('button', { name: 'コードを送信' }))
    await user.click(await screen.findByRole('button', { name: 'メールアドレスを変更' }))

    expect(screen.getByLabelText('メールアドレス')).toHaveValue('typo@example.com')
  })

  it('メールアドレスを変更すると前のエラーは消える', async () => {
    const { user } = setup()
    await user.type(await screen.findByLabelText('メールアドレス'), 'me@example.com')
    await user.click(screen.getByRole('button', { name: 'コードを送信' }))
    await user.type(await screen.findByLabelText('ログインコード'), '000000')
    await user.click(screen.getByRole('button', { name: 'ログイン' }))
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'メールアドレスを変更' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ログイン済みならアプリ本体を表示し、ログアウトできる', async () => {
    const auth = new FakeAuth({ signedInAs: 'me@example.com' })
    const { user } = setup(auth)
    expect(await screen.findByText('アプリ本体')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(await screen.findByLabelText('メールアドレス')).toBeInTheDocument()
  })
})
