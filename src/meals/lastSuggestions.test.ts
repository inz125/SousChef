import { memoryStore } from '../offline/offlineCache'
import { SAMPLE_SUGGESTIONS } from './FakeMealsApi'
import { loadLastSuggestions, saveLastSuggestions, type LastSuggestions } from './lastSuggestions'

const last: LastSuggestions = {
  conditions: {
    maxMinutes: 15,
    allowShopping: true,
    soup: true,
    sideMicrowave: true,
    mood: '和食',
    mustUse: ['豆腐'],
  },
  suggestions: SAMPLE_SUGGESTIONS,
}

describe('最後の提案結果（D-43）', () => {
  it('保存した条件と提案を読み戻せる', () => {
    const store = memoryStore()
    saveLastSuggestions(store, last)
    expect(loadLastSuggestions(store)).toEqual(last)
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
    expect(loaded?.suggestions.map((s) => s.soup)).toEqual([null, null, null])
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
})
