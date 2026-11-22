import { conditionsSummary } from './conditionsSummary'
import type { MealConditions } from './MealsApi'

const base: MealConditions = {
  maxMinutes: 30,
  allowShopping: false,
  riceCooked: true,
  noodle: null,
  soup: true,
  sideDish: true,
  sideMicrowave: false,
  mood: '',
  mustUse: [],
}

describe('今の条件の要約（D-86）', () => {
  it('ご飯あり・使いたい食材と気分なし', () => {
    expect(conditionsSummary(base)).toBe('30 分・在庫のみ・ご飯あり・汁物あり・副菜あり')
  })

  it('指定なし・買い足し OK・麺・使いたい食材・汁物なし・副菜はレンジで・気分', () => {
    expect(
      conditionsSummary({
        ...base,
        maxMinutes: null,
        allowShopping: true,
        riceCooked: false,
        noodle: 'udon',
        soup: false,
        sideMicrowave: true,
        mustUse: ['鶏もも肉', '鮭'],
        mood: ' さっぱり ',
      }),
    ).toBe(
      '時間指定なし・買い足し OK・うどん・使う: 鶏もも肉、鮭・汁物なし・副菜はレンジで・気分: さっぱり',
    )
  })

  it('炊いてない・麺もない・副菜なし（レンジの答えは使わない）', () => {
    expect(
      conditionsSummary({
        ...base,
        maxMinutes: 15,
        riceCooked: false,
        noodle: null,
        sideDish: false,
        sideMicrowave: true,
      }),
    ).toBe('15 分・在庫のみ・主食なし・汁物あり・副菜なし')
  })

  it('パスタ・そば・45 分', () => {
    expect(conditionsSummary({ ...base, riceCooked: false, noodle: 'pasta' })).toContain(
      '・パスタ・',
    )
    expect(
      conditionsSummary({ ...base, riceCooked: false, noodle: 'soba', maxMinutes: 45 }),
    ).toMatch(/^45 分・在庫のみ・そば・/)
  })
})
