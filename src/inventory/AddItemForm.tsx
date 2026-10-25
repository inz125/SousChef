import { useId, useState, type FormEvent } from 'react'
import { estimateExpiresOn } from '../domain/expiry'
import {
  CATEGORIES,
  LOCATIONS,
  type Category,
  type IsoDate,
  type StorageLocation,
} from '../domain/food'
import type { NewInventoryItem } from '../domain/inventory'
import type { CatalogEntry } from './InventoryRepository'

type Props = {
  catalog: CatalogEntry[]
  today: IsoDate
  initialLocation: StorageLocation
  onSubmit: (item: NewInventoryItem) => void
  onCancel: () => void
}

export function AddItemForm({ catalog, today, initialLocation, onSubmit, onCancel }: Props) {
  const listId = useId()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category | ''>('')
  const [location, setLocation] = useState<StorageLocation>(initialLocation)
  // null の間は目安期限を表示し、手で入力したらその値を使う（D-11）
  const [manualExpiry, setManualExpiry] = useState<IsoDate | null>(null)

  const trimmed = name.trim()
  const estimated =
    trimmed && category ? estimateExpiresOn({ name: trimmed, category, location }, today) : ''
  const expiresOn = manualExpiry ?? estimated

  function changeName(value: string) {
    setName(value)
    const known = catalog.find((e) => e.name === value.trim())
    if (known) {
      setCategory(known.category)
      setLocation(known.location)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!trimmed || !category) return
    onSubmit({
      name: trimmed,
      category,
      location,
      quantity: 'enough',
      expiresOn: expiresOn || null,
      expiresOnEstimated: manualExpiry === null && expiresOn !== '',
    })
  }

  return (
    <form className="sheet" onSubmit={submit} aria-label="食材を追加">
      <label>
        食材名
        <input list={listId} required value={name} onChange={(e) => changeName(e.target.value)} />
        <datalist id={listId}>
          {catalog.map((e) => (
            <option key={e.name} value={e.name} />
          ))}
        </datalist>
      </label>
      <label>
        カテゴリ
        <select required value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          <option value="" disabled>
            選択してください
          </option>
          {Object.entries(CATEGORIES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        保存場所
        <select value={location} onChange={(e) => setLocation(e.target.value as StorageLocation)}>
          {Object.entries(LOCATIONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        期限
        <input type="date" value={expiresOn} onChange={(e) => setManualExpiry(e.target.value)} />
      </label>
      {manualExpiry === null && estimated && (
        <p className="hint">食材と保存場所から推定した目安です。変更できます</p>
      )}
      <div className="sheet-actions">
        <button type="button" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit">追加する</button>
      </div>
    </form>
  )
}
