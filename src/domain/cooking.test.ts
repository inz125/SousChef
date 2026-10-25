import { cookedChanges, defaultLocation, stockCandidates, type CookedChoice } from './cooking'
import type { InventoryItem } from './inventory'

const item = (name: string, over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: name,
  name,
  category: 'meat',
  location: 'fridge',
  quantity: 'enough',
  expiresOn: null,
  expiresOnEstimated: false,
  ...over,
})

describe('stockCandidates', () => {
  it('同じ名前を最優先し、次に名前を含むものを、それぞれ期限が近い順に返す', () => {
    const items = [
      item('鶏もも肉（特売）', { expiresOn: '2026-10-26' }),
      item('鶏もも肉', { id: 'a', expiresOn: '2026-10-30' }),
      item('鶏もも肉', { id: 'b', expiresOn: '2026-10-27' }),
      item('豚バラ肉'),
    ]
    expect(stockCandidates('鶏もも肉', items).map((i) => i.id)).toEqual([
      'b',
      'a',
      '鶏もも肉（特売）',
    ])
  })

  it('在庫の名前が材料名に含まれる場合も候補にする（例: 材料「木綿豆腐」・在庫「豆腐」）', () => {
    expect(stockCandidates('木綿豆腐', [item('豆腐')]).map((i) => i.name)).toEqual(['豆腐'])
  })

  it('見つからなければ空', () => {
    expect(stockCandidates('キャベツ', [item('豚バラ肉')])).toEqual([])
  })
})

describe('defaultLocation', () => {
  it.each([
    ['leafy', 'vegetable'],
    ['root', 'vegetable'],
    ['fruit', 'vegetable'],
    ['staple', 'pantry'],
    ['seasoning', 'pantry'],
    ['meat', 'fridge'],
    ['dairy', 'fridge'],
  ] as const)('%s → %s', (category, location) => {
    expect(defaultLocation(category)).toBe(location)
  })
})

describe('cookedChanges', () => {
  const today = '2026-10-25'

  it('使い切ったは削除、少ないは量を少ないに、まだあるは何もしない', () => {
    const choices: CookedChoice[] = [
      { item: item('鶏もも肉'), result: 'used_up' },
      { item: item('キャベツ'), result: 'low' },
      { item: item('豆腐'), result: 'left' },
    ]
    expect(cookedChanges(choices, [], [], today)).toEqual({
      removeIds: ['鶏もも肉'],
      lowIds: ['キャベツ'],
      add: [],
    })
  })

  it('もともと少ない食材を「少ない」にしても更新しない', () => {
    const choices: CookedChoice[] = [{ item: item('卵', { quantity: 'low' }), result: 'low' }]
    expect(cookedChanges(choices, [], [], today).lowIds).toEqual([])
  })

  it('余った買い足し食材は「少ない」・目安の期限で追加する。場所は補完候補→カテゴリの順', () => {
    const leftovers = [
      { name: 'しょうが', category: 'root' as const },
      { name: '牛乳', category: 'dairy' as const },
    ]
    const catalog = [{ name: '牛乳', category: 'dairy' as const, location: 'pantry' as const }]
    expect(cookedChanges([], leftovers, catalog, today).add).toEqual([
      {
        name: 'しょうが',
        category: 'root',
        location: 'vegetable',
        quantity: 'low',
        expiresOn: '2026-11-15',
        expiresOnEstimated: true,
      },
      {
        name: '牛乳',
        category: 'dairy',
        location: 'pantry',
        quantity: 'low',
        expiresOn: '2026-10-28',
        expiresOnEstimated: true,
      },
    ])
  })
})
