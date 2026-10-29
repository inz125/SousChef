import type { InventoryItem } from './inventory'
import {
  expiryAfterEdit,
  expiryBadge,
  formatExpiry,
  isThawing,
  itemsForTab,
  quantityAfterTap,
  thawedOnAfterEdit,
} from './inventory'

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

  it('解凍中の目安の期限は、冷蔵のままカテゴリを変えても解凍した日の 2 日後のまま（D-47）', () => {
    const thawing = { ...chicken, thawedOn: '2026-10-24', expiresOn: '2026-10-26' }
    expect(expiryAfterEdit(thawing, { ...thawing, category: 'processed' }, today)).toEqual({
      expiresOn: '2026-10-26',
      expiresOnEstimated: true,
    })
  })

  it('解凍中の行を冷蔵以外に移すと、今日から再推定する', () => {
    const thawing = { ...chicken, thawedOn: '2026-10-24', expiresOn: '2026-10-26' }
    expect(expiryAfterEdit(thawing, { ...thawing, location: 'freezer' }, today)).toEqual({
      expiresOn: '2026-11-24',
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

describe('解凍中（D-47）', () => {
  it('冷蔵で解凍した日がある行が解凍中', () => {
    expect(isThawing(item({ location: 'fridge', thawedOn: '2026-10-25' }))).toBe(true)
    expect(isThawing(item({ location: 'fridge' }))).toBe(false)
  })

  it('端末に残っていた古い在庫（thawedOn がない）は解凍中ではない', () => {
    const { thawedOn: _, ...old } = item({ location: 'fridge' })
    expect(isThawing(old as InventoryItem)).toBe(false)
  })

  it('冷蔵以外に移すと解凍中は外れる', () => {
    const thawing = item({ location: 'fridge', thawedOn: '2026-10-25' })
    expect(thawedOnAfterEdit(thawing, { ...thawing, name: '鶏肉' })).toBe('2026-10-25')
    expect(thawedOnAfterEdit(thawing, { ...thawing, location: 'freezer' })).toBeNull()
  })
})

describe('期限のバッジ（D-56）', () => {
  const today = '2026-10-29'
  it('期限切れは「!」、今日〜2 日後は残り日数、それ以外は出さない', () => {
    expect(expiryBadge('2026-10-28', today)).toBe('!')
    expect(expiryBadge('2026-10-29', today)).toBe('0')
    expect(expiryBadge('2026-10-30', today)).toBe('1')
    expect(expiryBadge('2026-10-31', today)).toBe('2')
    expect(expiryBadge('2026-11-01', today)).toBeNull()
    expect(expiryBadge(null, today)).toBeNull()
  })
})
