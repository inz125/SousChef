import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InventoryItem } from '../domain/inventory'
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
  ...over,
})

const ME = 'me@example.com'

function setup(repo = new FakeInventoryRepository()) {
  render(<InventoryScreen repo={repo} today={TODAY} me={ME} />)
  return { repo, user: userEvent.setup() }
}

const rowOf = (name: string) => screen.getByRole('listitem', { name })

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

describe('InventoryScreen 量・削除', () => {
  it('量ボタンで「ある」と「少ない」を切り替え、保存する', async () => {
    const { repo, user } = setup(new FakeInventoryRepository([item({ name: '卵' })]))
    const row = await screen.findByRole('listitem', { name: '卵' })
    await user.click(within(row).getByRole('button', { name: 'ある' }))

    expect(within(row).getByRole('button', { name: '少ない' })).toBeInTheDocument()
    expect(repo.items[0].quantity).toBe('low')
  })

  it('「なくなった」で削除し、「元に戻す」で戻せる', async () => {
    const egg = item({ name: '卵' })
    const { repo, user } = setup(new FakeInventoryRepository([egg]))
    await user.click(
      within(await screen.findByRole('listitem', { name: '卵' })).getByRole('button', {
        name: 'なくなった',
      }),
    )
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
          today={TODAY}
          me={ME}
        />,
      )
      await user.click(
        within(await screen.findByRole('listitem', { name: '卵' })).getByRole('button', {
          name: 'なくなった',
        }),
      )
      expect(screen.getByRole('button', { name: '元に戻す' })).toBeInTheDocument()
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
    expect(within(row).getByRole('button', { name: '少ない' })).toBeInTheDocument()
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
    const row = await screen.findByRole('listitem', { name: '卵' })
    await user.click(within(row).getByRole('button', { name: 'ある' }))
    expect(screen.queryByRole('status', { name: 'お知らせ' })).not.toBeInTheDocument()
  })

  it('画面を閉じると購読をやめる', async () => {
    const repo = new FakeInventoryRepository()
    const { unmount } = render(<InventoryScreen repo={repo} today={TODAY} me={ME} />)
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
