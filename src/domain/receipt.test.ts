import type { InventoryItem } from './inventory'
import { receiptChanges, receiptDrafts, renameDraft, type ReceiptItem } from './receipt'

const TODAY = '2026-10-25'

const read = (over: Partial<ReceiptItem> = {}): ReceiptItem => ({
  name: '牛乳',
  category: 'dairy',
  location: 'fridge',
  ...over,
})

const stock = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'i1',
  name: '牛乳',
  category: 'dairy',
  location: 'fridge',
  quantity: 'low',
  expiresOn: '2026-10-20',
  expiresOnEstimated: false,
  thawedOn: null,
  ...over,
})

describe('receiptDrafts', () => {
  it('すべてチェック ON で、AI の推定を初期値にする', () => {
    const [draft] = receiptDrafts(
      [read({ name: '冷凍餃子', category: 'processed', location: 'freezer' })],
      [],
    )
    expect(draft).toMatchObject({
      checked: true,
      name: '冷凍餃子',
      category: 'processed',
      location: 'freezer',
    })
  })

  it('補完候補にある名前は、AI の推定より補完候補のカテゴリ・場所を優先する', () => {
    const [draft] = receiptDrafts(
      [read({ name: '冷凍餃子', category: 'processed', location: 'freezer' })],
      [{ name: '冷凍餃子', category: 'processed', location: 'fridge' }],
    )
    expect(draft.location).toBe('fridge')
  })

  it('肉は補完候補・AI の推定より冷凍を優先する（D-46）', () => {
    const [draft] = receiptDrafts(
      [read({ name: '鶏もも肉', category: 'meat', location: 'fridge' })],
      [{ name: '鶏もも肉', category: 'meat', location: 'fridge' }],
    )
    expect(draft.location).toBe('freezer')
  })

  it('魚介は対象外', () => {
    const [draft] = receiptDrafts(
      [read({ name: 'サーモン', category: 'fish', location: 'fridge' })],
      [{ name: 'サーモン', category: 'fish', location: 'fridge' }],
    )
    expect(draft.location).toBe('fridge')
  })

  it('行ごとに別のキーを振る', () => {
    const drafts = receiptDrafts([read({ name: 'a' }), read({ name: 'b' })], [])
    expect(new Set(drafts.map((d) => d.key)).size).toBe(2)
  })
})

describe('renameDraft', () => {
  const [draft] = receiptDrafts([read({ name: '鶏むね肉', category: 'meat' })], [])

  it('補完候補にある名前に書き換えたら、カテゴリ・場所をその値に入れ直す', () => {
    const renamed = renameDraft(draft, '牛乳 ', [
      { name: '牛乳', category: 'dairy', location: 'freezer' },
    ])
    expect(renamed).toMatchObject({ name: '牛乳 ', category: 'dairy', location: 'freezer' })
  })

  it('補完候補にない名前なら、カテゴリ・場所は変えない', () => {
    expect(renameDraft(draft, 'ささみ', [])).toMatchObject({
      category: 'meat',
      location: 'freezer',
    })
  })

  it('補完候補の肉に書き換えたら、場所は冷凍にする（D-46）', () => {
    const milk = receiptDrafts([read()], [])[0]
    expect(
      renameDraft(milk, '豚こま肉', [{ name: '豚こま肉', category: 'meat', location: 'fridge' }]),
    ).toMatchObject({ category: 'meat', location: 'freezer' })
  })
})

describe('receiptChanges', () => {
  it('在庫にない食材は「ある」・目安の期限で追加する', () => {
    const drafts = receiptDrafts([read({ name: '鶏むね肉', category: 'meat' })], [])
    const { adds, updates } = receiptChanges(drafts, [], TODAY)
    expect(updates).toEqual([])
    expect(adds).toEqual([
      {
        name: '鶏むね肉',
        category: 'meat',
        location: 'freezer',
        quantity: 'enough',
        expiresOn: '2026-11-24',
        expiresOnEstimated: true,
        thawedOn: null,
      },
    ])
  })

  it('同じ名前の在庫があれば新しい行を作らず、「ある」に戻して期限を推定し直す（カテゴリ・場所は在庫のまま）', () => {
    const drafts = receiptDrafts([read({ location: 'freezer', category: 'meat' })], [])
    const { adds, updates } = receiptChanges(drafts, [stock({ location: 'fridge' })], TODAY)
    expect(adds).toEqual([])
    expect(updates).toEqual([
      stock({
        quantity: 'enough',
        category: 'dairy',
        location: 'fridge',
        expiresOn: '2026-11-01',
        expiresOnEstimated: true,
      }),
    ])
  })

  it('同じ名前の在庫が複数あれば、期限が近い順の先頭 1 件だけを更新する', () => {
    const drafts = receiptDrafts([read()], [])
    const { updates } = receiptChanges(
      drafts,
      [
        stock({ id: 'late', expiresOn: '2026-12-01' }),
        stock({ id: 'early', expiresOn: '2026-10-26' }),
      ],
      TODAY,
    )
    expect(updates.map((u) => u.id)).toEqual(['early'])
  })

  it('名前の一部が一致するだけの在庫は更新しない', () => {
    const drafts = receiptDrafts([read({ name: '牛乳' })], [])
    const { adds, updates } = receiptChanges(drafts, [stock({ name: '低脂肪牛乳' })], TODAY)
    expect(updates).toEqual([])
    expect(adds.map((a) => a.name)).toEqual(['牛乳'])
  })

  it('肉は冷凍の行だけを更新し、解凍中の行は変えない（D-46）', () => {
    const drafts = receiptDrafts([read({ name: '鶏もも肉', category: 'meat' })], [])
    const frozen = stock({ id: 'f', name: '鶏もも肉', category: 'meat', location: 'freezer' })
    const thawing = stock({
      id: 't',
      name: '鶏もも肉',
      category: 'meat',
      location: 'fridge',
      thawedOn: '2026-10-24',
      expiresOn: '2026-10-26',
    })
    const { adds, updates } = receiptChanges(drafts, [thawing, frozen], TODAY)
    expect(adds).toEqual([])
    expect(updates).toEqual([
      { ...frozen, quantity: 'enough', expiresOn: '2026-11-24', expiresOnEstimated: true },
    ])
  })

  it('肉で冷凍の行がなければ、冷凍で新しい行を作る', () => {
    const drafts = receiptDrafts([read({ name: '鶏もも肉', category: 'meat' })], [])
    const thawing = stock({
      name: '鶏もも肉',
      category: 'meat',
      location: 'fridge',
      thawedOn: '2026-10-24',
    })
    const { adds, updates } = receiptChanges(drafts, [thawing], TODAY)
    expect(updates).toEqual([])
    expect(adds).toMatchObject([{ name: '鶏もも肉', location: 'freezer', thawedOn: null }])
  })

  it('チェックが OFF の行は何もしない', () => {
    const drafts = receiptDrafts([read()], []).map((d) => ({ ...d, checked: false }))
    expect(receiptChanges(drafts, [stock()], TODAY)).toEqual({ adds: [], updates: [] })
  })

  it('名前の前後の空白は除く。名前が重複した行は最初の 1 つだけ扱う', () => {
    const drafts = receiptDrafts(
      [
        read({ name: 'にんじん', category: 'root' }),
        read({ name: 'じゃがいも', category: 'root' }),
      ],
      [],
    )
    const renamed = [drafts[0], renameDraft(drafts[1], ' にんじん ', [])]
    const { adds } = receiptChanges(renamed, [], TODAY)
    expect(adds.map((a) => a.name)).toEqual(['にんじん'])
  })
})
