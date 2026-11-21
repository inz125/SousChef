import type { InventoryItem } from './inventory'
import {
  autoShoppingNames,
  buyNames,
  hasUnchecked,
  isStocked,
  namesMatch,
  orderShopping,
  type ShoppingItem,
} from './shopping'

const item = (id: string, name: string, quantity: InventoryItem['quantity'] = 'enough') =>
  ({
    id,
    name,
    category: 'dairy',
    location: 'fridge',
    quantity,
    expiresOn: null,
    expiresOnEstimated: false,
    thawedOn: null,
  }) satisfies InventoryItem

const shop = (name: string, checked = false, createdAt = '2026-11-20T00:00:00Z'): ShoppingItem => ({
  id: `${name}-${checked}`,
  name,
  checked,
  createdAt,
})

describe('namesMatch（D-69 と同じ照らし合わせ）', () => {
  it('名前が同じか、片方がもう片方を含めば当たる', () => {
    expect(namesMatch('牛乳', '牛乳')).toBe(true)
    expect(namesMatch('牛乳', '低脂肪牛乳')).toBe(true)
    expect(namesMatch('低脂肪牛乳', '牛乳')).toBe(true)
    expect(namesMatch('牛乳', '卵')).toBe(false)
  })
})

describe('isStocked', () => {
  it('常備食品のどれかに当たれば常備（D-71）', () => {
    expect(isStocked('低脂肪牛乳', ['卵', '牛乳'])).toBe(true)
    expect(isStocked('キャベツ', ['卵', '牛乳'])).toBe(false)
  })
})

describe('autoShoppingNames（D-73）', () => {
  it('常備食品の在庫を少ない・削除にすると、その常備食品の名前を返す', () => {
    const milk = item('1', '低脂肪牛乳')
    expect(autoShoppingNames(milk, [milk], ['牛乳', '卵'])).toEqual(['牛乳'])
  })

  it('同じ常備食品に当たるほかの在庫が「ある」なら載せない', () => {
    const fridge = item('1', '鶏もも肉')
    const freezer = item('2', '鶏もも肉')
    expect(autoShoppingNames(fridge, [fridge, freezer], ['鶏もも肉'])).toEqual([])
  })

  it('ほかの在庫が「少ない」だけなら載せる', () => {
    const a = item('1', '卵')
    const b = item('2', '卵', 'low')
    expect(autoShoppingNames(a, [a, b], ['卵'])).toEqual(['卵'])
  })

  it('常備でない在庫は載せない', () => {
    const cabbage = item('1', 'キャベツ')
    expect(autoShoppingNames(cabbage, [cabbage], ['卵'])).toEqual([])
  })
})

describe('orderShopping（D-72）', () => {
  it('チェックしていない品物を入れた順、その下にチェックした品物', () => {
    const list = [
      shop('卵', true, '2026-11-20T00:00:02Z'),
      shop('豆腐', false, '2026-11-20T00:00:03Z'),
      shop('牛乳', false, '2026-11-20T00:00:01Z'),
      shop('納豆', true, '2026-11-20T00:00:00Z'),
    ]
    expect(orderShopping(list).map((i) => i.name)).toEqual(['牛乳', '豆腐', '納豆', '卵'])
  })
})

describe('hasUnchecked（D-74）', () => {
  it('チェックしていない同じ名前があるときだけ true', () => {
    expect(hasUnchecked([shop('豆腐')], '豆腐')).toBe(true)
    expect(hasUnchecked([shop('豆腐', true)], '豆腐')).toBe(false)
    expect(hasUnchecked([shop('木綿豆腐')], '豆腐')).toBe(false)
  })
})

describe('buyNames（D-74）', () => {
  it('買い足しの材料と、今の在庫にない「在庫」の材料の名前を返す（D-69）', () => {
    const stock = [item('1', '豚ひき肉')]
    const ingredients = [
      { name: '豆腐', source: 'buy' as const },
      { name: '豚ひき肉', source: 'stock' as const },
      { name: '長ねぎ', source: 'stock' as const },
      { name: '醤油', source: 'staple' as const },
    ]
    expect(buyNames(ingredients, stock)).toEqual(['豆腐', '長ねぎ'])
  })
})
