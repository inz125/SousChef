import { useId, useState, type FormEvent } from 'react'
import { estimateExpiresOn } from '../domain/expiry'
import {
  CATEGORIES,
  LOCATIONS,
  type Category,
  type IsoDate,
  type StorageLocation,
} from '../domain/food'
import {
  expiryAfterEdit,
  QUANTITIES,
  type InventoryItem,
  type NewInventoryItem,
  type Quantity,
} from '../domain/inventory'
import type { CatalogEntry } from './InventoryRepository'

type Props = { catalog: CatalogEntry[]; today: IsoDate; onCancel: () => void } & (
  | {
      mode: 'add'
      initialLocation: StorageLocation
      onSubmit: (item: NewInventoryItem) => void
    }
  | {
      mode: 'edit'
      original: InventoryItem
      onSubmit: (item: InventoryItem) => void
      onRemove: () => void
    }
)

/** 食材の追加（D-27）と詳細編集（D-29） */
export function ItemForm(props: Props) {
  const { catalog, today, onCancel } = props
  const original = props.mode === 'edit' ? props.original : null
  const listId = useId()
  const [name, setName] = useState(original?.name ?? '')
  const [category, setCategory] = useState<Category | ''>(original?.category ?? '')
  const [location, setLocation] = useState<StorageLocation>(
    original?.location ?? (props.mode === 'add' ? props.initialLocation : 'fridge'),
  )
  const [quantity, setQuantity] = useState<Quantity>(original?.quantity ?? 'enough')
  // null の間は自動の期限（目安）を使い、手で入力したらその値を使う（D-11）
  const [manualExpiry, setManualExpiry] = useState<IsoDate | null>(null)

  const trimmed = name.trim()
  const auto = autoExpiry()
  const expiresOn = manualExpiry ?? auto.expiresOn ?? ''
  const expiresOnEstimated = manualExpiry === null && auto.expiresOnEstimated

  function autoExpiry(): Pick<InventoryItem, 'expiresOn' | 'expiresOnEstimated'> {
    if (original) {
      return expiryAfterEdit(
        original,
        { name: trimmed, category: category || original.category, location },
        today,
      )
    }
    if (!trimmed || !category) return { expiresOn: null, expiresOnEstimated: false }
    return {
      expiresOn: estimateExpiresOn({ name: trimmed, category, location }, today),
      expiresOnEstimated: true,
    }
  }

  function changeName(value: string) {
    setName(value)
    if (original) return
    const known = catalog.find((e) => e.name === value.trim())
    if (known) {
      setCategory(known.category)
      setLocation(known.location)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!trimmed || !category) return
    const item: NewInventoryItem = {
      name: trimmed,
      category,
      location,
      quantity,
      expiresOn: expiresOn || null,
      expiresOnEstimated: expiresOn !== '' && expiresOnEstimated,
    }
    if (props.mode === 'edit') props.onSubmit({ ...item, id: props.original.id })
    else props.onSubmit(item)
  }

  return (
    <form
      className="sheet"
      onSubmit={submit}
      aria-label={props.mode === 'add' ? '食材を追加' : '食材を編集'}
    >
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
      {props.mode === 'edit' && (
        <label>
          量
          <select value={quantity} onChange={(e) => setQuantity(e.target.value as Quantity)}>
            {Object.entries(QUANTITIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        期限
        <input type="date" value={expiresOn} onChange={(e) => setManualExpiry(e.target.value)} />
      </label>
      {expiresOnEstimated && expiresOn && (
        <p className="hint">食材と保存場所から推定した目安です。変更できます</p>
      )}
      <div className="sheet-actions">
        <button type="button" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit">{props.mode === 'add' ? '追加する' : '保存する'}</button>
      </div>
      {props.mode === 'edit' && (
        <button type="button" className="danger" onClick={props.onRemove}>
          削除する
        </button>
      )}
    </form>
  )
}
