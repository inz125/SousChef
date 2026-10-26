import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InventoryItem } from '../domain/inventory'
import { memoryStore, type KeyValueStore } from '../offline/offlineCache'
import { FakeReceiptApi } from '../receipt/FakeReceiptApi'
import { FakeInventoryRepository } from './FakeInventoryRepository'
import { InventoryScreen } from './InventoryScreen'

const TODAY = '2026-10-25'

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: crypto.randomUUID(),
  name: '食材',
  category: 'meat',
  location: 'fridge',
  quantity: 'enough',
  expiresOn: null,
  expiresOnEstimated: false,
  thawedOn: null,
  ...over,
})

const ME = 'me@example.com'

/** 解凍の勧め（D-48）が出ない昼の時刻を既定にする */
const NOON = new Date(`${TODAY}T12:00:00`)

function setup(
  repo = new FakeInventoryRepository(),
  receipt = new FakeReceiptApi(),
  { now = NOON, store = memoryStore() }: { now?: Date; store?: KeyValueStore } = {},
) {
  render(
    <InventoryScreen
      repo={repo}
      receipt={receipt}
      today={TODAY}
      me={ME}
      now={() => now}
      store={store}
    />,
  )
  return { repo, receipt, store, user: userEvent.setup() }
}

const rowOf = (name: string) => screen.getByRole('listitem', { name })

/** 行を指で左（dx < 0）になぞる */
function swipe(row: HTMLElement, dx: number) {
  const target = within(row).getByRole('button', { name: /を編集$/ })
  fireEvent.pointerDown(target, { pointerId: 1, clientX: 300, clientY: 20 })
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 300 + dx / 2, clientY: 20 })
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 300 + dx, clientY: 20 })
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 300 + dx, clientY: 20 })
}

/** 左スワイプで出る「削除」ボタン（D-41） */
async function swipeToDelete(name: string) {
  const row = await screen.findByRole('listitem', { name })
  swipe(row, -120)
  return within(row).getByRole('button', { name: '削除' })
}

describe('InventoryScreen 一覧', () => {
  it('期限が近い順に表示し、期限と目安かどうかを示す', async () => {
    setup(
      new FakeInventoryRepository([
        item({ name: 'にんじん', expiresOn: '2026-11-03' }),
        item({ name: '豚バラ肉', expiresOn: '2026-10-26', expiresOnEstimated: true }),
      ]),
    )
    const rows = await screen.findAllByRole('listitem')
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['豚バラ肉', 'にんじん'])
    expect(rowOf('豚バラ肉')).toHaveTextContent('あと1日')
    expect(rowOf('豚バラ肉')).toHaveTextContent('目安')
    expect(rowOf('にんじん')).toHaveTextContent('11/3まで')
    expect(rowOf('にんじん')).not.toHaveTextContent('目安')
  })

  it('期限の状態を data 属性で示す（色分け用）', async () => {
    setup(new FakeInventoryRepository([item({ name: '牛乳', expiresOn: '2026-10-24' })]))
    expect(await screen.findByRole('listitem', { name: '牛乳' })).toHaveAttribute(
      'data-expiry',
      'expired',
    )
  })

  it('保存場所タブで絞り込める', async () => {
    const { user } = setup(
      new FakeInventoryRepository([
        item({ name: '冷凍エビ', location: 'freezer' }),
        item({ name: '牛乳', location: 'fridge' }),
      ]),
    )
    await screen.findByRole('listitem', { name: '牛乳' })
    await user.click(screen.getByRole('tab', { name: '冷凍' }))

    expect(screen.getByRole('tab', { name: '冷凍' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('listitem').map((r) => r.getAttribute('aria-label'))).toEqual([
      '冷凍エビ',
    ])
  })

  it('在庫が空なら案内を表示する', async () => {
    setup()
    expect(await screen.findByText('食材がありません')).toBeInTheDocument()
  })

  it('読み込みに失敗したらエラーを表示する', async () => {
    const repo = new FakeInventoryRepository()
    repo.failList = true
    setup(repo)
    expect(await screen.findByRole('alert')).toHaveTextContent('在庫を読み込めませんでした')
  })
})

describe('InventoryScreen 読み込み中の操作', () => {
  it('最初の読み込みが終わる前に追加しても、追加した食材が消えない', async () => {
    const repo = new FakeInventoryRepository([item({ name: '卵' })])
    // 最初の読み込みだけ、呼ばれた時点の在庫を遅れて返す
    const list = repo.list.bind(repo)
    let release!: () => void
    let first = true
    repo.list = async () => {
      const snapshot = await list()
      if (first) {
        first = false
        await new Promise<void>((resolve) => (release = resolve))
      }
      return snapshot
    }
    const { user } = setup(repo)

    await user.click(screen.getByRole('button', { name: '食材を追加' }))
    await user.type(screen.getByLabelText('食材名'), '牛乳')
    await user.selectOptions(screen.getByLabelText('カテゴリ'), '乳製品')
    await user.click(screen.getByRole('button', { name: '追加する' }))
    await act(async () => release())

    expect(await screen.findByRole('listitem', { name: '牛乳' })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: '卵' })).toBeInTheDocument()
  })
})

