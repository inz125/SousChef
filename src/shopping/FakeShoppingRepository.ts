import type { InventoryItem } from '../domain/inventory'
import { hasUnchecked, namesMatch, type ShoppingItem } from '../domain/shopping'
import type { FakeInventoryRepository } from '../inventory/FakeInventoryRepository'
import type { AddResult, ShoppingRepository } from './ShoppingRepository'

type Stored = ShoppingItem & { removedInventoryItemId: string | null }

/**
 * テスト用のインメモリ買い物リスト。inventory を渡すと、サーバのトリガー（D-73）と同じく
 * 常備食品の在庫を「少ない」・削除にしたら載せ、「元に戻す」でその品物を消す
 */
export class FakeShoppingRepository implements ShoppingRepository {
  items: Stored[] = []
  stockedNames: string[]
  failSave = false
  private clock = 0
  private readonly inventoryItems: () => InventoryItem[]
  private readonly listeners = new Set<() => void>()

  constructor({
    items = [],
    stocked = [],
    inventory,
  }: { items?: string[]; stocked?: string[]; inventory?: FakeInventoryRepository } = {}) {
    this.stockedNames = [...stocked]
    items.forEach((name) => this.insert(name, null))
    this.inventoryItems = () => inventory?.items ?? []
    inventory?.triggers.push(({ op, before, after, items: rest }) => {
      if (op === 'insert' && after) {
        this.items = this.items.filter((i) => i.checked || i.removedInventoryItemId !== after.id)
        return
      }
      const target = op === 'delete' ? before : after
      if (!target) return
      if (op === 'update' && !(after?.quantity === 'low' && before?.quantity !== 'low')) return
      for (const s of this.stockedNames) {
        if (!namesMatch(s, target.name)) continue
        if (
          rest.some((i) => i.id !== target.id && i.quantity === 'enough' && namesMatch(s, i.name))
        )
          continue
        if (!hasUnchecked(this.items, s)) this.insert(s, op === 'delete' ? target.id : null)
      }
      this.emit()
    })
  }

  async list(): Promise<ShoppingItem[]> {
    return this.items.map((i) => ({
      id: i.id,
      name: i.name,
      checked: i.checked,
      createdAt: i.createdAt,
    }))
  }

  async add(names: string[]): Promise<AddResult> {
    this.check()
    const result: AddResult = { added: [], existing: [] }
    for (const name of names) {
      if (hasUnchecked(this.items, name)) result.existing.push(name)
      else {
        this.insert(name, null)
        result.added.push(name)
      }
    }
    this.emit()
    return result
  }

  async setChecked(id: string, checked: boolean) {
    this.check()
    const item = this.items.find((i) => i.id === id)!
    if (!checked && hasUnchecked(this.items, item.name)) {
      this.items = this.items.filter((i) => i.id !== id)
    } else {
      this.items = this.items.map((i) => (i.id === id ? { ...i, checked } : i))
    }
    this.emit()
  }

  async remove(id: string) {
    this.check()
    this.items = this.items.filter((i) => i.id !== id)
    this.emit()
  }

  async clearChecked() {
    this.check()
    this.items = this.items.filter((i) => !i.checked)
    this.emit()
  }

  async stocked() {
    return [...this.stockedNames]
  }

  async addStocked(name: string) {
    this.check()
    if (this.stockedNames.includes(name)) throw new Error('duplicate')
    this.stockedNames.push(name)
    const inStock = this.inventoryItems().some(
      (i) => i.quantity === 'enough' && namesMatch(name, i.name),
    )
    if (!inStock && !hasUnchecked(this.items, name)) this.insert(name, null)
    this.emit()
  }

  async removeStocked(name: string) {
    this.check()
    this.stockedNames = this.stockedNames.filter((n) => n !== name)
    this.emit()
  }

  async subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  /** もう一人の操作をまねる: データを変えてから変更を流す */
  remoteChange(change: (repo: this) => void) {
    change(this)
    this.emit()
  }

  /** 名前で品物を探す（テストの確かめ用） */
  names({ checked }: { checked?: boolean } = {}) {
    return this.items
      .filter((i) => checked === undefined || i.checked === checked)
      .map((i) => i.name)
  }

  insert(name: string, removedInventoryItemId: string | null) {
    this.clock++
    this.items.push({
      id: crypto.randomUUID(),
      name,
      checked: false,
      createdAt: new Date(Date.UTC(2026, 10, 20, 0, 0, this.clock)).toISOString(),
      removedInventoryItemId,
    })
  }

  private check() {
    if (this.failSave) throw new Error('network error')
  }

  private emit() {
    this.listeners.forEach((l) => l())
  }
}
