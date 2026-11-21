import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InventoryItem } from '../domain/inventory'
import { FakeInventoryRepository } from '../inventory/FakeInventoryRepository'
import { InventoryScreen } from '../inventory/InventoryScreen'
import { LONG_PRESS_MS } from '../inventory/LongPressButton'
import { memoryStore } from '../offline/offlineCache'
import { FakeReceiptApi } from '../receipt/FakeReceiptApi'
import { ReceiptReader } from '../receipt/receiptReader'
import { FakeShoppingRepository } from './FakeShoppingRepository'

const TODAY = '2026-11-20'
const NOON = new Date(`${TODAY}T12:00:00`)

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: crypto.randomUUID(),
  name: '食材',
  category: 'dairy',
  location: 'fridge',
  quantity: 'enough',
  expiresOn: null,
  expiresOnEstimated: false,
  thawedOn: null,
  ...over,
})

function setup({
  items = [] as InventoryItem[],
  list = [] as string[],
  stocked = [] as string[],
  catalog = [] as {
    name: string
    category: InventoryItem['category']
    location: InventoryItem['location']
  }[],
} = {}) {
  const repo = new FakeInventoryRepository(items, catalog)
  const shopping = new FakeShoppingRepository({ items: list, stocked, inventory: repo })
  render(
    <InventoryScreen
      repo={repo}
      shopping={shopping}
      receipt={new ReceiptReader(new FakeReceiptApi())}
      today={TODAY}
      me="me@example.com"
      now={() => NOON}
      store={memoryStore()}
    />,
  )
  return { repo, shopping, user: userEvent.setup() }
}

type User = ReturnType<typeof userEvent.setup>

async function openShopping(user: User) {
  await user.click(await screen.findByRole('tab', { name: /^買い物/ }))
  return screen.findByRole('list', { name: '買い物リスト' })
}

const shoppingNames = () =>
  within(screen.getByRole('list', { name: '買い物リスト' }))
    .queryAllByRole('listitem')
    .map((li) => li.getAttribute('aria-label'))

async function longPress(name: string) {
  const target = within(await screen.findByRole('listitem', { name })).getByRole('button', {
    name,
  })
  fireEvent.pointerDown(target, { pointerId: 1, clientX: 40, clientY: 40 })
  await act(() => new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 50)))
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 40, clientY: 40 })
  fireEvent.click(target)
}

const menuOf = (name: string) => screen.getByRole('dialog', { name: `${name}の操作` })

