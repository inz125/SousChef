import type { Category } from '../domain/food'
import {
  MealsError,
  outlineOf,
  type MealConditions,
  type MealOutline,
  type MealsApi,
  type MealSuggestion,
} from './MealsApi'

type Source = 'stock' | 'staple' | 'buy'

const dish = (
  name: string,
  ingredients: [string, string, Source, Category][],
  steps: string[],
) => ({
  name,
  minutes: 15,
  ingredients: ingredients.map(([n, amount, source, category]) => ({
    name: n,
    amount,
    source,
    category,
  })),
  steps,
})

export const SAMPLE_SUGGESTIONS: MealSuggestion[] = [
  {
    main: dish(
      '鶏の照り焼き',
      [
        ['鶏もも肉', '300g', 'stock', 'meat'],
        ['醤油', '大さじ2', 'staple', 'seasoning'],
        ['しょうが', '1 かけ', 'buy', 'root'],
      ],
      ['鶏肉を焼く', 'たれをからめる'],
    ),
    side: dish('キャベツの浅漬け', [['キャベツ', '1/4 個', 'stock', 'leafy']], ['切る', '揉む']),
    soup: dish(
      'わかめの味噌汁',
      [
        ['乾燥わかめ', '大さじ1', 'buy', 'seasoning'],
        ['味噌', '大さじ2', 'staple', 'seasoning'],
      ],
      ['湯を沸かす', '味噌を溶く'],
    ),
    totalMinutes: 25,
    usesExpiringSoon: ['鶏もも肉'],
    tip: '漬けている間に焼く',
  },
  {
    main: dish('豆腐ステーキ', [['豆腐', '1 丁', 'stock', 'soy']], ['焼く']),
    side: dish('もやしのナムル', [['もやし', '1 袋', 'stock', 'leafy']], ['ゆでる', '和える']),
    soup: dish('みそ汁', [['味噌', '大さじ2', 'staple', 'seasoning']], ['煮る']),
    totalMinutes: 15,
    usesExpiringSoon: [],
    tip: '',
  },
  {
    main: dish('野菜炒め', [['キャベツ', '1/4 個', 'stock', 'leafy']], ['炒める']),
    side: dish('冷奴', [['豆腐', '1/2 丁', 'stock', 'soy']], ['切る']),
    soup: dish('かき玉汁', [['卵', '1 個', 'stock', 'egg']], ['溶き卵を流す']),
    totalMinutes: 10,
    usesExpiringSoon: [],
    tip: '',
  },
]

/** テスト用の献立提案 API。呼び出しを記録し、応答を制御できる */
export class FakeMealsApi implements MealsApi {
  calls: MealConditions[] = []
  error: string | null = null
  /** 返す案（レシピつき）。suggest は分量・手順を除いた案を返し、makeRecipe はこのレシピを返す（D-63） */
  result: MealSuggestion[] = SAMPLE_SUGGESTIONS
  private pending: (() => void) | null = null
  hold = false
  recipeCalls: { conditions: MealConditions; outline: MealOutline }[] = []
  /** 主菜の名前ごとの、レシピ作りの失敗の理由 */
  recipeErrors: Record<string, string> = {}
  /** true のあいだ、レシピは releaseRecipes まで返さない */
  holdRecipes = false
  private pendingRecipes: (() => void)[] = []

  async suggest(conditions: MealConditions) {
    this.calls.push(conditions)
    if (this.hold) await new Promise<void>((resolve) => (this.pending = resolve))
    if (this.error) throw new MealsError(this.error)
    return this.result.map(outlineOf)
  }

  async makeRecipe(conditions: MealConditions, outline: MealOutline) {
    this.recipeCalls.push({ conditions, outline })
    // 依頼したときの結果を使う（後から result を変えても、届くのは依頼した案のレシピ）
    const recipe = this.result.find((s) => s.main.name === outline.main.name)
    if (this.holdRecipes) await new Promise<void>((resolve) => this.pendingRecipes.push(resolve))
    const error = this.recipeErrors[outline.main.name]
    if (error) throw new MealsError(error)
    if (!recipe) throw new MealsError('レシピを作れませんでした')
    return recipe
  }

  /** hold 中の応答を返す */
  release() {
    this.pending?.()
  }

  /** holdRecipes 中のレシピを、依頼した順に count 件（既定はすべて）返す */
  releaseRecipes(count = this.pendingRecipes.length) {
    for (const resolve of this.pendingRecipes.splice(0, count)) resolve()
  }
}
