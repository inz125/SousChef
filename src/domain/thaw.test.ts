import type { InventoryItem } from './inventory'
import {
  canThaw,
  frozenMeatFor,
  frozenMeatsOf,
  initialLocation,
  showThawBanner,
  thawChanges,
  type ThawBannerState,
} from './thaw'

const TODAY = '2026-10-26'

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'i1',
  name: '鶏もも肉',
  category: 'meat',
  location: 'freezer',
  quantity: 'enough',
  expiresOn: '2026-11-20',
  expiresOnEstimated: true,
  thawedOn: null,
  ...over,
})

describe('initialLocation（D-46）', () => {
  it('肉は冷凍', () => {
    expect(initialLocation('meat', 'fridge')).toBe('freezer')
  })

  it('肉以外（魚介も）はそのまま', () => {
    expect(initialLocation('fish', 'fridge')).toBe('fridge')
    expect(initialLocation('dairy', 'pantry')).toBe('pantry')
  })
})

describe('canThaw（D-47）', () => {
  it('冷凍の肉だけ解凍できる', () => {
    expect(canThaw(item())).toBe(true)
    expect(canThaw(item({ location: 'fridge' }))).toBe(false)
    expect(canThaw(item({ category: 'fish' }))).toBe(false)
  })
})

describe('thawChanges（D-47）', () => {
  it('全部: 行ごと冷蔵に移し、解凍中にして期限は解凍した日の 2 日後（目安）。量は変えない', () => {
    const frozen = item({ quantity: 'low', expiresOnEstimated: false })
    expect(thawChanges(frozen, { kind: 'all' }, TODAY)).toEqual({
      update: {
        ...frozen,
        location: 'fridge',
        thawedOn: TODAY,
        expiresOn: '2026-10-28',
        expiresOnEstimated: true,
      },
      add: null,
    })
  })

  it('一部: 冷凍の行は量だけ変え、冷蔵に同じ名前・カテゴリで「ある」の解凍中の行を足す', () => {
    const frozen = item()
    expect(thawChanges(frozen, { kind: 'part', remaining: 'low' }, TODAY)).toEqual({
      update: { ...frozen, quantity: 'low' },
      add: {
        name: '鶏もも肉',
        category: 'meat',
        location: 'fridge',
        quantity: 'enough',
        expiresOn: '2026-10-28',
        expiresOnEstimated: true,
        thawedOn: TODAY,
      },
    })
  })
})

describe('frozenMeatFor（D-49）', () => {
  it('材料に当たる在庫の先頭が冷凍の肉なら、その行を返す', () => {
    const frozen = item({ name: '鶏もも肉1' })
    expect(frozenMeatFor('鶏もも肉', [frozen])).toBe(frozen)
  })

  it('解凍中の行があれば期限が近いのでそちらが先頭になり、印は付かない', () => {
    const frozen = item({ id: 'f' })
    const thawing = item({ id: 't', location: 'fridge', thawedOn: TODAY, expiresOn: '2026-10-28' })
    expect(frozenMeatFor('鶏もも肉', [frozen, thawing])).toBeUndefined()
  })

  it('肉以外の冷凍の食材や、在庫にない材料は対象外', () => {
    expect(frozenMeatFor('えび', [item({ name: 'えび', category: 'fish' })])).toBeUndefined()
    expect(frozenMeatFor('豚バラ肉', [item()])).toBeUndefined()
  })
})

describe('frozenMeatsOf（D-49）', () => {
  it('在庫の材料のうち冷凍の肉の行を、重複なく返す', () => {
    const frozen = item()
    const ingredients = [
      { name: '鶏もも肉', source: 'stock' },
      { name: '鶏もも肉', source: 'stock' },
      { name: '鶏もも肉', source: 'buy' },
      { name: 'キャベツ', source: 'stock' },
    ]
    expect(frozenMeatsOf(ingredients, [frozen])).toEqual([frozen])
  })

  it('買い足しの材料は、同じ名前の冷凍の肉があっても対象外', () => {
    expect(frozenMeatsOf([{ name: '鶏もも肉', source: 'buy' }], [item()])).toEqual([])
  })
})

describe('showThawBanner（D-48）', () => {
  const state = (over: Partial<ThawBannerState> = {}): ThawBannerState => ({
    items: [item()],
    now: new Date('2026-10-26T18:00:00'),
    today: TODAY,
    dismissedOn: null,
    online: true,
    ...over,
  })

  it('18 時以降・冷凍に肉があり・解凍中の肉がないときに出す', () => {
    expect(showThawBanner(state())).toBe(true)
  })

  it('18 時より前は出さない', () => {
    expect(showThawBanner(state({ now: new Date('2026-10-26T17:59:00') }))).toBe(false)
  })

  it('冷凍に肉がなければ出さない（肉以外の冷凍食品だけ・冷蔵の肉だけ）', () => {
    expect(showThawBanner(state({ items: [item({ category: 'processed' })] }))).toBe(false)
    expect(showThawBanner(state({ items: [item({ location: 'fridge' })] }))).toBe(false)
  })

  it('解凍中の肉があれば出さない', () => {
    const thawing = item({ id: 't', location: 'fridge', thawedOn: '2026-10-25' })
    expect(showThawBanner(state({ items: [item(), thawing] }))).toBe(false)
  })

  it('「今日はいい」を押した日は出さないが、翌日は出す', () => {
    expect(showThawBanner(state({ dismissedOn: TODAY }))).toBe(false)
    expect(showThawBanner(state({ dismissedOn: '2026-10-25' }))).toBe(true)
  })

  it('オフラインでは出さない', () => {
    expect(showThawBanner(state({ online: false }))).toBe(false)
  })
})