describe('買い物リスト（D-72）', () => {
  it('場所の切替の右端に「買い物」があり、チェックしていない品物の件数を出す', async () => {
    const { shopping } = setup({ list: ['牛乳', '卵', '豆腐'] })
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([
      'すべて',
      '冷蔵',
      '冷凍',
      '野菜室',
      '食品庫',
      '買い物3',
    ])
    expect(screen.getByRole('tab', { name: '買い物（3 件）' })).toBeInTheDocument()

    act(() => shopping.remoteChange((r) => (r.items = [])))
    expect(await screen.findByRole('tab', { name: '買い物' })).toHaveTextContent(/^買い物$/)
  })

  it('＋で名前を入れて追加すると、チェックしていない品物の最後に入る。カメラボタンは出ない', async () => {
    const { user, shopping } = setup({
      list: ['牛乳'],
      catalog: [{ name: '絹豆腐', category: 'soy', location: 'fridge' }],
    })
    await openShopping(user)
    expect(screen.queryByRole('button', { name: 'レシートを読み込む' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '買い物リストに追加' }))
    const form = screen.getByRole('form', { name: '買い物リストに追加' })
    // 過去の登録から補完する
    expect(form.querySelector('datalist option[value="絹豆腐"]')).not.toBeNull()
    await user.type(within(form).getByLabelText('名前'), '豆腐')
    await user.click(within(form).getByRole('button', { name: '追加' }))
    await waitFor(() => expect(shoppingNames()).toEqual(['牛乳', '豆腐']))
    expect(shopping.names()).toEqual(['牛乳', '豆腐'])
    expect(screen.queryByRole('form', { name: '買い物リストに追加' })).not.toBeInTheDocument()
  })

  it('同じ名前がチェックしていない品物にあれば重ねず、そう知らせる', async () => {
    const { user, shopping } = setup({ list: ['豆腐'] })
    await openShopping(user)
    await user.click(screen.getByRole('button', { name: '買い物リストに追加' }))
    const form = screen.getByRole('form', { name: '買い物リストに追加' })
    await user.type(within(form).getByLabelText('名前'), '豆腐')
    await user.click(within(form).getByRole('button', { name: '追加' }))
    expect(await screen.findByRole('status', { name: 'お知らせ' })).toHaveTextContent(
      '豆腐はもう買い物リストにあります',
    )
    expect(shopping.names()).toEqual(['豆腐'])
  })

  it('タップでチェックすると打消し線で下へ移り、もう一度で外れる。在庫は変わらない', async () => {
    const { user, repo } = setup({ list: ['牛乳', '卵', '豆腐'] })
    await openShopping(user)
    await user.click(screen.getByRole('checkbox', { name: '卵' }))
    await waitFor(() => expect(shoppingNames()).toEqual(['牛乳', '豆腐', '卵']))
    expect(screen.getByRole('checkbox', { name: '卵' })).toBeChecked()
    expect(screen.getByRole('listitem', { name: '卵' })).toHaveAttribute('data-checked', 'true')

    await user.click(screen.getByRole('checkbox', { name: '卵' }))
    await waitFor(() => expect(shoppingNames()).toEqual(['牛乳', '卵', '豆腐']))
    expect(repo.items).toEqual([])
  })

  it('「チェック済みを消す」でチェックした品物だけ消す。チェックがなければボタンを出さない', async () => {
    const { user, shopping } = setup({ list: ['牛乳', '卵', '豆腐'] })
    await openShopping(user)
    expect(screen.queryByRole('button', { name: 'チェック済みを消す' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: '牛乳' }))
    await user.click(screen.getByRole('checkbox', { name: '豆腐' }))
    await user.click(await screen.findByRole('button', { name: 'チェック済みを消す' }))
    await waitFor(() => expect(shoppingNames()).toEqual(['卵']))
    expect(shopping.names()).toEqual(['卵'])
    expect(screen.queryByRole('button', { name: 'チェック済みを消す' })).not.toBeInTheDocument()
  })

  it('チェックしていない品物は左スワイプの「削除」で消せる', async () => {
    const { user, shopping } = setup({ list: ['牛乳', '卵'] })
    await openShopping(user)
    const row = screen.getByRole('listitem', { name: '牛乳' })
    expect(within(row).queryByRole('button', { name: '牛乳を削除' })).not.toBeInTheDocument()
    fireEvent.pointerDown(row, { pointerId: 1, clientX: 300, clientY: 20 })
    fireEvent.pointerMove(row, { pointerId: 1, clientX: 260, clientY: 22 })
    fireEvent.pointerMove(row, { pointerId: 1, clientX: 200, clientY: 22 })
    fireEvent.pointerUp(row, { pointerId: 1, clientX: 200, clientY: 22 })
    fireEvent.click(within(row).getByRole('checkbox', { name: '牛乳' }))
    // スワイプのあとの click ではチェックしない
    expect(within(row).getByRole('checkbox', { name: '牛乳' })).not.toBeChecked()
    // 一番右の区分なので、在庫の区分へは移らない
    expect(screen.getByRole('tab', { name: /^買い物/ })).toHaveAttribute('aria-selected', 'true')

    await user.click(within(row).getByRole('button', { name: '牛乳を削除' }))
    await waitFor(() => expect(shoppingNames()).toEqual(['卵']))
    expect(shopping.names()).toEqual(['卵'])
  })

  it('もう一人の変更をすぐ反映し、お知らせは出さない', async () => {
    const { user, shopping } = setup({ list: ['卵'] })
    await openShopping(user)
    act(() => shopping.remoteChange((r) => r.insert('納豆', null)))
    await waitFor(() => expect(shoppingNames()).toEqual(['卵', '納豆']))
    expect(screen.queryByRole('status', { name: 'お知らせ' })).not.toBeInTheDocument()
  })

  it('オフラインではリストを見られるが、チェック・追加・削除はできない', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      const { user } = setup({ list: ['牛乳'] })
      await openShopping(user)
      expect(screen.getByRole('checkbox', { name: '牛乳' })).toBeDisabled()
      expect(screen.queryByRole('button', { name: '買い物リストに追加' })).not.toBeInTheDocument()
      const row = screen.getByRole('listitem', { name: '牛乳' })
      fireEvent.pointerDown(row, { pointerId: 1, clientX: 300, clientY: 20 })
      fireEvent.pointerMove(row, { pointerId: 1, clientX: 200, clientY: 22 })
      fireEvent.pointerUp(row, { pointerId: 1, clientX: 200, clientY: 22 })
      expect(within(row).queryByRole('button', { name: '牛乳を削除' })).not.toBeInTheDocument()
    } finally {
      online.mockRestore()
    }
  })
})

