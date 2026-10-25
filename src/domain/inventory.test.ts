import type { InventoryItem } from './inventory'
import { expiryAfterEdit, formatExpiry, itemsForTab, quantityAfterTap } from './inventory'

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

describe('itemsForTab', () => {
  it('「すべて」は全件を期限が近い順に並べ、期限なしは最後', () => {
    const items = [
      item({ name: 'C', expiresOn: null }),
      item({ name: 'B', expiresOn: '2026-10-30', location: 'freezer' }),
      item({ name: 'A', expiresOn: '2026-10-26' }),
    ]
    expect(itemsForTab(items, 'all').map((i) => i.name)).toEqual(['A', 'B', 'C'])
  })

  it('保存場所タブはその場所の食材だけを返す', () => {
    const items = [item({ name: '冷凍エビ', location: 'freezer' }), item({ name: '牛乳' })]
    expect(itemsForTab(items, 'freezer').map((i) => i.name)).toEqual(['冷凍エビ'])
  })

  it('期限が同じなら名前順', () => {
    const items = [
      item({ name: 'にんじん', expiresOn: '2026-10-30' }),
      item({ name: 'キャベツ', expiresOn: '2026-10-30' }),
    ]
    expect(itemsForTab(items, 'all').map((i) => i.name)).toEqual(['キャベツ', 'にんじん'])
  })
})

describe('formatExpiry', () => {
  const today = '2026-10-25'

  it.each([
    ['2026-10-24', '期限切れ'],
    ['2026-10-25', '今日まで'],
    ['2026-10-26', 'あと1日'],
    ['2026-10-27', 'あと2日'],
    ['2026-11-03', '11/3まで'],
  ])('%s → %s', (expiresOn, label) => {
    expect(formatExpiry(expiresOn, today)).toBe(label)
  })

  it('期限なしは空文字', () => {
    expect(formatExpiry(null, today)).toBe('')
  })
})

describe('quantityAfterTap', () => {
  it('ある ⇔ 少ない を切り替える', () => {
    expect(quantityAfterTap('enough')).toBe('low')
    expect(quantityAfterTap('low')).toBe('enough')
  })
})

describe('expiryAfterEdit', () => {
  const today = '2026-10-25'
  const chicken = item({
    name: '鶏もも肉',
    category: 'meat',
    location: 'fridge',
    expiresOn: '2026-10-24',
    expiresOnEstimated: true,
  })

  it('目安の期限は、保存場所を変えると今日から再推定する', () => {
    expect(expiryAfterEdit(chicken, { ...chicken, location: 'freezer' }, today)).toEqual({
      expiresOn: '2026-11-24',
      expiresOnEstimated: true,
    })
  })

  it('目安の期限は、カテゴリを変えても再推定する', () => {
    expect(expiryAfterEdit(chicken, { ...chicken, category: 'processed' }, today)).toEqual({
      expiresOn: '2026-11-01',
      expiresOnEstimated: true,
    })
  })

  it('場所もカテゴリも変えなければ元の期限のまま（名前だけの変更など）', () => {
    expect(expiryAfterEdit(chicken, { ...chicken, name: '鶏もも肉（下味）' }, today)).toEqual({
      expiresOn: '2026-10-24',
      expiresOnEstimated: true,
    })
  })

  it('手入力の期限は場所を変えても変えない', () => {
    const manual = { ...chicken, expiresOnEstimated: false }
    expect(expiryAfterEdit(manual, { ...manual, location: 'freezer' }, today)).toEqual({
      expiresOn: '2026-10-24',
      expiresOnEstimated: false,
    })
  })
})