describe('InventoryScreen 量・削除', () => {
  it('行に量のボタンは置かず、「少ない」のときだけ印を出す（D-41）', async () => {
    setup(
      new FakeInventoryRepository([
        item({ name: '卵', quantity: 'enough' }),
        item({ name: '牛乳', quantity: 'low' }),
      ]),
    )
    const egg = await screen.findByRole('listitem', { name: '卵' })
    expect(within(egg).queryByRole('button', { name: /^(ある|少ない)$/ })).not.toBeInTheDocument()
    expect(egg).not.toHaveTextContent('少ない')
    const milk = rowOf('牛乳')
    expect(within(milk).queryByRole('button', { name: /^(ある|少ない)$/ })).not.toBeInTheDocument()
    expect(milk).toHaveTextContent('少ない')
  })

  it('左スワイプで出る「少ない」で量を切り替えて保存し、行を閉じる', async () => {
    const { repo, user } = setup(new FakeInventoryRepository([item({ name: '卵' })]))
    const row = await screen.findByRole('listitem', { name: '卵' })
    swipe(row, -200)
    await user.click(within(row).getByRole('button', { name: '少ない' }))

    expect(repo.items[0].quantity).toBe('low')
    expect(rowOf('卵')).toHaveTextContent('少ない')
    expect(within(rowOf('卵')).queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
  })

  it('「少ない」の食材は左スワイプで出る「ある」で戻せる', async () => {
    const { repo, user } = setup(
      new FakeInventoryRepository([item({ name: '卵', quantity: 'low' })]),
    )
    const row = await screen.findByRole('listitem', { name: '卵' })
    swipe(row, -200)
    await user.click(within(row).getByRole('button', { name: 'ある' }))

    expect(repo.items[0].quantity).toBe('enough')
    expect(rowOf('卵')).not.toHaveTextContent('少ない')
  })

  it('行に削除ボタンは出さない（量のボタンとの誤タップを防ぐ。D-41）', async () => {
    setup(new FakeInventoryRepository([item({ name: '卵' })]))
    const row = await screen.findByRole('listitem', { name: '卵' })
    expect(within(row).queryByRole('button', { name: /削除|なくなった/ })).not.toBeInTheDocument()
  })

  it('少しなぞっただけでは削除ボタンは出ない', async () => {
    setup(new FakeInventoryRepository([item({ name: '卵' })]))
    const row = await screen.findByRole('listitem', { name: '卵' })
    swipe(row, -20)
    expect(within(row).queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
  })

  it('なぞった直後のクリックでは削除ボタンを閉じず、編集画面も開かない', async () => {
    setup(new FakeInventoryRepository([item({ name: '卵' })]))
    await swipeToDelete('卵')
    // マウスでなぞると、指を離したあとに click も届く
    fireEvent.click(within(rowOf('卵')).getByRole('button', { name: '卵を編集' }))
    expect(within(rowOf('卵')).getByRole('button', { name: '削除' })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: '食材を編集' })).not.toBeInTheDocument()
  })

  it('開いているときに行をタップすると、編集画面は開かずに閉じる', async () => {
    const { user } = setup(new FakeInventoryRepository([item({ name: '卵' })]))
    await swipeToDelete('卵')
    fireEvent.click(within(rowOf('卵')).getByRole('button', { name: '卵を編集' }))
    await user.click(within(rowOf('卵')).getByRole('button', { name: '卵を編集' }))
    expect(within(rowOf('卵')).queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: '食材を編集' })).not.toBeInTheDocument()
  })

  it('右になぞると出ていた削除ボタンを閉じる', async () => {
    setup(new FakeInventoryRepository([item({ name: '卵' })]))
    await swipeToDelete('卵')
    swipe(rowOf('卵'), 120)
    expect(within(rowOf('卵')).queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
  })

  it('左スワイプで出る「削除」で削除し、「元に戻す」で戻せる', async () => {
    const egg = item({ name: '卵' })
    const { repo, user } = setup(new FakeInventoryRepository([egg]))
    await user.click(await swipeToDelete('卵'))
    expect(screen.queryByRole('listitem', { name: '卵' })).not.toBeInTheDocument()
    expect(repo.items).toEqual([])
    expect(screen.getByRole('status', { name: '元に戻す' })).toHaveTextContent('卵 を削除しました')

    await user.click(screen.getByRole('button', { name: '元に戻す' }))
    expect(await screen.findByRole('listitem', { name: '卵' })).toBeInTheDocument()
    expect(repo.items).toEqual([egg])
    expect(screen.queryByRole('button', { name: '元に戻す' })).not.toBeInTheDocument()
  })

  it('「元に戻す」は 5 秒後に消える', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(
        <InventoryScreen
          repo={new FakeInventoryRepository([item({ name: '卵' })])}
          receipt={new FakeReceiptApi()}
          today={TODAY}
          me={ME}
          now={() => NOON}
          store={memoryStore()}
        />,
      )
      await user.click(await swipeToDelete('卵'))
      // findBy は act の中で待つので、タイマーを仕掛ける副作用まで実行されてから進む
      expect(await screen.findByRole('button', { name: '元に戻す' })).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(5000))
      expect(screen.queryByRole('button', { name: '元に戻す' })).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('InventoryScreen 追加', () => {
  it('名前・カテゴリ・場所を入れると期限の目安が入り、追加すると一覧に出る', async () => {
    const { repo, user } = setup()
    await user.click(await screen.findByRole('button', { name: '食材を追加' }))
    await user.type(screen.getByLabelText('食材名'), '豚バラ肉')
    await user.selectOptions(screen.getByLabelText('カテゴリ'), '肉')
    await user.selectOptions(screen.getByLabelText('保存場所'), '冷蔵')

    expect(screen.getByLabelText('期限')).toHaveValue('2026-10-28')
    await user.click(screen.getByRole('button', { name: '追加する' }))

    expect(await screen.findByRole('listitem', { name: '豚バラ肉' })).toHaveTextContent('目安')
    expect(repo.items[0]).toMatchObject({
      name: '豚バラ肉',
      category: 'meat',
      location: 'fridge',
      quantity: 'enough',
      expiresOn: '2026-10-28',
      expiresOnEstimated: true,
    })
    expect(screen.queryByLabelText('食材名')).not.toBeInTheDocument()
  })

  it('過去に登録した食材名ならカテゴリと場所を補完する', async () => {
    const { user } = setup(
      new FakeInventoryRepository(
        [],
        [{ name: 'にんじん', category: 'root', location: 'vegetable' }],
      ),
    )
    await user.click(await screen.findByRole('button', { name: '食材を追加' }))
    await user.type(screen.getByLabelText('食材名'), 'にんじん')

    expect(screen.getByLabelText('カテゴリ')).toHaveDisplayValue('根菜・いも')
    expect(screen.getByLabelText('保存場所')).toHaveDisplayValue('野菜室')
    expect(screen.getByLabelText('期限')).toHaveValue('2026-11-15')
  })

  it('補完候補を食材名の候補リストとして提示する', async () => {
    const { user } = setup(
      new FakeInventoryRepository(
        [],
        [{ name: 'にんじん', category: 'root', location: 'vegetable' }],
      ),
    )
    await user.click(await screen.findByRole('button', { name: '食材を追加' }))
    const listId = screen.getByLabelText('食材名').getAttribute('list')!
    expect(
      document.getElementById(listId)?.querySelector('option[value="にんじん"]'),
    ).not.toBeNull()
  })

  it('期限を手で変えると目安ではなくなる', async () => {
    const { repo, user } = setup()
    await user.click(await screen.findByRole('button', { name: '食材を追加' }))
    await user.type(screen.getByLabelText('食材名'), '牛乳')
    await user.selectOptions(screen.getByLabelText('カテゴリ'), '乳製品')
    await user.clear(screen.getByLabelText('期限'))
    await user.type(screen.getByLabelText('期限'), '2026-11-01')
    // 手で変えた後にカテゴリを変えても上書きしない
    await user.selectOptions(screen.getByLabelText('保存場所'), '冷凍')
    await user.click(screen.getByRole('button', { name: '追加する' }))

    await screen.findByRole('listitem', { name: '牛乳' })
    expect(repo.items[0]).toMatchObject({ expiresOn: '2026-11-01', expiresOnEstimated: false })
  })

  it('保存場所の初期値は選択中のタブ', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('tab', { name: '冷凍' }))
    await user.click(screen.getByRole('button', { name: '食材を追加' }))
    expect(screen.getByLabelText('保存場所')).toHaveDisplayValue('冷凍')
  })

  it('キャンセルで閉じる', async () => {
    const { repo, user } = setup()
    await user.click(await screen.findByRole('button', { name: '食材を追加' }))
    await user.type(screen.getByLabelText('食材名'), '牛乳')
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByLabelText('食材名')).not.toBeInTheDocument()
    expect(repo.items).toEqual([])
  })
})