describe('常備食品を自動で載せる（D-73）', () => {
  it('長押しで「少ないにする」と載り、お知らせが出る', async () => {
    const { user, shopping } = setup({ items: [item({ name: '牛乳' })], stocked: ['牛乳'] })
    await longPress('牛乳')
    await user.click(within(menuOf('牛乳')).getByRole('button', { name: '少ないにする' }))
    expect(await screen.findByRole('status', { name: 'お知らせ' })).toHaveTextContent(
      '牛乳を買い物リストに入れました',
    )
    expect(shopping.names()).toEqual(['牛乳'])
    expect(await screen.findByRole('tab', { name: '買い物（1 件）' })).toBeInTheDocument()
  })

  it('削除すると載り、「元に戻す」だけを出す。「元に戻す」でその品物が消える', async () => {
    const { user, shopping } = setup({ items: [item({ name: '牛乳' })], stocked: ['牛乳'] })
    await longPress('牛乳')
    await user.click(within(menuOf('牛乳')).getByRole('button', { name: '削除' }))
    const toast = await screen.findByRole('status', { name: '元に戻す' })
    expect(toast).toHaveTextContent('牛乳 を削除しました。買い物リストに入れました')
    expect(within(toast).queryByRole('button', { name: '買い物リストへ' })).not.toBeInTheDocument()
    expect(shopping.names()).toEqual(['牛乳'])

    await user.click(within(toast).getByRole('button', { name: '元に戻す' }))
    await waitFor(() => expect(shopping.names()).toEqual([]))
    expect(await screen.findByRole('tab', { name: '買い物' })).toBeInTheDocument()
  })

  it('すでにチェックしていない同じ品物があれば重ならず、お知らせも出さない', async () => {
    const { user, shopping } = setup({
      items: [item({ name: '牛乳' })],
      stocked: ['牛乳'],
      list: ['牛乳'],
    })
    await longPress('牛乳')
    await user.click(within(menuOf('牛乳')).getByRole('button', { name: '少ないにする' }))
    await waitFor(() =>
      expect(screen.getByRole('listitem', { name: '牛乳' })).toHaveAttribute(
        'data-quantity',
        'low',
      ),
    )
    expect(screen.queryByRole('status', { name: 'お知らせ' })).not.toBeInTheDocument()
    expect(shopping.names()).toEqual(['牛乳'])
  })

  it('ほかの在庫が「ある」で残っていれば載らない', async () => {
    const { user, shopping } = setup({
      items: [
        item({ name: '鶏もも肉', location: 'freezer', category: 'meat' }),
        item({ name: '鶏もも肉', thawedOn: TODAY, category: 'meat' }),
      ],
      stocked: ['鶏もも肉'],
    })
    await user.click(await screen.findByRole('tab', { name: '冷蔵' }))
    await longPress('鶏もも肉')
    await user.click(within(menuOf('鶏もも肉')).getByRole('button', { name: '削除' }))
    const toast = await screen.findByRole('status', { name: '元に戻す' })
    expect(toast).toHaveTextContent(/^鶏もも肉 を削除しました買い物リストへ元に戻す$/)
    expect(shopping.names()).toEqual([])
  })
})

