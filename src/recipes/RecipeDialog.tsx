import { useState, type ReactNode } from 'react'
import type { InventoryItem } from '../domain/inventory'
import { frozenMeatFor, frozenMeatsOf, type ThawChoice } from '../domain/thaw'
import { ThawSheet } from '../inventory/ThawSheet'
import { useOnline } from '../lib/useOnline'
import type { Dish } from './RecipesRepository'

const SOURCE_LABEL = { stock: '在庫', staple: '常備', buy: '買い足し' } as const

type Props = {
  title: string
  dishes: { label?: string; dish: Dish }[]
  tip?: string
  savedNames: Set<string>
  onToggleSave: (dish: Dish) => void
  onClose: () => void
  /** 今の在庫。冷凍の肉を使う材料に印を付ける（D-49） */
  stock: InventoryItem[]
  onThaw: (item: InventoryItem, choice: ThawChoice) => Promise<void>
  /** 「作った」などの操作 */
  children?: ReactNode
}

/** レシピの表示（D-35）。料理ごとに★で保存できる（D-36）。冷凍の肉を使うなら解凍を勧める（D-49） */
export function RecipeDialog({
  title,
  dishes,
  tip,
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
        {tip && <p className="tip">段取り: {tip}</p>}
        {dishes.map(({ label, dish }) => (
          <DishRecipe
            key={dish.name}
            label={label}
            dish={dish}
            saved={savedNames.has(dish.name)}
            onToggleSave={() => onToggleSave(dish)}
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
  saved,
  onToggleSave,
  isFrozen,
}: {
  label?: string
  dish: Dish
  saved: boolean
  onToggleSave: () => void
  isFrozen: (ingredient: string) => boolean
}) {
  return (
    <section aria-label={label ? `${label} ${dish.name}` : dish.name}>
      <h2>
        {label && <small>{label}</small>} {dish.name}
        <span className="minutes">{dish.minutes} 分</span>
        <button
          type="button"
          className="star"
          aria-label={`${dish.name}を保存`}
          aria-pressed={saved}
          onClick={onToggleSave}
        >
          {saved ? '★' : '☆'}
        </button>
      </h2>
      <ul className="ingredients">
        {dish.ingredients.map((i) => (
          <li key={i.name}>
            <span>{i.name}</span>
            <span>{i.amount}</span>
            <span className="source" data-source={i.source}>
              {SOURCE_LABEL[i.source]}
            </span>
            {i.source === 'stock' && isFrozen(i.name) && (
              <span className="frozen-badge">冷凍・要解凍</span>
            )}
          </li>
        ))}
      </ul>
      <ol aria-label="手順">
        {dish.steps.map((step, n) => (
          <li key={n}>{step}</li>
        ))}
      </ol>
    </section>
  )
}
