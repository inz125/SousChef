import type { InventoryItem } from '../domain/inventory'
import { FakeInventoryRepository } from '../inventory/FakeInventoryRepository'
import { SAMPLE_SUGGESTIONS } from '../meals/FakeMealsApi'
import { FakeRecipesRepository } from '../recipes/FakeRecipesRepository'
import { cachedInventoryRepository, cachedRecipesRepository, memoryStore } from './offlineCache'

const milk: InventoryItem = {
  id: '1',
  name: '牛乳',
  category: 'dairy',
  location: 'fridge',
  quantity: 'enough',
  expiresOn: '2026-10-28',
  expiresOnEstimated: false,
  thawedOn: null,
}

describe('cachedInventoryRepository（D-17）', () => {
  it('取得できたら端末に保存し、取得できないときは最後に保存した在庫と補完候補を返す', async () => {
    const inner = new FakeInventoryRepository(
      [milk],
      [{ name: '牛乳', category: 'dairy', location: 'fridge' }],
    )
    const store = memoryStore()
    const repo = cachedInventoryRepository(inner, store)
    await repo.list()
    await repo.catalog()

    inner.failList = true
    inner.catalog = async () => {
      throw new Error('offline')
    }
    expect(await repo.list()).toEqual([milk])
    expect(await repo.catalog()).toEqual([{ name: '牛乳', category: 'dairy', location: 'fridge' }])
  })

  it('端末がオフラインと分かっているときは、通信せずにすぐ保存した在庫を返す', async () => {
    // supabase-js は失敗すると再試行するので、通信を待つと表示まで数秒かかる
    const inner = new FakeInventoryRepository([milk])
    const store = memoryStore()
    let online = true
    const repo = cachedInventoryRepository(inner, store, () => online)
    await repo.list()

    online = false
    let called = false
    inner.list = async () => {
      called = true
      return []
    }
    expect(await repo.list()).toEqual([milk])
    expect(called).toBe(false)
  })

  it('保存したものがなければ、取得できないときはエラーのまま', async () => {
    const inner = new FakeInventoryRepository()
    inner.failList = true
    await expect(cachedInventoryRepository(inner, memoryStore()).list()).rejects.toThrow()
  })

  it('編集はそのまま元の保存先に渡す（オフラインでは失敗する）', async () => {
    const inner = new FakeInventoryRepository([milk])
    const repo = cachedInventoryRepository(inner, memoryStore())
    await repo.updateQuantity('1', 'low')
    expect(inner.items[0].quantity).toBe('low')
  })

  it('壊れた保存内容は無視する', async () => {
    const store = memoryStore()
    store.set('souschef:inventory', '{壊れた')
    const inner = new FakeInventoryRepository()
    inner.failList = true
    await expect(cachedInventoryRepository(inner, store).list()).rejects.toThrow()
  })
})

describe('cachedRecipesRepository（D-17）', () => {
  it('★保存したレシピも取得できないときは最後に保存したものを返す', async () => {
    const dish = SAMPLE_SUGGESTIONS[0].main
    const inner = new FakeRecipesRepository([dish])
    const store = memoryStore()
    const repo = cachedRecipesRepository(inner, store)
    await repo.savedDishes()

    inner.savedDishes = async () => {
      throw new Error('offline')
    }
    expect(await repo.savedDishes()).toEqual([dish])
  })
})
