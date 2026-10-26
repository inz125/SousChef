import { useState, type FormEvent } from 'react'
import { QUANTITIES, type InventoryItem, type Quantity } from '../domain/inventory'
import type { ThawChoice } from '../domain/thaw'

type Props = {
  item: InventoryItem
  onSubmit: (choice: ThawChoice) => void
  onCancel: () => void
}

/** 冷凍の肉を解凍する（D-47）。全部か、一部なら冷凍の行に残す量を選ぶ */
export function ThawSheet({ item, onSubmit, onCancel }: Props) {
  const [kind, setKind] = useState<ThawChoice['kind']>('all')
  const [remaining, setRemaining] = useState<Quantity>(item.quantity)

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit(kind === 'all' ? { kind } : { kind, remaining })
  }

  return (
    <form role="dialog" aria-label={`${item.name}を解凍`} className="sheet thaw" onSubmit={submit}>
      <h2>{item.name}を解凍</h2>
      <p className="hint">冷蔵に移して解凍します。期限の目安は 2 日後です</p>
      <div className="segmented">
        {(
          [
            ['all', '全部'],
            ['part', '一部'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {kind === 'part' && (
        <fieldset>
          <legend>冷凍に残す量</legend>
          <div className="choices">
            {Object.entries(QUANTITIES).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="remaining"
                  checked={remaining === value}
                  onChange={() => setRemaining(value as Quantity)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="sheet-actions">
        <button type="button" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit">解凍する</button>
      </div>
    </form>
  )
}