const openEditor = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(await screen.findByRole('button', { name: `${name}を編集` }))

describe('InventoryScreen 詳細編集', () => {
  it('行をタップすると現在の内容で編集でき、保存すると一覧に反映される', async () => {
    const { repo, user } = setup(
      new FakeInventoryRepository([
        item({ name: '鶏もも肉', expiresOn: '2026-10-27', expiresOnEstimated: true }),
      ]),
    )
    await openEditor(user, '鶏もも肉')
    expect(screen.getByLabelText('食材名')).toHaveValue('鶏もも肉')
    expect(screen.getByLabelText('カテゴリ')).toHaveDisplayValue('肉')
    expect(screen.getByLabelText('保存場所')).toHaveDisplayValue('冷蔵')
    expect(screen.getByLabelText('期限')).toHaveValue('2026-10-27')
    expect(screen.getByLabelText('量')).toHaveDisplayValue('ある')

    await user.clear(screen.getByLabelText('食材名'))
    await user.type(screen.getByLabelText('食材名'), '鶏もも肉（下味）')
    await user.selectOptions(screen.getByLabelText('量'), '少ない')
    await user.click(screen.getByRole('button', { name: '保存する' }))

    const row = await screen.findByRole('listitem', { name: '鶏もも肉（下味）' })
    expect(row).toHaveTextContent('少ない')
    expect(repo.items[0]).toMatchObject({ name: '鶏もも肉（下味）', quantity: 'low' })
    expect(screen.queryByRole('button', { name: '保存する' })).not.toBeInTheDocument()
  })

  it('目安の期限は、保存場所を変えると今日から再推定する', async () => {
    const { repo, user } = setup(
      new FakeInventoryRepository([
        item({ name: '鶏もも肉', expiresOn: '2026-10-27', expiresOnEstimated: true }),
      ]),
    )
    await openEditor(user, '鶏もも肉')
    await user.selectOptions(screen.getByLabelText('保存場所'), '冷凍')
    expect(screen.getByLabelText('期限')).toHaveValue('2026-11-24')
    await user.click(screen.getByRole('button', { name: '保存する' }))

    await screen.findByRole('listitem', { name: '鶏もも肉' })
    expect(repo.items[0]).toMatchObject({
      location: 'freezer',
      expiresOn: '2026-11-24',
      expiresOnEstimated: true,
    })
  })

  it('手入力の期限は、保存場所を変えても変わらない', async () => {
    const { user } = setup(
      new FakeInventoryRepository([
        item({ name: '鶏もも肉', expiresOn: '2026-10-27', expiresOnEstimated: false }),
      ]),
    )
    await openEditor(user, '鶏もも肉')
    await user.selectOptions(screen.getByLabelText('保存場所'), '冷凍')
    expect(screen.getByLabelText('期限')).toHaveValue('2026-10-27')
  })

  it('期限を手で変えると目安ではなくなる', async () => {
    const { repo, user } = setup(
      new FakeInventoryRepository([
        item({ name: '牛乳', expiresOn: '2026-10-30', expiresOnEstimated: true }),
      ]),
    )
    await openEditor(user, '牛乳')
    await user.clear(screen.getByLabelText('期限'))
    await user.type(screen.getByLabelText('期限'), '2026-11-02')
    await user.click(screen.getByRole('button', { name: '保存する' }))

    await screen.findByRole('listitem', { name: '牛乳' })
    expect(repo.items[0]).toMatchObject({ expiresOn: '2026-11-02', expiresOnEstimated: false })
  })

  it('編集画面から削除でき、元に戻せる', async () => {
    const { repo, user } = setup(new FakeInventoryRepository([item({ name: '牛乳' })]))
    await openEditor(user, '牛乳')
    await user.click(screen.getByRole('button', { name: '削除する' }))

    expect(screen.queryByRole('listitem', { name: '牛乳' })).not.toBeInTheDocument()
    expect(repo.items).toEqual([])
    await user.click(screen.getByRole('button', { name: '元に戻す' }))
    expect(await screen.findByRole('listitem', { name: '牛乳' })).toBeInTheDocument()
  })

  it('キャンセルすると変更しない', async () => {
    const { repo, user } = setup(new FakeInventoryRepository([item({ name: '牛乳' })]))
    await openEditor(user, '牛乳')
    await user.clear(screen.getByLabelText('食材名'))
    await user.type(screen.getByLabelText('食材名'), '豆乳')
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.getByRole('listitem', { name: '牛乳' })).toBeInTheDocument()
    expect(repo.items[0].name).toBe('牛乳')
  })
})

