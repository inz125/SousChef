import { useState } from 'react'
import { RecipeDialog } from './RecipeDialog'
import type { Dish, RecipesRepository } from './RecipesRepository'
import { useSavedDishes } from './useSavedDishes'

type Props = { repo: RecipesRepository }

/** レシピタブ（D-39）。★保存した料理の一覧 */
export function RecipesScreen({ repo }: Props) {
  const { saved, savedNames, toggle } = useSavedDishes(repo)
  const [opened, setOpened] = useState<Dish | null>(null)
  const visible = saved ?? []

  return (
    <section className="recipes">
      <h2>保存した料理</h2>
      {saved && visible.length === 0 && (
        <p className="empty">献立のレシピで★を押すと、ここに保存されます</p>
      )}
      <ul aria-label="保存した料理" className="card list">
        {visible.map((dish) => (
          <li key={dish.name}>
            <button type="button" onClick={() => setOpened(dish)}>
              {dish.name}
            </button>
          </li>
        ))}
      </ul>
      {opened && (
        <RecipeDialog
          title={opened.name}
          dishes={[{ dish: opened }]}
          savedNames={savedNames}
          onToggleSave={toggle}
          onClose={() => setOpened(null)}
        />
      )}
    </section>
  )
}
