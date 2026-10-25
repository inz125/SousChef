import type { ReactNode } from 'react'
import type { Dish } from './RecipesRepository'

const SOURCE_LABEL = { stock: '在庫', staple: '常備', buy: '買い足し' } as const

type Props = {
  title: string
  dishes: { label?: string; dish: Dish }[]
  tip?: string
  savedNames: Set<string>
  onToggleSave: (dish: Dish) => void
  onClose: () => void
  /** 「作った」などの操作 */
  children?: ReactNode
}

/** レシピの表示（D-35）。料理ごとに★で保存できる（D-36） */
export function RecipeDialog({
  title,
  dishes,
  tip,
  savedNames,
  onToggleSave,
  onClose,
  children,
}: Props) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="sheet recipe">
      {/* 長いレシピでもすぐ閉じられるよう、上に固定する */}
      <button type="button" className="close" onClick={onClose}>
        閉じる
      </button>
      {tip && <p className="tip">段取り: {tip}</p>}
      {dishes.map(({ label, dish }) => (
        <DishRecipe
          key={dish.name}
          label={label}
          dish={dish}
          saved={savedNames.has(dish.name)}
          onToggleSave={() => onToggleSave(dish)}
        />
      ))}
      {children}
    </div>
  )
}

function DishRecipe({
  label,
  dish,
  saved,
  onToggleSave,
}: {
  label?: string
  dish: Dish
  saved: boolean
  onToggleSave: () => void
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