describe('InventoryScreen 同期（D-30）', () => {
  const notice = () => screen.findByRole('status', { name: 'お知らせ' })

  it('もう一人の変更を一覧に反映し、誰が何をしたか通知する', async () => {
    const repo = new FakeInventoryRepository()
    setup(repo)
    await screen.findByText('食材がありません')
    await waitFor(() => expect(repo.subscriberCount).toBe(1))

    act(() =>
      repo.remoteChange((items) => [...items, item({ name: '牛乳' })], {
        action: 'added',
        itemName: '牛乳',
        actorEmail: 'hana@example.com',
        actorName: 'はな',
      }),
    )

    expect(await screen.findByRole('listitem', { name: '牛乳' })).toBeInTheDocument()
    expect(await notice()).toHaveTextContent('はなさんが 牛乳 を追加しました')
  })

  it.each([
    ['updated', 'を変更しました'],
    ['removed', 'を削除しました'],
  ] as const)('%s の通知文', async (action, text) => {
    const repo = new FakeInventoryRepository([item({ name: '卵' })])
    setup(repo)
    await screen.findByRole('listitem', { name: '卵' })
    await waitFor(() => expect(repo.subscriberCount).toBe(1))
    act(() =>
      repo.remoteChange((items) => items, {
        action,
        itemName: '卵',
        actorEmail: 'ken@example.com',
        actorName: 'けん',
      }),
    )
    expect(await notice()).toHaveTextContent(`けんさんが 卵 ${text}`)
  })

  it('自分の操作は通知しない', async () => {
    const { user } = setup(new FakeInventoryRepository([item({ name: '卵' })]))
    await user.click(await swipeToDelete('卵'))
    expect(screen.queryByRole('status', { name: 'お知らせ' })).not.toBeInTheDocument()
  })

  it('購読が始まったら読み直す（読み込みから購読開始までの間の変更を取りこぼさない）', async () => {
    const repo = new FakeInventoryRepository()
    let ready!: () => void
    const subscribe = repo.subscribe.bind(repo)
    repo.subscribe = (listener) =>
      new Promise((resolve) => {
        ready = () => subscribe(listener).then(resolve)
      })
    setup(repo)
    await screen.findByText('食材がありません')

    repo.items.push(item({ name: '納豆' }))
    await act(async () => ready())
    expect(await screen.findByRole('listitem', { name: '納豆' })).toBeInTheDocument()
  })

  it('画面を閉じると購読をやめる', async () => {
    const repo = new FakeInventoryRepository()
    const { unmount } = render(
      <InventoryScreen
        repo={repo}
        receipt={new FakeReceiptApi()}
        today={TODAY}
        me={ME}
        now={() => NOON}
        store={memoryStore()}
      />,
    )
    await waitFor(() => expect(repo.subscriberCount).toBe(1))
    unmount()
    await waitFor(() => expect(repo.subscriberCount).toBe(0))
  })

  it('アプリが前面に戻ったら一覧を読み直す（バックグラウンド中の変更を取りこぼさない）', async () => {
    const repo = new FakeInventoryRepository()
    setup(repo)
    await screen.findByText('食材がありません')
    repo.items.push(item({ name: '豆腐' }))

    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(await screen.findByRole('listitem', { name: '豆腐' })).toBeInTheDocument()
  })
})

