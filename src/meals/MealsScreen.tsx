import { useEffect, useState, type FormEvent } from 'react'
import type { IsoDate } from '../domain/food'
import type { InventoryItem } from '../domain/inventory'
import type { InventoryRepository } from '../inventory/InventoryRepository'
import { useStock } from '../inventory/useStock'
import type { KeyValueStore } from '../offline/offlineCache'
import { CookedSheet } from '../recipes/CookedSheet'
import { frozenMeatsOf } from '../domain/thaw'
import { MicrowaveBadge, RecipeDialog } from '../recipes/RecipeDialog'
import type { Dish, RecipesRepository } from '../recipes/RecipesRepository'
import { useSavedDishes } from '../recipes/useSavedDishes'
import { dishesOf } from '../../supabase/functions/_shared/meals.ts'
import { loadLastSuggestions, saveLastSuggestions } from './lastSuggestions'
import { MealsError, type MealConditions, type MealsApi, type MealSuggestion } from './MealsApi'

type Props = {
  api: MealsApi
  inventory: InventoryRepository
  recipes: RecipesRepository
  /** 最後の提案結果の保存先（D-43） */
  store: KeyValueStore
  today: IsoDate
}

const MINUTES: [MealConditions['maxMinutes'], string][] = [
  [15, '15 分'],
  [30, '30 分'],
  [45, '45 分'],
  [null, '指定なし'],
]

const INITIAL: MealConditions = {
  maxMinutes: 30,
  allowShopping: false,
  soup: true,
  sideMicrowave: false,
  mood: '',
  mustUse: [],
}

/**
 * 献立提案（D-07, D-19, D-34, D-44, D-50）。条件を選んで 3 案を提案してもらい、レシピを見る。
 * 最後の提案は端末に保存し、画面を離れても次の提案まで表示する（D-43）
 */
export function MealsScreen({ api, inventory, recipes, store, today }: Props) {
  const { savedNames, microwaveNames, toggle } = useSavedDishes(recipes)
  const [last] = useState(() => loadLastSuggestions(store))
  // 表示中の案を「副菜: レンジで」で提案したか。印は提案したときの条件で付ける（D-50）
  const [sideMicrowave, setSideMicrowave] = useState(last?.conditions.sideMicrowave ?? false)
  const isMicrowave = (dish: Dish, side: boolean) =>
    (side && sideMicrowave) || microwaveNames.has(dish.name)
  const { stock: items, reload, thaw } = useStock(inventory, today)
  const [conditions, setConditions] = useState<MealConditions>(last?.conditions ?? INITIAL)
  const [suggestions, setSuggestions] = useState<MealSuggestion[] | null>(last?.suggestions ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opened, setOpened] = useState<MealSuggestion | null>(null)
  const [cooking, setCooking] = useState<Dish[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    reload()
      .then((list) => {
        // 保存していた「使いたい食材」のうち、在庫からなくなったものは外す
        const names = new Set(list.map((i) => i.name))
        setConditions((c) => ({ ...c, mustUse: c.mustUse.filter((n) => names.has(n)) }))
      })
      .catch(() => setError('在庫を読み込めませんでした'))
  }, [reload])

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
      const result = await api.suggest(conditions)
      setSuggestions(result)
      setSideMicrowave(conditions.sideMicrowave)
      saveLastSuggestions(store, { conditions, suggestions: result })
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
        <fieldset>
          <legend>汁物</legend>
          <div className="choices">
            {(
              [
                [true, 'あり'],
                [false, 'なし'],
              ] as const
            ).map(([value, label]) => (
              <label key={label}>
                <input
                  type="radio"
                  name="soup"
                  aria-label={`汁物${label}`}
                  checked={conditions.soup === value}
                  onChange={() => update({ soup: value })}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>副菜</legend>
          <div className="choices">
            {(
              [
                [false, 'どちらでも'],
                [true, 'レンジで'],
              ] as const
            ).map(([value, label]) => (
              <label key={label}>
                <input
                  type="radio"
                  name="sideMicrowave"
                  aria-label={`副菜${label}`}
                  checked={conditions.sideMicrowave === value}
                  onChange={() => update({ sideMicrowave: value })}
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
            <SuggestionCard
              key={s.main.name}
              suggestion={s}
              stock={items}
              isMicrowave={isMicrowave}
              onOpen={() => setOpened(s)}
            />
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
            { label: '主菜', dish: opened.main, microwave: isMicrowave(opened.main, false) },
            { label: '副菜', dish: opened.side, microwave: isMicrowave(opened.side, true) },
            ...(opened.soup
              ? [{ label: '汁物', dish: opened.soup, microwave: isMicrowave(opened.soup, false) }]
              : []),
          ]}
          tip={opened.tip}
          savedNames={savedNames}
          onToggleSave={toggle}
          onClose={() => setOpened(null)}
          stock={items}
          onThaw={thaw}
        >
          <button
            type="button"
            className="primary"
            onClick={() => {
              setCooking(dishesOf(opened))
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
  stock,
  isMicrowave,
  onOpen,
}: {
  suggestion: MealSuggestion
  stock: InventoryItem[]
  isMicrowave: (dish: Dish, side: boolean) => boolean
  onOpen: () => void
}) {
  const dishes = dishesOf(s)
  const frozen = frozenMeatsOf(
    dishes.flatMap((d) => d.ingredients),
    stock,
  )
  const buy = dishes.flatMap((d) => d.ingredients).filter((i) => i.source === 'buy')
  return (
    <article className="card suggestion" aria-label={dishes.map((d) => d.name).join('・')}>
      <h2>
        {s.main.name}
        {isMicrowave(s.main, false) && <MicrowaveBadge />}
      </h2>
      {dishes.slice(1).map((d) => (
        <p key={d.name} className="side">
          ＋ {d.name}
          {isMicrowave(d, d === s.side) && <MicrowaveBadge />}
        </p>
      ))}
      <p className="meta">
        合計 {s.totalMinutes} 分{buy.length > 0 && ` ・ 買い足し ${buy.length} 品`}
      </p>
      {s.usesExpiringSoon.length > 0 && (
        <p className="expiring">期限が近い: {s.usesExpiringSoon.join('、')}</p>
      )}
      {frozen.length > 0 && (
        <p className="frozen">冷凍・要解凍: {frozen.map((i) => i.name).join('、')}</p>
      )}
      <button type="button" onClick={onOpen}>
        レシピを見る
      </button>
    </article>
  )
}
