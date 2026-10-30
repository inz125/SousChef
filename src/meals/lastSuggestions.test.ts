import { memoryStore } from '../offline/offlineCache'
import { SAMPLE_SUGGESTIONS } from './FakeMealsApi'
import { loadLastSuggestions, saveLastSuggestions, type LastSuggestions } from './lastSuggestions'
import { outlineOf } from './MealsApi'

const last: LastSuggestions = {
  conditions: {
    maxMinutes: 15,
    allowShopping: true,
    riceCooked: false,
    noodle: 'udon',
    soup: true,
    sideDish: false,
    sideMicrowave: true,
    mood: '和食',
    mustUse: ['豆腐'],
  },
  // レシピがまだの案も保存する（D-63）
  plans: SAMPLE_SUGGESTIONS.map((s, i) => ({ outline: outlineOf(s), recipe: i === 0 ? s : null })),
}

describe('最後の提案結果（D-43）', () => {
  it('保存した条件と案・できたレシピを読み戻せる', () => {
    const store = memoryStore()
    saveLastSuggestions(store, last)
    expect(loadLastSuggestions(store)).toEqual(last)
  })

  it('2 段階になる前の形式（レシピつきの suggestions）は、レシピができた案として読める（D-63）', () => {
    const store = memoryStore()
    store.set(
      'souschef:last-suggestions',
      JSON.stringify({ conditions: last.conditions, suggestions: SAMPLE_SUGGESTIONS }),
    )
    expect(loadLastSuggestions(store)?.plans).toEqual(
      SAMPLE_SUGGESTIONS.map((s) => ({ outline: outlineOf(s), recipe: s })),
    )
  })

  it('保存していなければ null', () => {
    expect(loadLastSuggestions(memoryStore())).toBeNull()
  })

  it('壊れた内容・形の違う内容は捨てて null', () => {
    const store = memoryStore()
    store.set('souschef:last-suggestions', '{broken')
    expect(loadLastSuggestions(store)).toBeNull()
    store.set('souschef:last-suggestions', JSON.stringify({ conditions: {}, suggestions: 1 }))
    expect(loadLastSuggestions(store)).toBeNull()
  })

  it('汁物が入る前の形式（soup なし）も汁物なしの案として読める', () => {
    const store = memoryStore()
    const { soup: _, ...conditions } = last.conditions
    const suggestions = SAMPLE_SUGGESTIONS.map(({ soup: _s, ...s }) => s)
    store.set('souschef:last-suggestions', JSON.stringify({ conditions, suggestions }))

    const loaded = loadLastSuggestions(store)
    expect(loaded?.plans.map((p) => p.recipe?.soup)).toEqual([null, null, null])
    expect(loaded?.plans.map((p) => p.outline.soup)).toEqual([null, null, null])
    expect(loaded?.conditions.soup).toBe(false)
  })

  it('副菜のレンジの条件が入る前の形式も「どちらでも」として読める（D-50）', () => {
    const store = memoryStore()
    const { sideMicrowave: _, ...conditions } = last.conditions
    store.set(
      'souschef:last-suggestions',
      JSON.stringify({ conditions, suggestions: SAMPLE_SUGGESTIONS }),
    )
    expect(loadLastSuggestions(store)?.conditions.sideMicrowave).toBe(false)
  })

  it('ご飯・麺・副菜の有無が入る前の形式も「炊いてある・麺なし・副菜あり」として読める（D-54）', () => {
    const store = memoryStore()
    const { riceCooked: _r, noodle: _n, sideDish: _s, ...conditions } = last.conditions
    store.set(
      'souschef:last-suggestions',
      JSON.stringify({ conditions, suggestions: SAMPLE_SUGGESTIONS }),
    )
    expect(loadLastSuggestions(store)?.conditions).toMatchObject({
      riceCooked: true,
      noodle: null,
      sideDish: true,
    })
  })
})
