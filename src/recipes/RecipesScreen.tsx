import { useCallback, useEffect, useState } from 'react'
import type { IsoDate } from '../domain/food'
import type { InventoryRepository } from '../inventory/InventoryRepository'
import { CookedSheet } from './CookedSheet'
import { RecipeDialog } from './RecipeDialog'
import type { CookingRecord, Dish, RecipesRepository } from './RecipesRepository'
import { useSavedDishes } from './useSavedDishes'

type Props = { repo: RecipesRepository; inventory: InventoryRepository; today: IsoDate }

const monthDay = (date: string) => {
  const [, m, d] = date.split('-').map(Number)
  return `${m}/${d}`
}

/** レシピタブ（D-39）。★保存した料理と調理履歴 */
export function RecipesScreen({ repo, inventory, today }: Props) {
  const { saved, savedNames, toggle } = useSavedDishes(repo)
  const [history, setHistory] = useState<CookingRecord[]>([])
  const [opened, setOpened] = useState<Dish | null>(null)
  // CookedSheet には開いている間同じ配列を渡す
  const [cooking, setCooking] = useState<Dish[] | null>(null)

  const loadHistory = useCallback(
    () =>
      repo
        .history()
        .then(setHistory)
        .catch(() => setHistory([])),
    [repo],
  )

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  return (
    <section className="recipes">
      <h2>保存した料理</h2>
      {saved && saved.length === 0 && (
        <p className="empty">献立のレシピで★を押すと、ここに保存されます</p>
      )}
      <ul aria-label="保存した料理" className="card list">
        {saved?.map((dish) => (
          <li key={dish.name}>
            <button type="button" onClick={() => setOpened(dish)}>
              {dish.name}
            </button>
          </li>
        ))}
      </ul>

      <h2>調理履歴</h2>
      <ul aria-label="調理履歴" className="card list history">
        {history.map((h, n) => (
          <li key={n}>
            <span className="date">{monthDay(h.cookedOn)}</span>
            <span className="dishes">{h.dishNames.join('・')}</span>
            <span className="actor">{h.actorName}</span>
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
        >
          <button
            type="button"
            className="primary"
            onClick={() => {
              setCooking([opened])
              setOpened(null)
            }}
          >
            作った
          </button>
        </RecipeDialog>
      )}

      {cooking && (
        <CookedSheet
          dishes={cooking}
          inventory={inventory}
          recipes={repo}
          today={today}
          onDone={() => {
            setCooking(null)
            loadHistory()
          }}
          onCancel={() => setCooking(null)}
        />
      )}
    </section>
  )
}
