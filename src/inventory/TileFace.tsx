import type { IsoDate } from '../domain/food'
import {
  expiryBadge,
  formatExpiry,
  isThawing,
  QUANTITIES,
  type InventoryItem,
} from '../domain/inventory'
import { FoodIllustration } from '../illustrations/FoodIllustration'

/** 在庫の並びの 1 つ分の中身（D-56）。長押しで浮かせるイラスト（D-59）にも使う */
export function TileFace({ item, today }: { item: InventoryItem; today: IsoDate }) {
  const badge = expiryBadge(item.expiresOn, today)
  return (
    <>
      <span className="tile-icon">
        <FoodIllustration name={item.name} />
        {badge && <span className="expiry-badge">{badge}</span>}
      </span>
      <span className="tile-name">{item.name}</span>
      {item.expiresOn && (
        <span className="tile-expiry">
          {formatExpiry(item.expiresOn, today)}
          {item.expiresOnEstimated && <small>（目安）</small>}
        </span>
      )}
      {/* 量は「少ない」のときだけ示す（D-41） */}
      {item.quantity === 'low' && <span className="tile-low">{QUANTITIES.low}</span>}
      {isThawing(item) && <span className="thaw-badge">解凍中</span>}
    </>
  )
}
