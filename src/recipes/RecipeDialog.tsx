import { useState, type ReactNode } from 'react'
import type { InventoryItem } from '../domain/inventory'
import { frozenMeatFor, frozenMeatsOf, type ThawChoice } from '../domain/thaw'
import { ThawSheet } from '../inventory/ThawSheet'
import { useOnline } from '../lib/useOnline'
import type { OutlineDish } from '../../supabase/functions/_shared/meals.ts'
import type { Dish } from './RecipesRepository'

const SOURCE_LABEL = { stock: '在庫', staple: '常備', buy: '買い足し' } as const

type Props = {
  title: string
  /**
   * microwave: 「レンジ」の印を付けるか（D-50）。
   * レシピがまだの料理（D-63）は料理名と材料名だけを出し、★保存できない
   */
  dishes: { label?: string; dish: Dish | OutlineDish; microwave?: boolean }[]
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
        {dishes.map(({ label, dish, microwave = false }) => (
          <DishRecipe
            key={dish.name}
            label={label}
            dish={dish}
            microwave={microwave}
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
  saved,
  onToggleSave,
  isFrozen,
}: {
  label?: string
  dish: Dish | OutlineDish
  microwave: boolean
  saved: boolean
  onToggleSave: (dish: Dish) => void
  isFrozen: (ingredient: string) => boolean
}) {
  // レシピがまだなら分量・手順・時間はない（D-63）
  const full = 'steps' in dish ? dish : null
  return (
    <section aria-label={label ? `${label} ${dish.name}` : dish.name}>
      <h2>
        {label && <small>{label}</small>} {dish.name}
        {microwave && <MicrowaveBadge />}
        {full && <span className="minutes">{full.minutes} 分</span>}
        <button
          type="button"
          className="star"
          aria-label={`${dish.name}を保存`}
          aria-pressed={saved}
          disabled={!full}
          onClick={() => full && onToggleSave(full)}
        >
          {saved ? '★' : '☆'}
        </button>
      </h2>
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

/** 「レンジで作る」の印（D-50） */
export function MicrowaveBadge() {
  return <span className="microwave-badge">レンジ</span>
}
