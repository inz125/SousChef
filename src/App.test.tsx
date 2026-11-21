import { act, render, screen, within } from '@testing-library/react'
import App from './App'
import { FakeAuth } from './auth/FakeAuth'
import { FakeInventoryRepository } from './inventory/FakeInventoryRepository'
import { FakeMealsApi, SAMPLE_SUGGESTIONS } from './meals/FakeMealsApi'
import { saveLastSuggestions } from './meals/lastSuggestions'
import { outlineOf } from './meals/MealsApi'
import { FakeReceiptApi } from './receipt/FakeReceiptApi'
import { FakeRecipesRepository } from './recipes/FakeRecipesRepository'
import { FakeSettingsRepository } from './settings/FakeSettingsRepository'
import { FakeShoppingRepository } from './shopping/FakeShoppingRepository'
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
        shopping={new FakeShoppingRepository()}
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
    expect(await screen.findByRole('list', { name: '保存した料理' })).toBeInTheDocument()

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
        shopping={new FakeShoppingRepository()}
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
        shopping={new FakeShoppingRepository()}
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
        shopping={new FakeShoppingRepository()}
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
        shopping={new FakeShoppingRepository()}
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
        shopping={new FakeShoppingRepository()}
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

  it('在庫の期限が近い食材の帯から、その食材を選んだ献立の質問へ移る。戻って来ても使わない（D-76）', async () => {
    const user = userEvent.setup()
    render(
      <App
        auth={new FakeAuth({ signedInAs: 'me@example.com' })}
        inventory={
          new FakeInventoryRepository([
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
        }
        settings={new FakeSettingsRepository()}
        meals={new FakeMealsApi()}
        receipt={new FakeReceiptApi()}
        recipes={new FakeRecipesRepository()}
        shopping={new FakeShoppingRepository()}
        store={memoryStore()}
        updater={new FakeAppUpdater()}
        now={() => new Date(2026, 9, 25, 12)}
      />,
    )
    await user.click(await screen.findByRole('button', { name: 'これで献立を考える' }))
    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: '献立' })).toHaveAttribute('aria-current', 'page')
    await user.click(await screen.findByRole('radio', { name: '30 分' }))
    await user.click(screen.getByRole('radio', { name: '在庫のみ' }))
    await user.click(screen.getByRole('radio', { name: '炊いてある' }))
    expect(await screen.findByRole('checkbox', { name: '牛乳' })).toBeChecked()

    // タブを移って戻ったら、帯の食材は使わない（最初から聞き直す）
    await user.click(within(nav).getByRole('link', { name: 'レシピ' }))
    await user.click(within(nav).getByRole('link', { name: '献立' }))
    await user.click(await screen.findByRole('radio', { name: '30 分' }))
    await user.click(screen.getByRole('radio', { name: '在庫のみ' }))
    await user.click(screen.getByRole('radio', { name: '炊いてある' }))
    expect(await screen.findByRole('checkbox', { name: '牛乳' })).not.toBeChecked()
  })

  it('レシピタブが空なら「献立を提案してもらう」で献立タブへ移り、前回の条件があれば確認画面を出す（D-82）', async () => {
    const user = userEvent.setup()
    const store = memoryStore()
    const app = (meals: FakeMealsApi) => (
      <App
        auth={new FakeAuth({ signedInAs: 'me@example.com' })}
        inventory={new FakeInventoryRepository()}
        settings={new FakeSettingsRepository()}
        meals={meals}
        receipt={new FakeReceiptApi()}
        recipes={new FakeRecipesRepository()}
        shopping={new FakeShoppingRepository()}
        store={store}
        updater={new FakeAppUpdater()}
        now={() => new Date(2026, 9, 25, 12)}
      />
    )
    const first = render(app(new FakeMealsApi()))
    const nav = await screen.findByRole('navigation')
    await user.click(within(nav).getByRole('link', { name: 'レシピ' }))
    await user.click(await screen.findByRole('button', { name: '献立を提案してもらう' }))
    expect(within(nav).getByRole('link', { name: '献立' })).toHaveAttribute('aria-current', 'page')
    // 前回の条件がないので 1 問目から
    expect(
      await screen.findByRole('heading', { name: '調理時間はどのくらい？' }),
    ).toBeInTheDocument()
    first.unmount()

    saveLastSuggestions(store, {
      conditions: {
        maxMinutes: 15,
        allowShopping: false,
        riceCooked: true,
        noodle: null,
        soup: true,
        sideDish: true,
        sideMicrowave: false,
        mood: '',
        mustUse: [],
      },
      plans: SAMPLE_SUGGESTIONS.map((r) => ({ outline: outlineOf(r), recipe: r })),
    })
    window.location.hash = '#/recipes'
    render(app(new FakeMealsApi()))
    await user.click(await screen.findByRole('button', { name: '献立を提案してもらう' }))
    expect(await screen.findByRole('heading', { name: 'この条件で提案します' })).toBeInTheDocument()
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
        shopping={new FakeShoppingRepository()}
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

  describe('開いたままの更新（D-52・D-61）', () => {
    function renderApp(updater: FakeAppUpdater) {
      render(
        <App
          auth={new FakeAuth({ signedInAs: 'me@example.com' })}
          inventory={new FakeInventoryRepository()}
          settings={new FakeSettingsRepository()}
          meals={new FakeMealsApi()}
          receipt={new FakeReceiptApi()}
          recipes={new FakeRecipesRepository()}
          shopping={new FakeShoppingRepository()}
          store={memoryStore()}
          updater={updater}
          now={() => new Date(2026, 9, 25)}
        />,
      )
    }

    function setVisibility(state: DocumentVisibilityState) {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
      act(() => document.dispatchEvent(new Event('visibilitychange')))
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('新しいバージョンがなければポップアップを出さない', async () => {
      renderApp(new FakeAppUpdater())
      await screen.findByRole('tab', { name: 'すべて' })
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.queryByText('新しいバージョンがあります')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '更新' })).not.toBeInTheDocument()
    })

    it('新しいバージョンが見つかったらポップアップを出し、タブを移動しても出し続け、「更新」で反映する', async () => {
      const user = userEvent.setup()
      const updater = new FakeAppUpdater()
      renderApp(updater)
      await screen.findByRole('tab', { name: 'すべて' })
      act(() => updater.publish())

      const dialog = screen.getByRole('alertdialog', { name: '新しいバージョン' })
      expect(dialog).toHaveTextContent('新しいバージョンがあります')
      expect(within(dialog).getByRole('button', { name: 'あとで' })).toBeInTheDocument()
      expect(screen.queryByRole('status', { name: '更新' })).not.toBeInTheDocument()
      expect(updater.applied).toBe(false)

      await user.click(screen.getByRole('link', { name: '献立' }))
      expect(screen.getByRole('alertdialog', { name: '新しいバージョン' })).toBeInTheDocument()

      await user.click(
        within(screen.getByRole('alertdialog', { name: '新しいバージョン' })).getByRole('button', {
          name: '更新',
        }),
      )
      expect(updater.applied).toBe(true)
    })

    it('「あとで」で閉じても入力途中の内容は残り、前面に戻ったらもう一度出す', async () => {
      const user = userEvent.setup()
      const updater = new FakeAppUpdater()
      renderApp(updater)
      await user.click((await screen.findAllByRole('button', { name: '食材を追加' }))[0])
      await user.type(screen.getByLabelText('食材名'), 'にんじん')
      act(() => updater.publish())

      await user.click(screen.getByRole('button', { name: 'あとで' }))
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(updater.applied).toBe(false)
      expect(screen.getByLabelText('食材名')).toHaveValue('にんじん')

      setVisibility('hidden')
      setVisibility('visible')
      expect(screen.getByRole('alertdialog', { name: '新しいバージョン' })).toBeInTheDocument()
    })

    it('オフラインの帯と更新のポップアップを両方表示する', async () => {
      const updater = new FakeAppUpdater()
      renderApp(updater)
      await screen.findByRole('tab', { name: 'すべて' })
      act(() => updater.publish())
      act(() => window.dispatchEvent(new Event('offline')))
      expect(screen.getByRole('status', { name: '接続状態' })).toBeInTheDocument()
      expect(screen.getByRole('alertdialog', { name: '新しいバージョン' })).toBeInTheDocument()
      act(() => window.dispatchEvent(new Event('online')))
    })
  })

  it('オフラインの帯はヘッダーの中で画面名の下に出す（D-60）', async () => {
    render(
      <App
        auth={new FakeAuth({ signedInAs: 'me@example.com' })}
        inventory={new FakeInventoryRepository()}
        settings={new FakeSettingsRepository()}
        meals={new FakeMealsApi()}
        receipt={new FakeReceiptApi()}
        recipes={new FakeRecipesRepository()}
        shopping={new FakeShoppingRepository()}
        store={memoryStore()}
        updater={new FakeAppUpdater()}
        now={() => new Date(2026, 9, 25)}
      />,
    )
    await screen.findByRole('tab', { name: 'すべて' })
    act(() => window.dispatchEvent(new Event('offline')))
    const header = screen.getByRole('banner')
    const banner = within(header).getByRole('status', { name: '接続状態' })
    const title = within(header).getByRole('heading', { name: '在庫' })
    expect(title.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    act(() => window.dispatchEvent(new Event('online')))
  })

  describe('レシートの読み取り中に別のタブへ移る（D-70）', () => {
    const photo = () => new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })

    async function startReading(receipt: FakeReceiptApi, auth?: FakeAuth) {
      const user = userEvent.setup()
      receipt.hold = true
      render(
        <App
          auth={auth ?? new FakeAuth({ signedInAs: 'me@example.com' })}
          inventory={new FakeInventoryRepository()}
          settings={new FakeSettingsRepository()}
          meals={new FakeMealsApi()}
          receipt={receipt}
          recipes={new FakeRecipesRepository()}
          shopping={new FakeShoppingRepository()}
          store={memoryStore()}
          updater={new FakeAppUpdater()}
          now={() => new Date(2026, 9, 25)}
        />,
      )
      await screen.findByText('食材がありません')
      await user.upload(screen.getByLabelText('レシートの写真'), photo())
      await screen.findByText('レシートを読み取っています…')
      return { user, nav: screen.getByRole('navigation') }
    }

    it('別のタブで終わったら、お知らせと在庫タブの印を出し、在庫に戻ると確認画面を開く', async () => {
      const receipt = new FakeReceiptApi()
      const { user, nav } = await startReading(receipt)
      await user.click(within(nav).getByRole('link', { name: '献立' }))
      await screen.findByRole('heading', { name: '調理時間はどのくらい？' })

      await act(async () => receipt.release())

      expect(await screen.findByRole('status', { name: 'レシートの読み取り' })).toHaveTextContent(
        'レシートを読み取りました',
      )
      // 献立画面はそのまま
      expect(screen.getByRole('heading', { name: '調理時間はどのくらい？' })).toBeInTheDocument()
      const inventoryTab = within(nav).getByRole('link', { name: '在庫（確認待ちのレシートあり）' })
      expect(inventoryTab.querySelector('.tab-badge')).not.toBeNull()

      await user.click(inventoryTab)
      expect(await screen.findByRole('dialog', { name: 'レシートの食材' })).toBeInTheDocument()
      expect(within(nav).getByRole('link', { name: '在庫' })).toBeInTheDocument()
      expect(document.querySelector('.tab-badge')).toBeNull()
    })

    it('確認画面のまま別のタブへ移ると、在庫タブに印を出す', async () => {
      const receipt = new FakeReceiptApi()
      const { user, nav } = await startReading(receipt)
      await act(async () => receipt.release())
      await screen.findByRole('dialog', { name: 'レシートの食材' })

      await user.click(within(nav).getByRole('link', { name: 'レシピ' }))

      expect(
        await within(nav).findByRole('link', { name: '在庫（確認待ちのレシートあり）' }),
      ).toBeInTheDocument()
      // 在庫画面で開いた確認画面は、その場で見ているのでお知らせは出さない
      expect(screen.queryByRole('status', { name: 'レシートの読み取り' })).not.toBeInTheDocument()
    })

    it('別のタブで失敗したら、その画面で理由を知らせ、在庫に印は付けない', async () => {
      const receipt = new FakeReceiptApi()
      receipt.error = '本日のレシート読み取りの上限に達しました'
      const { user, nav } = await startReading(receipt)
      await user.click(within(nav).getByRole('link', { name: '設定' }))
      await screen.findByLabelText('常備している調味料')

      await act(async () => receipt.release())

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '本日のレシート読み取りの上限に達しました',
      )
      expect(within(nav).getByRole('link', { name: '在庫' })).toBeInTheDocument()
      await user.click(within(nav).getByRole('link', { name: '在庫' }))
      await screen.findByText('食材がありません')
      expect(screen.queryByRole('dialog', { name: 'レシートの食材' })).not.toBeInTheDocument()
    })

    it('ログアウトしたら読み取りの状態を捨てる', async () => {
      const receipt = new FakeReceiptApi()
      const auth = new FakeAuth({ signedInAs: 'me@example.com', users: { 'me@example.com': 'pw' } })
      const { user, nav } = await startReading(receipt, auth)
      await user.click(within(nav).getByRole('link', { name: '設定' }))
      await user.click(await screen.findByRole('button', { name: 'ログアウト' }))
      await act(async () => receipt.release())

      await user.type(await screen.findByLabelText('メールアドレス'), 'me@example.com')
      await user.type(screen.getByLabelText('パスワード'), 'pw')
      await user.click(screen.getByRole('button', { name: 'ログイン' }))

      expect(
        await within(await screen.findByRole('navigation')).findByRole('link', { name: '在庫' }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('status', { name: 'レシートの読み取り' })).not.toBeInTheDocument()
    })
  })
})
