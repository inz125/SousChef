import { useState } from 'react'
import {
  CATEGORIES,
  LOCATIONS,
  type Category,
  type IsoDate,
  type StorageLocation,
} from '../domain/food'
import type { InventoryItem } from '../domain/inventory'
import {
  receiptChanges,
  receiptDrafts,
  renameDraft,
  stockOf,
  type ReceiptDraft,
  type ReceiptItem,
} from '../domain/receipt'
import type { CatalogEntry } from '../inventory/InventoryRepository'

type Props = {
  items: ReceiptItem[]
  catalog: CatalogEntry[]
  inventory: InventoryItem[]
  today: IsoDate
  /** 登録する。失敗したら例外を投げる */
  onSubmit: (changes: ReturnType<typeof receiptChanges>) => Promise<void>
  onCancel: () => void
}

/** レシートから読み取った食材の確認（D-42）。直してから一括で登録する */
export function ReceiptSheet({ items, catalog, inventory, today, onSubmit, onCancel }: Props) {
  const [drafts, setDrafts] = useState<ReceiptDraft[]>(() => receiptDrafts(items, catalog))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const change = (key: number, edit: (d: ReceiptDraft) => ReceiptDraft) =>
    setDrafts((list) => list.map((d) => (d.key === key ? edit(d) : d)))

  const checked = drafts.filter((d) => d.checked)
  const canSubmit = checked.length > 0 && checked.every((d) => d.name.trim() !== '')

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await onSubmit(receiptChanges(drafts, inventory, today))
    } catch {
      setError('登録できませんでした。通信状況を確認してください')
      setBusy(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="レシートの食材" className="sheet cooked">
      <h2>レシートの食材</h2>
      {drafts.map((d) => {
        // 行の名前は読み取った名前のまま（入力中に変わらない）
        const label = items[d.key].name
        return (
          <fieldset key={d.key} role="group" aria-label={label} className="receipt-row">
            <label className="receipt-check">
              <input
                type="checkbox"
                aria-label={`${label}を登録する`}
                checked={d.checked}
                onChange={(e) => change(d.key, (x) => ({ ...x, checked: e.target.checked }))}
              />
              <input
                aria-label="名前"
                value={d.name}
                onChange={(e) => change(d.key, (x) => renameDraft(x, e.target.value, catalog))}
              />
            </label>
            <div className="receipt-selects">
              <label>
                カテゴリ
                <select
                  value={d.category}
                  onChange={(e) =>
                    change(d.key, (x) => ({ ...x, category: e.target.value as Category }))
                  }
                >
                  {Object.entries(CATEGORIES).map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                保存場所
                <select
                  value={d.location}
                  onChange={(e) =>
                    change(d.key, (x) => ({ ...x, location: e.target.value as StorageLocation }))
                  }
                >
                  {Object.entries(LOCATIONS).map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {stockOf(d.name, inventory) && <p className="hint">在庫あり（「ある」に戻します）</p>}
          </fieldset>
        )
      })}
      {error && <p role="alert">{error}</p>}
      <div className="sheet-actions">
        <button type="button" onClick={onCancel}>
          キャンセル
        </button>
        <button type="button" className="primary" disabled={!canSubmit || busy} onClick={submit}>
          登録する（{checked.length} 件）
        </button>
      </div>
    </div>
  )
}
