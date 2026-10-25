import type { InventoryItem } from '../domain/inventory'
import type { CatalogEntry, InventoryEvent, InventoryRepository } from './InventoryRepository'

const ME = { actorEmail: 'me@example.com', actorName: 'わたし' }

/** テスト用のインメモリ在庫。Supabase と同様、自分の操作でも変更イベントを流す */
export class FakeInventoryRepository implements InventoryRepository {
  items: InventoryItem[]
  entries: CatalogEntry[]
  failList = false
  private readonly listeners = new Set<(e: InventoryEvent) => void>()

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
    this.remember(added)
    this.emit({ action: 'added', itemName: added.name, ...ME })
    return added
  }

  async update(item: InventoryItem) {
    this.items = this.items.map((i) => (i.id === item.id ? item : i))
    this.remember(item)
    this.emit({ action: 'updated', itemName: item.name, ...ME })
  }

  async updateQuantity(id: string, quantity: InventoryItem['quantity']) {
    const item = this.items.find((i) => i.id === id)!
    await this.update({ ...item, quantity })
  }

  async remove(id: string) {
    const item = this.items.find((i) => i.id === id)!
    this.items = this.items.filter((i) => i.id !== id)
    this.emit({ action: 'removed', itemName: item.name, ...ME })
  }

  async restore(item: InventoryItem) {
    this.items.push(item)
    this.emit({ action: 'added', itemName: item.name, ...ME })
  }

  async catalog() {
    return [...this.entries]
  }

  async subscribe(listener: (e: InventoryEvent) => void) {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  get subscriberCount() {
    return this.listeners.size
  }

  /** もう一人の操作をまねる: データを変えてからイベントを流す */
  remoteChange(change: (items: InventoryItem[]) => InventoryItem[], event: InventoryEvent) {
    this.items = change(this.items)
    this.emit(event)
  }

  private remember({ name, category, location }: InventoryItem) {
    this.entries = [...this.entries.filter((e) => e.name !== name), { name, category, location }]
  }

  private emit(event: InventoryEvent) {
    this.listeners.forEach((l) => l(event))
  }
}
