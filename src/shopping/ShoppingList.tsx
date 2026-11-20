import { useId, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { swipeAxis } from '../domain/swipe'
import { orderShopping, type ShoppingItem } from '../domain/shopping'

/** 左スワイプでこれ以上動かすと「削除」を出したままにする */
const REVEAL_PX = 40

type Props = {
  items: ShoppingItem[]
  online: boolean
  onToggle: (item: ShoppingItem) => void
  onRemove: (item: ShoppingItem) => void
  onClearChecked: () => void
}

/** 買い物リスト（D-72）。在庫タブの場所の切替の「買い物」に出す */
export function ShoppingList({ items, online, onToggle, onRemove, onClearChecked }: Props) {
  const ordered = orderShopping(items)
  const [revealed, setRevealed] = useState<string | null>(null)
  return (
    <div className="shopping">
      {ordered.length === 0 && <p className="empty">買うものはありません</p>}
      <ul aria-label="買い物リスト" className="shopping-list">
        {ordered.map((item) => (
          <ShoppingRow
            key={item.id}
            item={item}
            online={online}
            revealed={revealed === item.id}
            onReveal={(open) => setRevealed(open ? item.id : null)}
            onToggle={() => onToggle(item)}
            onRemove={() => onRemove(item)}
          />
        ))}
      </ul>
      {online && items.some((i) => i.checked) && (
        <button type="button" className="secondary clear-checked" onClick={onClearChecked}>
          チェック済みを消す
        </button>
      )}
    </div>
  )
}

function ShoppingRow({
  item,
  online,
  revealed,
  onReveal,
  onToggle,
  onRemove,
}: {
  item: ShoppingItem
  online: boolean
  revealed: boolean
  onReveal: (open: boolean) => void
  onToggle: () => void
  onRemove: () => void
}) {
  // 左スワイプで「削除」を出す（チェックしていない品物だけ）。在庫の区分の横スワイプ（D-66）には渡さない
  const start = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null)
  const swiped = useRef(false)
  const swipeable = online && !item.checked

  function down(e: PointerEvent) {
    swiped.current = false
    start.current = swipeable ? { x: e.clientX, y: e.clientY, axis: null } : null
  }

  function move(e: PointerEvent) {
    const s = start.current
    if (!s) return
    const dx = e.clientX - s.x
    s.axis ??= swipeAxis(dx, e.clientY - s.y)
    if (s.axis !== 'x') return
    // 右へのスワイプ（「削除」を閉じる、在庫の区分へ戻る）は外に渡す
    if (dx > 0 && !revealed) {
      start.current = null
      return
    }
    e.stopPropagation()
    swiped.current = true
  }

  function up(e: PointerEvent) {
    const s = start.current
    start.current = null
    if (!s || s.axis !== 'x') return
    e.stopPropagation()
    onReveal(e.clientX - s.x < -REVEAL_PX)
  }

  return (
    <li
      aria-label={item.name}
      data-checked={item.checked || undefined}
      data-revealed={revealed || undefined}
      className="shopping-item"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onClickCapture={(e) => {
        if (!swiped.current) return
        swiped.current = false
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <label>
        <input
          type="checkbox"
          checked={item.checked}
          disabled={!online}
          onChange={() => {
            onReveal(false)
            onToggle()
          }}
        />
        <span>{item.name}</span>
      </label>
      {revealed && swipeable && (
        <button
          type="button"
          className="danger"
          aria-label={`${item.name}を削除`}
          onClick={onRemove}
        >
          削除
        </button>
      )}
    </li>
  )
}

/** 買い物リストに名前を入れる画面（D-74）。過去の登録から補完する */
export function ShoppingAddForm({
  catalog,
  onSubmit,
  onCancel,
}: {
  catalog: string[]
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const listId = useId()
  const [name, setName] = useState('')
  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onSubmit(trimmed)
  }
  return (
    <form className="sheet" aria-label="買い物リストに追加" onSubmit={submit}>
      <label>
        名前
        <input
          list={listId}
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <datalist id={listId}>
          {catalog.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </label>
      <div className="sheet-actions">
        <button type="button" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit">追加</button>
      </div>
    </form>
  )
}
