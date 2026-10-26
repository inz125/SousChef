import { useEffect, useState } from 'react'
import {
  COOKED_RESULTS,
  cookedChanges,
  stockCandidates,
  type CookedResult,
  type Leftover,
} from '../domain/cooking'
import type { IsoDate } from '../domain/food'
import type { InventoryItem } from '../domain/inventory'
import type { CatalogEntry, InventoryRepository } from '../inventory/InventoryRepository'
import type { Dish, RecipesRepository } from './RecipesRepository'

type Props = {
  dishes: Dish[]
  inventory: InventoryRepository
  recipes: RecipesRepository
  today: IsoDate
  onDone: () => void
  onCancel: () => void
}

type Row = { ingredient: string; candidates: InventoryItem[] }

/** 「作った」の確認（D-12, D-37）。使った在庫を更新し、余った買い足し食材を追加して記録する */
export function CookedSheet({ dishes, inventory, recipes, today, onDone, onCancel }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, CookedResult>>({})
  const [leftovers, setLeftovers] = useState<Leftover[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bought = uniqueIngredients(dishes, 'buy')

  useEffect(() => {
    const stock = uniqueIngredients(dishes, 'stock')
    Promise.all([inventory.list(), inventory.catalog()])
      .then(([items, entries]) => {
        const found = stock.map((i) => ({
          ingredient: i.name,
          candidates: stockCandidates(i.name, items),
        }))
        setRows(found)
        setCatalog(entries)
        setPicked(
          Object.fromEntries(
            found.filter((r) => r.candidates.length).map((r) => [r.ingredient, r.candidates[0].id]),
          ),
        )
      })
      .catch(() => setError('在庫を読み込めませんでした'))
    // 呼び出し側は開いている間 dishes に同じ配列を渡す（読み直すと選んだ内容が消えるため）
  }, [inventory, dishes])

  const toggleLeftover = (leftover: Leftover) =>
    setLeftovers((list) =>
      list.some((l) => l.name === leftover.name)
        ? list.filter((l) => l.name !== leftover.name)
        : [...list, leftover],
    )

  async function confirm() {
    if (!rows) return
    setBusy(true)
    setError(null)
    try {
      const choices = rows.flatMap((r) => {
        const item = r.candidates.find((c) => c.id === picked[r.ingredient])
        return item ? [{ item, result: results[r.ingredient] ?? 'left' }] : []
      })
      const changes = cookedChanges(choices, leftovers, catalog, today)
      await Promise.all([
        ...changes.removeIds.map((id) => inventory.remove(id)),
        ...changes.lowIds.map((id) => inventory.updateQuantity(id, 'low')),
        ...changes.add.map((item) => inventory.add(item)),
      ])
      await recipes.recordCooked(dishes)
      onDone()
    } catch {
      setError('記録できませんでした。通信状況を確認してください')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="使った食材" className="sheet cooked">
      <h2>使った食材</h2>
      {rows?.map((r) =>
        r.candidates.length === 0 ? (
          <p key={r.ingredient} className="hint">
            {r.ingredient} は在庫にありません
          </p>
        ) : (
          <fieldset key={r.ingredient} role="group" aria-label={r.ingredient}>
            <legend>{r.ingredient}</legend>
            {r.candidates.length > 1 && (
              <label>
                使った在庫
                <select
                  value={picked[r.ingredient]}
                  onChange={(e) => setPicked((p) => ({ ...p, [r.ingredient]: e.target.value }))}
                >
                  {r.candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="choices">
              {(Object.entries(COOKED_RESULTS) as [CookedResult, string][]).map(
                ([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name={`result-${r.ingredient}`}
                      checked={(results[r.ingredient] ?? 'left') === value}
                      onChange={() => setResults((s) => ({ ...s, [r.ingredient]: value }))}
                    />
                    {label}
                  </label>
                ),
              )}
            </div>
          </fieldset>
        ),
      )}
      {bought.length > 0 && (
        <fieldset role="group" aria-label="買い足した食材">
          <legend>買い足した食材</legend>
          <div className="choices">
            {bought.map((i) => (
              <label key={i.name}>
                <input
                  type="checkbox"
                  aria-label={`${i.name}が余った`}
                  checked={leftovers.some((l) => l.name === i.name)}
                  onChange={() => toggleLeftover({ name: i.name, category: i.category })}
                />
                {i.name}が余った
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="sheet-actions">
        <button type="button" onClick={onCancel}>
          キャンセル
        </button>
        <button type="button" className="primary" disabled={!rows || busy} onClick={confirm}>
          在庫を更新して記録する
        </button>
      </div>
    </div>
  )
}

/** 料理の材料のうち、指定した入手元のものを名前の重複なしで返す */
function uniqueIngredients(dishes: Dish[], source: 'stock' | 'buy') {
  const ingredients = dishes.flatMap((d) => d.ingredients).filter((i) => i.source === source)
  return [...new Map(ingredients.map((i) => [i.name, i])).values()]
}
