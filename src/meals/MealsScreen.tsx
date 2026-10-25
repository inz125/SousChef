import { useEffect, useState, type FormEvent } from 'react'
import type { IsoDate } from '../domain/food'
import { itemsForTab, type InventoryItem } from '../domain/inventory'
import type { InventoryRepository } from '../inventory/InventoryRepository'
import { CookedSheet } from '../recipes/CookedSheet'
import { RecipeDialog } from '../recipes/RecipeDialog'
import type { Dish, RecipesRepository } from '../recipes/RecipesRepository'
import { useSavedDishes } from '../recipes/useSavedDishes'
import { MealsError, type MealConditions, type MealsApi, type MealSuggestion } from './MealsApi'

type Props = {
  api: MealsApi
  inventory: InventoryRepository
  recipes: RecipesRepository
  today: IsoDate
}

const MINUTES: [MealConditions['maxMinutes'], string][] = [
  [15, '15 分'],
  [30, '30 分'],
  [45, '45 分'],
  [null, '指定なし'],
]

/** 献立提案（D-07, D-19, D-34）。条件を選んで 3 案を提案してもらい、レシピを見る */
export function MealsScreen({ api, inventory, recipes, today }: Props) {
  const { savedNames, toggle } = useSavedDishes(recipes)
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
  const [cooking, setCooking] = useState<Dish[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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
      {notice && (
        <p role="status" className="notice-text">
          {notice}
        </p>
      )}

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

      {opened && (
        <RecipeDialog
          title={opened.main.name}
          dishes={[
            { label: '主菜', dish: opened.main },
            { label: '副菜', dish: opened.side },
          ]}
          tip={opened.tip}
          savedNames={savedNames}
          onToggleSave={toggle}
          onClose={() => setOpened(null)}
        >
          <button
            type="button"
            className="primary"
            onClick={() => {
              setCooking([opened.main, opened.side])
              setOpened(null)
            }}
          >
            作った
          </button>
        </RecipeDialog>
      )}

      {cooking && (
        <CookedSheet
          dishes={cooking}
          inventory={inventory}
          recipes={recipes}
          today={today}
          onDone={() => {
            setCooking(null)
            setNotice('記録しました。在庫を更新しました')
          }}
          onCancel={() => setCooking(null)}
        />
      )}
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
