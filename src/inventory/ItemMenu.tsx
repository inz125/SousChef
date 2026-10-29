import { QUANTITIES, quantityAfterTap, type InventoryItem } from '../domain/inventory'

type Props = {
  item: InventoryItem
  /** 解凍できるときだけ渡す（冷凍の肉。D-47） */
  onThaw?: () => void
  onToggleQuantity: () => void
  onRemove: () => void
  onCancel: () => void
}

/** 食材を長押ししたときに下から出るメニュー（D-56。D-41 の左スワイプを置き換え） */
export function ItemMenu({ item, onThaw, onToggleQuantity, onRemove, onCancel }: Props) {
  return (
    <>
      <div className="backdrop" onClick={onCancel} />
      <div role="dialog" aria-label={`${item.name}の操作`} className="sheet action-sheet">
        <p className="action-title">{item.name}</p>
        <button type="button" onClick={onToggleQuantity}>
          {QUANTITIES[quantityAfterTap(item.quantity)]}にする
        </button>
        {onThaw && (
          <button type="button" onClick={onThaw}>
            解凍
          </button>
        )}
        <button type="button" className="danger" onClick={onRemove}>
          削除
        </button>
        <button type="button" className="cancel" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </>
  )
}
