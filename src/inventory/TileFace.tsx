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
export function TileFace({
  item,
  today,
  stocked = false,
}: {
  item: InventoryItem
  today: IsoDate
  /** 常備食品に当たる食材か。「常」のバッジを付ける（D-71） */
  stocked?: boolean
}) {
  const badge = expiryBadge(item.expiresOn, today)
  // 状態の行（D-75）。「少ない」は黄色、「解凍中」は緑の印
  const low = item.quantity === 'low'
  const thawing = isThawing(item)
  return (
    <>
      <span className="tile-icon">
        <FoodIllustration name={item.name} />
        {badge && <span className="expiry-badge">{badge}</span>}
        {stocked && <span className="stocked-badge">常</span>}
      </span>
      <span className="tile-name">{item.name}</span>
      {/* 名前・期限・状態の 3 行はどの食材でも同じ高さにする（ない行も空けておく。D-75） */}
      <span className="tile-expiry" data-estimated={String(item.expiresOnEstimated)}>
        {item.expiresOn && formatExpiry(item.expiresOn, today)}
        {/* 目安かどうかは色で示し、読み上げには「目安」と伝える */}
        {item.expiresOn && item.expiresOnEstimated && <span className="visually-hidden">目安</span>}
      </span>
      <span className="tile-status">
        {/* 量は「少ない」のときだけ示す（D-41） */}
        {low && <span className="tile-low">{QUANTITIES.low}</span>}
        {low && thawing && '・'}
        {thawing && <span className="tile-thaw">解凍中</span>}
      </span>
    </>
  )
}
