import { useState, type ReactNode } from 'react'
import type { InventoryItem } from '../domain/inventory'
import { frozenMeatFor, frozenMeatsOf, type ThawChoice } from '../domain/thaw'
import { ThawSheet } from '../inventory/ThawSheet'
import { useOnline } from '../lib/useOnline'
import type { OutlineDish } from '../../supabase/functions/_shared/meals.ts'
import type { Dish } from './RecipesRepository'

const SOURCE_LABEL = { stock: '在庫', staple: '常備', buy: '買い足し' } as const

/** 料理を頼み方に合わせて直す操作（D-64）。献立の提案結果のレシピだけで渡す */
export type DishRevise = {
  /** 直している途中か */
  busy: boolean
  /** 修正した料理か。「元に戻す」を出す */
  revised: boolean
  /** 失敗したら利用者に見せる理由つきで reject する */
  onRevise: (instruction: string) => Promise<void>
  onUndo: () => void
}

type Props = {
  title: string
  /**
   * microwave: 「レンジ」の印を付けるか（D-50）。
   * レシピがまだの料理（D-63）は料理名と材料名だけを出し、★保存できない。
   * revise を渡した料理は修正できる（D-64）
   */
  dishes: { label?: string; dish: Dish | OutlineDish; microwave?: boolean; revise?: DishRevise }[]
  tip?: string
  /** レシピを作っている・作れなかったときの表示（D-63） */
  status?: ReactNode
  savedNames: Set<string>
  /** microwave: 「レンジで作る料理」として保存するか（D-50）。印が付いているかをそのまま渡す */
  onToggleSave: (dish: Dish, microwave: boolean) => void
  onClose: () => void
  /** 今の在庫。冷凍の肉を使う材料に印を付ける（D-49） */
  stock: InventoryItem[]
  onThaw: (item: InventoryItem, choice: ThawChoice) => Promise<void>
  /** 「作った」などの操作 */
  children?: ReactNode
}

/**
 * レシピの表示（D-35）。料理ごとに★で保存できる（D-36）。冷凍の肉を使うなら解凍を勧める（D-49）。
 * レンジで作る料理には「レンジ」の印を付ける（D-50）
 */
export function RecipeDialog({
  title,
  dishes,
  tip,
  status,
  savedNames,
  onToggleSave,
  onClose,
  stock,
  onThaw,
  children,
}: Props) {
  const online = useOnline()
  const [thawing, setThawing] = useState<InventoryItem | null>(null)
  const frozen = frozenMeatsOf(
    dishes.flatMap((d) => d.dish.ingredients),
    stock,
  )
  const isFrozen = (ingredient: string) => frozenMeatFor(ingredient, stock) !== undefined

  return (
    <>
      <div role="dialog" aria-modal="true" aria-label={title} className="sheet recipe">
        {/* 長いレシピでもすぐ閉じられるよう、上に固定する */}
        <button type="button" className="close" onClick={onClose}>
          閉じる
        </button>
        {frozen.length > 0 && (
          <section aria-label="解凍の案内" className="card thaw-notice">
            {frozen.map((item) => (
              <p key={item.id}>
                冷凍の {item.name} を使います。明日作るなら今のうちに冷蔵へ移しましょう
                {online && (
                  <button
                    type="button"
                    aria-label={`${item.name}を解凍`}
                    onClick={() => setThawing(item)}
                  >
                    解凍
                  </button>
                )}
              </p>
            ))}
          </section>
        )}
        {status}
        {tip && <p className="tip">段取り: {tip}</p>}
        {dishes.map(({ label, dish, microwave = false, revise }) => (
          <DishRecipe
            key={dish.name}
            label={label}
            dish={dish}
            microwave={microwave}
            revise={revise}
            online={online}
            saved={savedNames.has(dish.name)}
            onToggleSave={(full) => onToggleSave(full, microwave)}
            isFrozen={isFrozen}
          />
        ))}
        {children}
      </div>
      {thawing && (
        <ThawSheet
          key={thawing.id}
          item={thawing}
          onSubmit={(choice) => onThaw(thawing, choice).then(() => setThawing(null))}
          onCancel={() => setThawing(null)}
        />
      )}
    </>
  )
}