describe('InventoryScreen レシート読み込み（D-42）', () => {
  const photo = () => new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
  const picker = () => screen.getByLabelText('レシートの写真')
  const dialog = () => screen.getByRole('dialog', { name: 'レシートの食材' })
  const rowOfDraft = (name: string) => within(dialog()).getByRole('group', { name })

  async function readReceipt(user: ReturnType<typeof userEvent.setup>) {
    await user.upload(picker(), photo())
    return await screen.findByRole('dialog', { name: 'レシートの食材' })
  }

  it('カメラボタンで写真を選ぶと、読み取った食材が確認画面に並ぶ（チェック ON・カテゴリ・保存場所つき）', async () => {
    const { user, receipt } = setup()
    await screen.findByText('食材がありません')

    await user.click(screen.getByRole('button', { name: 'レシートを読み込む' }))
    const file = photo()
    await user.upload(picker(), file)
    await screen.findByRole('dialog', { name: 'レシートの食材' })

    expect(receipt.calls).toEqual([file])
    const milk = rowOfDraft('牛乳')
    expect(within(milk).getByRole('checkbox', { name: '牛乳を登録する' })).toBeChecked()
    expect(within(milk).getByLabelText('名前')).toHaveValue('牛乳')
    expect(within(milk).getByLabelText('カテゴリ')).toHaveValue('dairy')
    expect(within(milk).getByLabelText('保存場所')).toHaveValue('fridge')
    expect(within(rowOfDraft('冷凍餃子')).getByLabelText('保存場所')).toHaveValue('freezer')
    expect(screen.getByRole('button', { name: '登録する（3 件）' })).toBeEnabled()
  })

  it('写真を選ばずに閉じたら何も起きない', async () => {
    const { user, receipt } = setup()
    await screen.findByText('食材がありません')
    await user.upload(picker(), [])
    expect(receipt.calls).toHaveLength(0)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('読み取り中は案内を出し、カメラと＋のボタンを押せなくする', async () => {
    const { user, receipt } = setup()
    receipt.hold = true
    await screen.findByText('食材がありません')

    await user.upload(picker(), photo())

    expect(await screen.findByText('レシートを読み取っています…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'レシートを読み込む' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '食材を追加' })).toBeDisabled()

    receipt.release()
    await screen.findByRole('dialog', { name: 'レシートの食材' })
    expect(screen.queryByText('レシートを読み取っています…')).not.toBeInTheDocument()
  })

  it('オフラインではカメラボタンを押せない', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      setup()
      await screen.findByText('食材がありません')
      expect(screen.getByRole('button', { name: 'レシートを読み込む' })).toBeDisabled()
      online.mockReturnValue(true)
      act(() => void window.dispatchEvent(new Event('online')))
      expect(screen.getByRole('button', { name: 'レシートを読み込む' })).toBeEnabled()
    } finally {
      online.mockRestore()
    }
  })

  it('読み取れなかったときは確認画面を開かず、理由を表示する', async () => {
    const { user, receipt } = setup()
    receipt.error = '食材を読み取れませんでした。レシート全体が写るように撮り直してください'
    await screen.findByText('食材がありません')

    await user.upload(picker(), photo())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '食材を読み取れませんでした。レシート全体が写るように撮り直してください',
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'レシートを読み込む' })).toBeEnabled()
  })

  it('チェックを外した行と名前が空の行があると件数が変わり、登録できなくなる', async () => {
    const { user } = setup()
    await readReceipt(user)

    await user.click(within(rowOfDraft('牛乳')).getByRole('checkbox'))
    expect(screen.getByRole('button', { name: '登録する（2 件）' })).toBeEnabled()

    await user.clear(within(rowOfDraft('鶏むね肉')).getByLabelText('名前'))
    expect(screen.getByRole('button', { name: '登録する（2 件）' })).toBeDisabled()

    // チェックを外した行は、名前が空でも登録の妨げにならない
    await user.click(within(rowOfDraft('鶏むね肉')).getByRole('checkbox'))
    expect(screen.getByRole('button', { name: '登録する（1 件）' })).toBeEnabled()

    await user.click(within(rowOfDraft('冷凍餃子')).getByRole('checkbox'))
    expect(screen.getByRole('button', { name: '登録する（0 件）' })).toBeDisabled()
  })

  it('在庫にある食材の行には「在庫あり」と表示し、名前を書き換えたら判定し直す', async () => {
    const { user } = setup(
      new FakeInventoryRepository([item({ name: '牛乳', category: 'dairy', quantity: 'low' })]),
    )
    await screen.findByRole('listitem', { name: '牛乳' })
    await readReceipt(user)

    expect(
      within(rowOfDraft('牛乳')).getByText('在庫あり（「ある」に戻します）'),
    ).toBeInTheDocument()
    expect(within(rowOfDraft('鶏むね肉')).queryByText(/在庫あり/)).not.toBeInTheDocument()

    const name = within(rowOfDraft('牛乳')).getByLabelText('名前')
    await user.clear(name)
    await user.type(name, '低脂肪乳')
    expect(screen.queryByText(/在庫あり/)).not.toBeInTheDocument()
  })

  it('名前を補完候補にある名前に書き換えたら、カテゴリと保存場所をその値にする', async () => {
    const { user } = setup(
      new FakeInventoryRepository(
        [],
        [{ name: 'ヨーグルト', category: 'dairy', location: 'freezer' }],
      ),
    )
    await readReceipt(user)

    const row = rowOfDraft('鶏むね肉')
    const name = within(row).getByLabelText('名前')
    await user.clear(name)
    await user.type(name, 'ヨーグルト')

    expect(within(row).getByLabelText('カテゴリ')).toHaveValue('dairy')
    expect(within(row).getByLabelText('保存場所')).toHaveValue('freezer')
  })

  it('登録すると、在庫にない食材は追加し、ある食材は「ある」に戻す。件数を通知する', async () => {
    const stocked = item({
      name: '牛乳',
      category: 'dairy',
      quantity: 'low',
      expiresOn: '2026-10-20',
      expiresOnEstimated: false,
    })
    const { user, repo } = setup(new FakeInventoryRepository([stocked]))
    await screen.findByRole('listitem', { name: '牛乳' })
    await readReceipt(user)
    await user.click(within(rowOfDraft('冷凍餃子')).getByRole('checkbox'))

    await user.click(screen.getByRole('button', { name: '登録する（2 件）' }))

    expect(await screen.findByRole('status', { name: 'お知らせ' })).toHaveTextContent(
      '2 件を在庫に登録しました',
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(repo.items).toHaveLength(2)
    expect(repo.items.find((i) => i.id === stocked.id)).toMatchObject({
      quantity: 'enough',
      expiresOn: '2026-11-01',
      expiresOnEstimated: true,
    })
    // 肉は冷凍で登録する（D-46）
    expect(repo.items.find((i) => i.name === '鶏むね肉')).toMatchObject({
      category: 'meat',
      location: 'freezer',
      quantity: 'enough',
      expiresOn: '2026-11-24',
      expiresOnEstimated: true,
    })
    expect(repo.items.some((i) => i.name === '冷凍餃子')).toBe(false)
    // 一覧にも反映される
    expect(await screen.findByRole('listitem', { name: '鶏むね肉' })).toBeInTheDocument()
    expect(within(rowOf('牛乳')).queryByText('少ない')).not.toBeInTheDocument()
  })

  it('キャンセルすると何も登録しない', async () => {
    const { user, repo } = setup()
    await readReceipt(user)

    await user.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(repo.items).toHaveLength(0)
  })

  it('登録に失敗したら確認画面を開いたまま、エラーを表示する', async () => {
    const { user, repo } = setup()
    await readReceipt(user)
    vi.spyOn(repo, 'add').mockRejectedValue(new Error('network'))

    await user.click(screen.getByRole('button', { name: '登録する（3 件）' }))

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('登録できませんでした')
  })
})

