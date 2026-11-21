import type { Category } from '../domain/food'
import { categoryIllustration, illustrationFor } from './illustrations'

/** 食材のイラスト（D-56）。対応表にない食材はカテゴリの絵を出す（D-80） */
export function FoodIllustration({ name, category }: { name: string; category: Category }) {
  return (
    <img
      className="food-illustration"
      src={illustrationFor(name) ?? categoryIllustration(category)}
      alt=""
      draggable={false}
    />
  )
}
