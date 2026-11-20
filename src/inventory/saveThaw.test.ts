import type { InventoryItem } from '../domain/inventory'
import { FakeShoppingRepository } from '../shopping/FakeShoppingRepository'
import { FakeInventoryRepository } from './FakeInventoryRepository'
import { saveThaw } from './saveThaw'

const frozen: InventoryItem = {
  id: 'f1',
  name: '鶏もも肉',
  category: 'meat',
  location: 'freezer',
  quantity: 'enough',
  expiresOn: null,
  expiresOnEstimated: false,
  thawedOn: null,
}

describe('saveThaw', () => {
  it('一部を解凍して冷凍を「少ない」にしても、常備食品は買い物リストに載らない（冷蔵に「ある」ができる。D-73）', async () => {
    const repo = new FakeInventoryRepository([frozen])
    const shopping = new FakeShoppingRepository({ stocked: ['鶏もも肉'], inventory: repo })
    await saveThaw(repo, frozen, { kind: 'part', remaining: 'low' }, '2026-11-20')
    expect(repo.items.map((i) => [i.location, i.quantity])).toEqual([
      ['freezer', 'low'],
      ['fridge', 'enough'],
    ])
    expect(shopping.names()).toEqual([])
  })
})