describe('InventoryScreen 肉の登録（D-46）', () => {
  it('カテゴリに肉を選ぶと、選択中のタブに関係なく保存場所が冷凍になる', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('tab', { name: '冷蔵' }))
    await user.click(screen.getByRole('button', { name: '食材を追加' }))
    await user.type(screen.getByLabelText('食材名'), '豚こま肉')
    await user.selectOptions(screen.getByLabelText('カテゴリ'), '肉')
    expect(screen.getByLabelText('保存場所')).toHaveDisplayValue('冷凍')
    expect(screen.getByLabelText('期限')).toHaveValue('2026-11-24')
  })

  it('補完候補で冷蔵の肉も、名前を入れると冷凍になる', async () => {
    const { user } = setup(
      new FakeInventoryRepository([], [{ name: '鶏もも肉', category: 'meat', location: 'fridge' }]),
    )
    await user.click(await screen.findByRole('button', { name: '食材を追加' }))
    await user.type(screen.getByLabelText('食材名'), '鶏もも肉')
    expect(screen.getByLabelText('保存場所')).toHaveDisplayValue('冷凍')
  })

  it('肉以外は選択中のタブのまま', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('tab', { name: '冷蔵' }))
    await user.click(screen.getByRole('button', { name: '食材を追加' }))
    await user.type(screen.getByLabelText('食材名'), 'サーモン')
    await user.selectOptions(screen.getByLabelText('カテゴリ'), '魚介')
    expect(screen.getByLabelText('保存場所')).toHaveDisplayValue('冷蔵')
  })
})

