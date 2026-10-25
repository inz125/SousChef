import { useCallback, useEffect, useState } from 'react'
import type { Dish, RecipesRepository } from './RecipesRepository'

/** ★保存した料理の一覧と、保存の切り替え */
export function useSavedDishes(repo: RecipesRepository) {
  const [saved, setSaved] = useState<Dish[] | null>(null)

  useEffect(() => {
    repo
      .savedDishes()
      .then(setSaved)
      .catch(() => setSaved([]))
  }, [repo])

  const toggle = useCallback(
    async (dish: Dish) => {
      if (saved?.some((d) => d.name === dish.name)) {
        await repo.unsaveDish(dish.name)
        setSaved((list) => list && list.filter((d) => d.name !== dish.name))
      } else {
        await repo.saveDish(dish)
        setSaved((list) => [dish, ...(list ?? []).filter((d) => d.name !== dish.name)])
      }
    },
    [repo, saved],
  )

  return { saved, savedNames: new Set(saved?.map((d) => d.name)), toggle }
}
