import { act, render, screen, within } from '@testing-library/react'
import App from './App'
import { FakeAuth } from './auth/FakeAuth'
import { FakeInventoryRepository } from './inventory/FakeInventoryRepository'
import { FakeMealsApi } from './meals/FakeMealsApi'
import { FakeReceiptApi } from './receipt/FakeReceiptApi'
import { FakeRecipesRepository } from './recipes/FakeRecipesRepository'
import { FakeSettingsRepository } from './settings/FakeSettingsRepository'
import { memoryStore } from './offline/offlineCache'
import { FakeAppUpdater } from './update/FakeAppUpdater'
import userEvent from '@testing-library/user-event'

describe('App', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('下部タブで在庫・献立・レシピ・設定を切り替えられる', async () => {
    const user = userEvent.setup()
    render(
      <App
        auth={new FakeAuth({ signedInAs: 'me@example.com' })}
        inventory={new FakeInventoryRepository()}
        settings={new FakeSettingsRepository()}
        meals={new FakeMealsApi()}
        receipt={new FakeReceiptApi()}
        recipes={new FakeRecipesRepository()}
        store={memoryStore()}
        updater={new FakeAppUpdater()}
        now={() => new Date(2026, 9, 25)}
      />,
    )
    const nav = await screen.findByRole('navigation')
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['在庫', '献立', 'レシピ', '設定'])
    expect(within(nav).getByRole('link', { name: '在庫' })).toHaveAttribute('aria-current', 'page')

    await user.click(within(nav).getByRole('link', { name: '献立' }))
    expect(
      await screen.findByRole('heading', { name: '調理時間はどのくらい？' }),
    ).toBeInTheDocument()

    await user.click(within(nav).getByRole('link', { name: 'レシピ' }))
    expect(await screen.findByRole('heading', { name: '保存した料理' })).toBeInTheDocument()

    await user.click(within(nav).getByRole('link', { name: '設定' }))
    expect(await screen.findByLabelText('常備している調味料')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: '設定' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('tab', { name: 'すべて' })).not.toBeInTheDocument()

    await user.click(within(nav).getByRole('link', { name: '在庫' }))
    expect(await screen.findByRole('tab', { name: 'すべて' })).toBeInTheDocument()
  })

  it('ヘッダーに画面名を表示し、ログアウトは設定画面だけに置く（D-41）', async () => {
    const auth = new FakeAuth({ signedInAs: 'me@example.com' })
    render(
      <App
        auth={auth}
        inventory={new FakeInventoryRepository()}
        settings={new FakeSettingsRepository()}
        meals={new FakeMealsApi()}
        receipt={new FakeReceiptApi()}
        recipes={new FakeRecipesRepository()}
        store={memoryStore()}
        updater={new FakeAppUpdater()}
        now={() => new Date(2026, 9, 25)}
      />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: '在庫' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ログアウト' })).not.toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('link', { name: '設定' }))
    expect(await screen.findByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'ログアウト' }))
    expect(await screen.findByLabelText('メールアドレス')).toBeInTheDocument()
  })

  it('下部タブの文字の上にアイコンを付け、選択中のタブのアイコンは塗りつぶしにする（D-55）', async () => {
    render(
      <App
        auth={new FakeAuth({ signedInAs: 'me@example.com' })}
        inventory={new FakeInventoryRepository()}
        settings={new FakeSettingsRepository()}
        meals={new FakeMealsApi()}
        receipt={new FakeReceiptApi()}
        recipes={new FakeRecipesRepository()}
        store={memoryStore()}
        updater={new FakeAppUpdater()}
        now={() => new Date(2026, 9, 25)}
      />,
    )
    const nav = await screen.findByRole('navigation')
    const links = within(nav).getAllByRole('link')
    for (const link of links) {
      const icon = link.querySelector('svg')
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      expect(icon).toHaveAttribute('data-filled', String(link.textContent === '在庫'))
    }

    await userEvent.setup().click(within(nav).getByRole('link', { name: 'レシピ' }))
    expect(within(nav).getByRole('link', { name: 'レシピ' }).querySelector('svg')).toHaveAttribute(
      'data-filled',
      'true',
    )
    expect(within(nav).getByRole('link', { name: '在庫' }).querySelector('svg')).toHaveAttribute(
      'data-filled',
      'false',
    )
  })

  it('未ログインならログイン画面を表示する', async () => {
    render(
      <App
        auth={new FakeAuth()}
        inventory={new FakeInventoryRepository()}
        settings={new FakeSettingsRepository()}
        meals={new FakeMealsApi()}
        receipt={new FakeReceiptApi()}
        recipes={new FakeRecipesRepository()}
        store={memoryStore()}
        updater={new FakeAppUpdater()}
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
        receipt={new FakeReceiptApi()}
        recipes={new FakeRecipesRepository()}
        store={memoryStore()}
        updater={new FakeAppUpdater()}
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
        thawedOn: null,
      },
    ])
    render(
      <App
        auth={new FakeAuth({ signedInAs: 'me@example.com' })}
        inventory={inventory}
        settings={new FakeSettingsRepository()}
        meals={new FakeMealsApi()}
        receipt={new FakeReceiptApi()}
        recipes={new FakeRecipesRepository()}
        store={memoryStore()}
        updater={new FakeAppUpdater()}
        now={() => now}
      />,
    )
    expect(await screen.findByRole('listitem', { name: '牛乳' })).toHaveTextContent('あと1日')

    now = new Date(2026, 9, 26, 7, 0)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(await screen.findByText('今日まで')).toBeInTheDocument()
  })

  it('オフラインになったら閲覧のみであることを表示し、戻ったら消す（D-17）', async () => {
    render(
      <App
        auth={new FakeAuth({ signedInAs: 'me@example.com' })}
        inventory={new FakeInventoryRepository()}
        settings={new FakeSettingsRepository()}
        meals={new FakeMealsApi()}
        receipt={new FakeReceiptApi()}
        recipes={new FakeRecipesRepository()}
        store={memoryStore()}
        updater={new FakeAppUpdater()}
        now={() => new Date(2026, 9, 25)}
      />,
    )
    await screen.findByRole('tab', { name: 'すべて' })
    expect(screen.queryByText(/オフラインです/)).not.toBeInTheDocument()

    act(() => window.dispatchEvent(new Event('offline')))
    expect(screen.getByRole('status', { name: '接続状態' })).toHaveTextContent(
      'オフラインです。最後に同期した内容を表示しています（編集・提案はできません）',
    )

    act(() => window.dispatchEvent(new Event('online')))
    expect(screen.queryByText(/オフラインです/)).not.toBeInTheDocument()
  })

  describe('開いたままの更新（D-52）', () => {
    function renderApp(updater: FakeAppUpdater) {
      render(
        <App
          auth={new FakeAuth({ signedInAs: 'me@example.com' })}
          inventory={new FakeInventoryRepository()}
          settings={new FakeSettingsRepository()}
          meals={new FakeMealsApi()}
          receipt={new FakeReceiptApi()}
          recipes={new FakeRecipesRepository()}
          store={memoryStore()}
          updater={updater}
          now={() => new Date(2026, 9, 25)}
        />,
      )
    }

    it('新しいバージョンがなければ帯を出さない', async () => {
      renderApp(new FakeAppUpdater())
      await screen.findByRole('tab', { name: 'すべて' })
      expect(screen.queryByText('新しいバージョンがあります')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '更新' })).not.toBeInTheDocument()
    })

    it('新しいバージョンが見つかったら帯を出し、タブを移動しても出し続け、「更新」で反映する', async () => {
      const user = userEvent.setup()
      const updater = new FakeAppUpdater()
      renderApp(updater)
      await screen.findByRole('tab', { name: 'すべて' })
      act(() => updater.publish())

      const banner = screen.getByRole('status', { name: '更新' })
      expect(banner).toHaveTextContent('新しいバージョンがあります')
      expect(updater.applied).toBe(false)

      await user.click(screen.getByRole('link', { name: '献立' }))
      expect(screen.getByRole('status', { name: '更新' })).toBeInTheDocument()
      expect(within(banner).queryByRole('button', { name: /閉じる/ })).not.toBeInTheDocument()

      await user.click(
        within(screen.getByRole('status', { name: '更新' })).getByRole('button', { name: '更新' }),
      )
      expect(updater.applied).toBe(true)
    })

    it('オフラインの帯と更新の帯を両方表示する', async () => {
      const updater = new FakeAppUpdater()
      renderApp(updater)
      await screen.findByRole('tab', { name: 'すべて' })
      act(() => updater.publish())
      act(() => window.dispatchEvent(new Event('offline')))
      expect(screen.getByRole('status', { name: '接続状態' })).toBeInTheDocument()
      expect(screen.getByRole('status', { name: '更新' })).toBeInTheDocument()
      act(() => window.dispatchEvent(new Event('online')))
    })
  })
})
