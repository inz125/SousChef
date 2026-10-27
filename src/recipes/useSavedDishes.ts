import { useCallback, useEffect, useState } from 'react'
import type { Dish, RecipesRepository, SavedDish } from './RecipesRepository'

/** ★保存した料理の一覧と、保存の切り替え。保存するときに「レンジで作る料理」かも覚える（D-50） */
export function useSavedDishes(repo: RecipesRepository) {
  const [saved, setSaved] = useState<SavedDish[] | null>(null)

  useEffect(() => {
    repo
      .savedDishes()
      .then(setSaved)
      .catch(() => setSaved([]))
  }, [repo])

  const toggle = useCallback(
    async (dish: Dish, microwave = false) => {
      if (saved?.some((d) => d.name === dish.name)) {
        await repo.unsaveDish(dish.name)
        setSaved((list) => list && list.filter((d) => d.name !== dish.name))
      } else {
        await repo.saveDish(dish, microwave)
        setSaved((list) => [
          { ...dish, microwave },
          ...(list ?? []).filter((d) => d.name !== dish.name),
        ])
      }
    },
    [repo, saved],
  )

  return {
    saved,
    savedNames: new Set(saved?.map((d) => d.name)),
    microwaveNames: new Set(saved?.filter((d) => d.microwave).map((d) => d.name)),
    toggle,
  }
}
