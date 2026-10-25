import { MealsError, type MealConditions, type MealsApi, type MealSuggestion } from './MealsApi'

type Source = 'stock' | 'staple' | 'buy'

const dish = (name: string, ingredients: [string, string, Source][], steps: string[]) => ({
  name,
  minutes: 15,
  ingredients: ingredients.map(([n, amount, source]) => ({ name: n, amount, source })),
  steps,
})

export const SAMPLE_SUGGESTIONS: MealSuggestion[] = [
  {
    main: dish(
      '鶏の照り焼き',
      [
        ['鶏もも肉', '300g', 'stock'],
        ['醤油', '大さじ2', 'staple'],
        ['しょうが', '1 かけ', 'buy'],
      ],
      ['鶏肉を焼く', 'たれをからめる'],
    ),
    side: dish('キャベツの浅漬け', [['キャベツ', '1/4 個', 'stock']], ['切る', '揉む']),
    totalMinutes: 25,
    usesExpiringSoon: ['鶏もも肉'],
    tip: '漬けている間に焼く',
  },
  {
    main: dish('豆腐ステーキ', [['豆腐', '1 丁', 'stock']], ['焼く']),
    side: dish('みそ汁', [['味噌', '大さじ2', 'staple']], ['煮る']),
    totalMinutes: 15,
    usesExpiringSoon: [],
    tip: '',
  },
  {
    main: dish('野菜炒め', [['キャベツ', '1/4 個', 'stock']], ['炒める']),
    side: dish('冷奴', [['豆腐', '1/2 丁', 'stock']], ['切る']),
    totalMinutes: 10,
    usesExpiringSoon: [],
    tip: '',
  },
]

/** テスト用の献立提案 API。呼び出しを記録し、応答を制御できる */
export class FakeMealsApi implements MealsApi {
  calls: MealConditions[] = []
  error: string | null = null
  private pending: (() => void) | null = null
  hold = false

  async suggest(conditions: MealConditions) {
    this.calls.push(conditions)
    if (this.hold) await new Promise<void>((resolve) => (this.pending = resolve))
    if (this.error) throw new MealsError(this.error)
    return SAMPLE_SUGGESTIONS
  }

  /** hold 中の応答を返す */
  release() {
    this.pending?.()
  }
}