describe('手で載せる（D-74）', () => {
  it('長押しメニューの「買い物リストに入れる」で載り、在庫はそのまま', async () => {
    const { user, shopping, repo } = setup({ items: [item({ name: 'キャベツ' })] })
    await longPress('キャベツ')
    await user.click(
      within(menuOf('キャベツ')).getByRole('button', { name: '買い物リストに入れる' }),
    )
    expect(await screen.findByRole('status', { name: 'お知らせ' })).toHaveTextContent(
      'キャベツを買い物リストに入れました',
    )
    expect(shopping.names()).toEqual(['キャベツ'])
    expect(repo.items.map((i) => i.name)).toEqual(['キャベツ'])
    expect(screen.queryByRole('dialog', { name: 'キャベツの操作' })).not.toBeInTheDocument()

    await longPress('キャベツ')
    await user.click(
      within(menuOf('キャベツ')).getByRole('button', { name: '買い物リストに入れる' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'お知らせ' })).toHaveTextContent(
        'キャベツはもう買い物リストにあります',
      ),
    )
  })

  it('削除のあとの「買い物リストへ」で載り、そのあと「元に戻す」をしても消えない', async () => {
    const { user, shopping } = setup({ items: [item({ name: 'キャベツ' })] })
    await longPress('キャベツ')
    await user.click(within(menuOf('キャベツ')).getByRole('button', { name: '削除' }))
    const toast = await screen.findByRole('status', { name: '元に戻す' })
    await user.click(within(toast).getByRole('button', { name: '買い物リストへ' }))
    await waitFor(() =>
      expect(toast).toHaveTextContent('キャベツ を削除しました。買い物リストに入れました'),
    )
    expect(within(toast).queryByRole('button', { name: '買い物リストへ' })).not.toBeInTheDocument()
    expect(shopping.names()).toEqual(['キャベツ'])

    await user.click(within(toast).getByRole('button', { name: '元に戻す' }))
    expect(await screen.findByRole('listitem', { name: 'キャベツ' })).toBeInTheDocument()
    expect(shopping.names()).toEqual(['キャベツ'])
  })
})

describe('常備食品の印と長押し（D-71）', () => {
  it('常備食品に当たる在庫に「常」のバッジを付ける', async () => {
    setup({ items: [item({ name: '低脂肪牛乳' }), item({ name: 'キャベツ' })], stocked: ['牛乳'] })
    const milk = await screen.findByRole('listitem', { name: '低脂肪牛乳' })
    expect(within(milk).getByText('常')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'キャベツ' })).queryByText('常')).toBeNull()
  })

  it('「常備にする」で常備食品に入り、もう一度長押しすると「常備から外す」になる', async () => {
    const { user, shopping } = setup({ items: [item({ name: '卵' })] })
    await longPress('卵')
    await user.click(within(menuOf('卵')).getByRole('button', { name: '常備にする' }))
    await waitFor(() =>
      expect(
        within(screen.getByRole('listitem', { name: '卵' })).getByText('常'),
      ).toBeInTheDocument(),
    )
    expect(shopping.stockedNames).toEqual(['卵'])
    // 在庫が「ある」なので買い物リストには載らない
    expect(shopping.names()).toEqual([])

    await longPress('卵')
    await user.click(within(menuOf('卵')).getByRole('button', { name: '常備から外す' }))
    await waitFor(() => expect(shopping.stockedNames).toEqual([]))
    expect(within(screen.getByRole('listitem', { name: '卵' })).queryByText('常')).toBeNull()
  })

  it('当たる常備食品の名前で外す', async () => {
    const { user, shopping } = setup({
      items: [item({ name: '低脂肪牛乳' })],
      stocked: ['牛乳', '卵'],
    })
    await longPress('低脂肪牛乳')
    await user.click(within(menuOf('低脂肪牛乳')).getByRole('button', { name: '常備から外す' }))
    await waitFor(() => expect(shopping.stockedNames).toEqual(['卵']))
  })
})
