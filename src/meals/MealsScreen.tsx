import { useEffect, useState, type FormEvent } from 'react'
import { itemsForTab, type InventoryItem } from '../domain/inventory'
import type { InventoryRepository } from '../inventory/InventoryRepository'
import { MealsError, type MealConditions, type MealsApi, type MealSuggestion } from './MealsApi'

type Props = { api: MealsApi; inventory: InventoryRepository }

const MINUTES: [MealConditions['maxMinutes'], string][] = [
  [15, '15 分'],
  [30, '30 分'],
  [45, '45 分'],
  [null, '指定なし'],
]

const SOURCE_LABEL = { stock: '在庫', staple: '常備', buy: '買い足し' } as const

type Dish = MealSuggestion['main']

/** 献立提案（D-07, D-19, D-34）。条件を選んで 3 案を提案してもらい、レシピを見る */
export function MealsScreen({ api, inventory }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [conditions, setConditions] = useState<MealConditions>({
    maxMinutes: 30,
    allowShopping: false,
    mood: '',
    mustUse: [],
  })
  const [suggestions, setSuggestions] = useState<MealSuggestion[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opened, setOpened] = useState<MealSuggestion | null>(null)

  useEffect(() => {
    inventory
      .list()
      .then((list) => setItems(itemsForTab(list, 'all')))
      .catch(() => setError('在庫を読み込めませんでした'))
  }, [inventory])

  const update = (patch: Partial<MealConditions>) => setConditions((c) => ({ ...c, ...patch }))

  const toggleMustUse = (name: string) =>
    update({
      mustUse: conditions.mustUse.includes(name)
        ? conditions.mustUse.filter((n) => n !== name)
        : [...conditions.mustUse, name],
    })

  async function suggest(e?: FormEvent) {
    e?.preventDefault()
    setLoading(true)
    setError(null)
    try {
      setSuggestions(await api.suggest(conditions))
    } catch (err) {
      setError(err instanceof MealsError ? err.message : '献立の提案に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="meals">
      <form className="card" onSubmit={suggest}>
        <fieldset>
          <legend>調理時間</legend>
          <div className="choices">
            {MINUTES.map(([value, label]) => (
              <label key={label}>
                <input
                  type="radio"
                  name="maxMinutes"
                  checked={conditions.maxMinutes === value}
                  onChange={() => update({ maxMinutes: value })}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>食材</legend>
          <div className="choices">
            {(
              [
                [false, '在庫のみ'],
                [true, '買い足し OK'],
              ] as const
            ).map(([value, label]) => (
              <label key={label}>
                <input
                  type="radio"
                  name="allowShopping"
                  checked={conditions.allowShopping === value}
                  onChange={() => update({ allowShopping: value })}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          気分・リクエスト
          <input
            value={conditions.mood}
            maxLength={200}
            placeholder="例: 和食でさっぱり"
            onChange={(e) => update({ mood: e.target.value })}
          />
        </label>
        {items.length > 0 && (
          <fieldset>
            <legend>使いたい食材</legend>
            <div className="choices wrap">
              {items.map((i) => (
                <label key={i.id}>
                  <input
                    type="checkbox"
                    name={i.name}
                    checked={conditions.mustUse.includes(i.name)}
                    onChange={() => toggleMustUse(i.name)}
                  />
                  <span>{i.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <button type="submit" disabled={loading}>
          献立を提案してもらう
        </button>
      </form>

      {loading && (
        <p role="status" className="loading">
          考えています…（30 秒ほどかかります）
        </p>
      )}
      {error && <p role="alert">{error}</p>}

      {suggestions && !loading && (
        <>
          {suggestions.map((s) => (
            <SuggestionCard key={s.main.name} suggestion={s} onOpen={() => setOpened(s)} />
          ))}
          <button type="button" className="secondary" onClick={() => suggest()}>
            別の案を出す
          </button>
        </>
      )}

      {opened && <RecipeDialog suggestion={opened} onClose={() => setOpened(null)} />}
    </section>
  )
}

function SuggestionCard({
  suggestion: s,
  onOpen,
}: {
  suggestion: MealSuggestion
  onOpen: () => void
}) {
  const buy = [...s.main.ingredients, ...s.side.ingredients].filter((i) => i.source === 'buy')
  return (
    <article className="card suggestion" aria-label={`${s.main.name}・${s.side.name}`}>
      <h2>{s.main.name}</h2>
      <p className="side">＋ {s.side.name}</p>
      <p className="meta">
        合計 {s.totalMinutes} 分{buy.length > 0 && ` ・ 買い足し ${buy.length} 品`}
      </p>
      {s.usesExpiringSoon.length > 0 && (
        <p className="expiring">期限が近い: {s.usesExpiringSoon.join('、')}</p>
      )}
      <button type="button" onClick={onOpen}>
        レシピを見る
      </button>
    </article>
  )
}

function RecipeDialog({
  suggestion: s,
  onClose,
}: {
  suggestion: MealSuggestion
  onClose: () => void
}) {
  return (
    <div role="dialog" aria-modal="true" aria-label={s.main.name} className="sheet recipe">
      {/* 長いレシピでもすぐ閉じられるよう、上に固定する */}
      <button type="button" onClick={onClose}>
        閉じる
      </button>
      {s.tip && <p className="tip">段取り: {s.tip}</p>}
      <DishRecipe label="主菜" dish={s.main} />
      <DishRecipe label="副菜" dish={s.side} />
    </div>
  )
}

function DishRecipe({ label, dish }: { label: string; dish: Dish }) {
  return (
    <section aria-label={`${label} ${dish.name}`}>
      <h2>
        <small>{label}</small> {dish.name}
        <span className="minutes">{dish.minutes} 分</span>
      </h2>
      <ul className="ingredients">
        {dish.ingredients.map((i) => (
          <li key={i.name}>
            <span>{i.name}</span>
            <span>{i.amount}</span>
            <span className="source" data-source={i.source}>
              {SOURCE_LABEL[i.source]}
            </span>
          </li>
        ))}
      </ul>
      <ol aria-label="手順">
        {dish.steps.map((step, n) => (
          <li key={n}>{step}</li>
        ))}
      </ol>
    </section>
  )
}
