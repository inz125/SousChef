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
  QUICK_EXPIRIES,
  quickExpiry,
  type QuickExpiry,
  thawedOnAfterEdit,
  type InventoryItem,
  type NewInventoryItem,
  type Quantity,
} from '../domain/inventory'
import { canThaw, initialLocation } from '../domain/thaw'
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
      /** 冷凍の肉を解凍する（D-47）。オフラインでは渡さない */
      onThaw?: () => void
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
      setLocation(initialLocation(known.category, known.location))
    }
  }

  function changeCategory(value: Category) {
    setCategory(value)
    // 新しく登録する肉は冷凍が初期値（D-46）
    if (!original) setLocation((current) => initialLocation(value, current))
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
      thawedOn: original
        ? thawedOnAfterEdit(original, { name: trimmed, category, location })
        : null,
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
        <select
          required
          value={category}
          onChange={(e) => changeCategory(e.target.value as Category)}
        >
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
      {/* 保存場所・量は 1 回のタップで選べる横並びのボタン（D-79） */}
      <Segmented
        label="保存場所"
        options={LOCATIONS}
        value={location}
        onChange={(v) => setLocation(v as StorageLocation)}
      />
      {props.mode === 'edit' && (
        <Segmented
          label="量"
          options={QUANTITIES}
          value={quantity}
          onChange={(v) => setQuantity(v as Quantity)}
        />
      )}
      <label>
        期限
        <input type="date" value={expiresOn} onChange={(e) => setManualExpiry(e.target.value)} />
      </label>
      {/* 今日から数えた期限を入れる。手入力と同じ扱い（目安ではない。D-79） */}
      <div className="quick-expiry">
        {Object.entries(QUICK_EXPIRIES).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            onClick={() => setManualExpiry(quickExpiry(today, kind as QuickExpiry))}
          >
            {label}
          </button>
        ))}
      </div>
      {expiresOnEstimated && expiresOn && (
        <p className="hint">食材と保存場所から推定した目安です。変更できます</p>
      )}
      <div className="sheet-actions">
        <button type="button" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit">{props.mode === 'add' ? '追加する' : '保存する'}</button>
      </div>
      {props.mode === 'edit' && props.onThaw && canThaw(props.original) && (
        <button type="button" className="secondary" onClick={props.onThaw}>
          解凍
        </button>
      )}
      {props.mode === 'edit' && (
        <button type="button" className="danger" onClick={props.onRemove}>
          削除する
        </button>
      )}
    </form>
  )
}

/** 横並びのボタンで 1 つを選ぶ（在庫の切替と同じ見た目。D-79） */
function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Record<string, string>
  value: string
  onChange: (value: string) => void
}) {
  const name = useId()
  return (
    <div className="field">
      <span className="field-label" aria-hidden="true">
        {label}
      </span>
      <div role="radiogroup" aria-label={label} className="segmented">
        {Object.entries(options).map(([v, text]) => (
          <label key={v}>
            <input
              type="radio"
              name={name}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
            />
            <span>{text}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