function DishRecipe({
  label,
  dish,
  microwave,
  revise,
  online,
  saved,
  onToggleSave,
  isFrozen,
}: {
  label?: string
  dish: Dish | OutlineDish
  microwave: boolean
  revise?: DishRevise
  online: boolean
  saved: boolean
  onToggleSave: (dish: Dish) => void
  isFrozen: (ingredient: string) => boolean
}) {
  // レシピがまだなら分量・手順・時間はない（D-63）
  const full = 'steps' in dish ? dish : null
  // 修正できる料理か（D-64）。「修正」は料理名の行に、入力欄はそのすぐ下に出す（D-65）
  const canRevise = full !== null && revise !== undefined
  const [editing, setEditing] = useState(false)
  return (
    <section aria-label={label ? `${label} ${dish.name}` : dish.name}>
      <h2>
        <span className="dish-name">
          {label && <small>{label}</small>} {dish.name}
          {microwave && <MicrowaveBadge />}
        </span>
        {full && <span className="minutes">{full.minutes} 分</span>}
        {canRevise && online && (
          <button
            type="button"
            className="revise-button"
            aria-label={`${dish.name}を修正`}
            disabled={editing || revise.busy}
            onClick={() => setEditing(true)}
          >
            <PencilIcon />
            修正
          </button>
        )}
        <button
          type="button"
          className="star"
          aria-label={`${dish.name}を保存`}
          aria-pressed={saved}
          disabled={!full || revise?.busy}
          onClick={() => full && onToggleSave(full)}
        >
          {saved ? '★' : '☆'}
        </button>
      </h2>
      {canRevise && (
        <RevisePanel
          name={dish.name}
          revise={revise}
          online={online}
          editing={editing}
          onClose={() => setEditing(false)}
        />
      )}
      <ul className="ingredients">
        {dish.ingredients.map((i) => (
          <li key={i.name}>
            <span>{i.name}</span>
            {'amount' in i && <span>{i.amount}</span>}
            <span className="source" data-source={i.source}>
              {SOURCE_LABEL[i.source]}
            </span>
            {i.source === 'stock' && isFrozen(i.name) && (
              <span className="frozen-badge">冷凍・要解凍</span>
            )}
          </li>
        ))}
      </ul>
      {full && (
        <ol aria-label="手順">
          {full.steps.map((step, n) => (
            <li key={n}>{step}</li>
          ))}
        </ol>
      )}
    </section>
  )
}

/**
 * 料理名のすぐ下に出す、頼み方の入力欄・直している途中・失敗の理由と、
 * 修正した料理の「修正しました」「元に戻す」（D-64, D-65）
 */
function RevisePanel({
  name,
  revise,
  online,
  editing,
  onClose,
}: {
  name: string
  revise: DishRevise
  online: boolean
  editing: boolean
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    try {
      await revise.onRevise(text.trim())
      onClose()
      setText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '修正できませんでした。もう一度お試しください')
    }
  }

  if (!editing && !revise.busy && !revise.revised) return null
  return (
    <div className="revise">
      {revise.busy && <p className="recipe-status">修正しています…</p>}
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label>
            どう直しますか？
            <textarea
              rows={2}
              maxLength={200}
              placeholder="例: じゃがいもを1個にして全体を調整して"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="revise-actions">
            <button
              type="button"
              onClick={() => {
                onClose()
                setError(null)
              }}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="primary"
              disabled={!text.trim() || revise.busy || !online}
            >
              修正する
            </button>
          </div>
        </form>
      ) : (
        revise.revised && (
          <p className="revised-note">
            修正しました
            <button
              type="button"
              aria-label={`${name}を元に戻す`}
              disabled={revise.busy}
              onClick={revise.onUndo}
            >
              元に戻す
            </button>
          </p>
        )
      )}
    </div>
  )
}

/** 「修正」ボタンの鉛筆のアイコン（D-65）。飾りなので読み上げない */
function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15.5 4.5l4 4L8 20H4v-4Z" />
      <path d="M13 7l4 4" />
    </svg>
  )
}

/** 「レンジで作る」の印（D-50） */
export function MicrowaveBadge() {
  return <span className="microwave-badge">レンジ</span>
}