describe('InventoryScreen 解凍（D-47）', () => {
  const frozen = () =>
    item({
      id: 'f',
      name: '鶏もも肉',
      location: 'freezer',
      expiresOn: '2026-11-20',
      expiresOnEstimated: true,
    })

  async function openThaw(name: string) {
    const row = await screen.findByRole('listitem', { name })
    swipe(row, -240)
    fireEvent.click(within(row).getByRole('button', { name: '解凍' }))
    return screen.getByRole('dialog', { name: `${name}を解凍` })
  }

  it('冷凍の肉の行だけ、左スワイプで「解凍」が出る', async () => {
    setup(
      new FakeInventoryRepository([
        frozen(),
        item({ name: '冷凍餃子', category: 'processed', location: 'freezer' }),
        item({ name: '豚こま肉', location: 'fridge' }),
      ]),
    )
    for (const [name, has] of [
      ['鶏もも肉', true],
      ['冷凍餃子', false],
      ['豚こま肉', false],
    ] as const) {
      const row = await screen.findByRole('listitem', { name })
      swipe(row, -240)
      expect(within(row).queryAllByRole('button', { name: '解凍' })).toHaveLength(has ? 1 : 0)
    }
  })

  it('「全部」で行ごと冷蔵に移し、解凍中・期限は 2 日後（目安）になる', async () => {
    const { user, repo } = setup(new FakeInventoryRepository([frozen()]))
    const sheet = await openThaw('鶏もも肉')
    await user.click(within(sheet).getByRole('button', { name: '全部' }))
    await user.click(within(sheet).getByRole('button', { name: '解凍する' }))

    expect(repo.items).toEqual([
      {
        ...frozen(),
        location: 'fridge',
        thawedOn: TODAY,
        expiresOn: '2026-10-27',
        expiresOnEstimated: true,
      },
    ])
    expect(screen.queryByRole('dialog', { name: '鶏もも肉を解凍' })).not.toBeInTheDocument()
    expect(await screen.findByRole('listitem', { name: '鶏もも肉' })).toHaveTextContent('解凍中')
  })

  it('「一部」で冷凍の行に残す量を選び、冷蔵に解凍中の行を足す', async () => {
    const { user, repo } = setup(new FakeInventoryRepository([frozen()]))
    const sheet = await openThaw('鶏もも肉')
    await user.click(within(sheet).getByRole('button', { name: '一部' }))
    expect(within(sheet).getByRole('radio', { name: 'ある' })).toBeChecked()
    await user.click(within(sheet).getByRole('radio', { name: '少ない' }))
    await user.click(within(sheet).getByRole('button', { name: '解凍する' }))

    await waitFor(() => expect(repo.items).toHaveLength(2))
    expect(repo.items[0]).toEqual({ ...frozen(), quantity: 'low' })
    expect(repo.items[1]).toMatchObject({
      name: '鶏もも肉',
      location: 'fridge',
      quantity: 'enough',
      thawedOn: TODAY,
      expiresOn: '2026-10-27',
    })
    const rows = await screen.findAllByRole('listitem', { name: '鶏もも肉' })
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('解凍中'),
      expect.stringContaining('少ない'),
    ])
  })

  it('キャンセルすると何も変えない', async () => {
    const { user, repo } = setup(new FakeInventoryRepository([frozen()]))
    const sheet = await openThaw('鶏もも肉')
    await user.click(within(sheet).getByRole('button', { name: 'キャンセル' }))
    expect(repo.items).toEqual([frozen()])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([
    ['全部', 1],
    ['一部', 2],
  ])('編集画面からも解凍でき（%s）、解凍すると編集画面も閉じる', async (kind, rows) => {
    const { user, repo } = setup(new FakeInventoryRepository([frozen()]))
    await user.click(await screen.findByRole('button', { name: '鶏もも肉を編集' }))
    await user.click(screen.getByRole('button', { name: '解凍' }))
    const sheet = screen.getByRole('dialog', { name: '鶏もも肉を解凍' })
    await user.click(within(sheet).getByRole('button', { name: kind }))
    await user.click(within(sheet).getByRole('button', { name: '解凍する' }))

    await waitFor(() => expect(repo.items).toHaveLength(rows))
    expect(repo.items.some((i) => i.thawedOn === TODAY)).toBe(true)
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: '食材を編集' })).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('dialog', { name: '鶏もも肉を解凍' })).not.toBeInTheDocument()
  })

  it('解凍中の行を編集で冷凍に戻すと、解凍中は外れる', async () => {
    const thawing = item({ name: '鶏もも肉', thawedOn: '2026-10-24', expiresOn: '2026-10-26' })
    const { user, repo } = setup(new FakeInventoryRepository([thawing]))
    expect(await screen.findByRole('listitem', { name: '鶏もも肉' })).toHaveTextContent('解凍中')
    await user.click(screen.getByRole('button', { name: '鶏もも肉を編集' }))
    await user.selectOptions(screen.getByLabelText('保存場所'), '冷凍')
    await user.click(screen.getByRole('button', { name: '保存する' }))
    await waitFor(() =>
      expect(repo.items[0]).toMatchObject({ location: 'freezer', thawedOn: null }),
    )
  })

  it('オフラインでは解凍できない', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      setup(new FakeInventoryRepository([frozen()]))
      const row = await screen.findByRole('listitem', { name: '鶏もも肉' })
      swipe(row, -240)
      expect(within(row).queryByRole('button', { name: '解凍' })).not.toBeInTheDocument()
    } finally {
      online.mockRestore()
    }
  })
})

