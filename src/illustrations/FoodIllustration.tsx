import { illustrationFor } from './illustrations'

/** 食材のイラスト（D-56）。対応表にない食材は「作成中」を出す */
export function FoodIllustration({ name }: { name: string }) {
  const src = illustrationFor(name)
  return src ? (
    <img className="food-illustration" src={src} alt="" draggable={false} />
  ) : (
    <span className="food-illustration pending">作成中</span>
  )
}
