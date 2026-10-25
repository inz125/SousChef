import type { InventoryItem } from '../domain/inventory'
import type { CatalogEntry, InventoryRepository } from './InventoryRepository'

/** テスト用のインメモリ在庫 */
export class FakeInventoryRepository implements InventoryRepository {
  items: InventoryItem[]
  entries: CatalogEntry[]
  failList = false

  constructor(items: InventoryItem[] = [], entries: CatalogEntry[] = []) {
    this.items = [...items]
    this.entries = [...entries]
  }

  async list() {
    if (this.failList) throw new Error('network error')
    return [...this.items]
  }

  async add(item: Omit<InventoryItem, 'id'>) {
    const added = { id: crypto.randomUUID(), ...item }
    this.items.push(added)
    this.entries = [
      ...this.entries.filter((e) => e.name !== item.name),
      { name: item.name, category: item.category, location: item.location },
    ]
    return added
  }

  async updateQuantity(id: string, quantity: InventoryItem['quantity']) {
    this.items = this.items.map((i) => (i.id === id ? { ...i, quantity } : i))
  }

  async remove(id: string) {
    this.items = this.items.filter((i) => i.id !== id)
  }

  async restore(item: InventoryItem) {
    this.items.push(item)
  }

  async catalog() {
    return [...this.entries]
  }
}