describe('InventoryScreen 解凍の勧め（D-48）', () => {
  const EVENING = new Date(`${TODAY}T18:00:00`)
  const meat = (over: Partial<InventoryItem> = {}) =>
    item({ name: '鶏もも肉', location: 'freezer', expiresOn: '2026-11-20', ...over })
  const banner = () => screen.queryByRole('region', { name: '解凍の勧め' })

  it('18 時以降・冷凍に肉があり・解凍中の肉がなければ、冷凍の肉を期限が近い順に並べて勧める', async () => {
    setup(
      new FakeInventoryRepository([
        meat(),
        meat({ name: '豚こま肉', expiresOn: '2026-11-10' }),
        item({ name: '冷凍餃子', category: 'processed', location: 'freezer' }),
      ]),
      undefined,
      { now: EVENING },
    )
    const region = await screen.findByRole('region', { name: '解凍の勧め' })
    expect(region).toHaveTextContent('明日の肉を解凍しませんか？')
    expect(
      within(region)
        .getAllByRole('button', { name: /を解凍$/ })
        .map((b) => b.textContent),
    ).toEqual(['豚こま肉', '鶏もも肉'])
  })

  it('18 時より前は出さない', async () => {
    setup(new FakeInventoryRepository([meat()]))
    await screen.findByRole('listitem', { name: '鶏もも肉' })
    expect(banner()).not.toBeInTheDocument()
  })

  it('解凍中の肉があれば出さない', async () => {
    setup(
      new FakeInventoryRepository([
        meat(),
        item({ name: '豚こま肉', location: 'fridge', thawedOn: TODAY }),
      ]),
      undefined,
      { now: EVENING },
    )
    await screen.findByRole('listitem', { name: '鶏もも肉' })
    expect(banner()).not.toBeInTheDocument()
  })

  it('帯から解凍すると、条件を満たさなくなって帯が消える', async () => {
    const { user, repo } = setup(new FakeInventoryRepository([meat()]), undefined, {
      now: EVENING,
    })
    const region = await screen.findByRole('region', { name: '解凍の勧め' })
    await user.click(within(region).getByRole('button', { name: '鶏もも肉を解凍' }))
    const sheet = screen.getByRole('dialog', { name: '鶏もも肉を解凍' })
    await user.click(within(sheet).getByRole('button', { name: '全部' }))
    await user.click(within(sheet).getByRole('button', { name: '解凍する' }))

    await waitFor(() => expect(banner()).not.toBeInTheDocument())
    expect(repo.items[0].thawedOn).toBe(TODAY)
  })

  it('「今日はいい」で消え、その日は端末に覚えて出さない', async () => {
    const store = memoryStore()
    const { user } = setup(new FakeInventoryRepository([meat()]), undefined, {
      now: EVENING,
      store,
    })
    const region = await screen.findByRole('region', { name: '解凍の勧め' })
    await user.click(within(region).getByRole('button', { name: '今日はいい' }))
    expect(banner()).not.toBeInTheDocument()
    expect(store.get('souschef:thaw-banner-dismissed')).toBe(TODAY)
  })

  it('前の日に「今日はいい」を押していても、今日は出す', async () => {
    const store = memoryStore()
    store.set('souschef:thaw-banner-dismissed', '2026-10-24')
    setup(new FakeInventoryRepository([meat()]), undefined, { now: EVENING, store })
    expect(await screen.findByRole('region', { name: '解凍の勧め' })).toBeInTheDocument()
  })
})
