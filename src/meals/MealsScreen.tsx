import { useEffect, useState } from 'react'
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
import { MealInterview } from './MealInterview'
import { MealsError, type MealConditions, type MealsApi, type MealSuggestion } from './MealsApi'

type Props = {
  api: MealsApi
  inventory: InventoryRepository
  recipes: RecipesRepository
  /** 最後の提案結果の保存先（D-43） */
  store: KeyValueStore
  today: IsoDate
}

const INITIAL: MealConditions = {
  maxMinutes: 30,
  allowShopping: false,
  soup: true,
  sideMicrowave: false,
  mood: '',
  mustUse: [],
}

/**
 * 献立提案（D-07, D-19, D-34, D-44, D-50）。条件をインタビューで聞いて（D-53）3 案を提案してもらい、レシピを見る。
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
  const [stockLoaded, setStockLoaded] = useState(false)
  // 表示中の案を提案したときの条件。「別の案を出す」はこの条件で提案し直す
  const [conditions, setConditions] = useState<MealConditions>(last?.conditions ?? INITIAL)
  const [suggestions, setSuggestions] = useState<MealSuggestion[] | null>(last?.suggestions ?? null)
  // インタビュー中か。始めるたびに key を変えて、答えを初期値からやり直す
  const [interview, setInterview] = useState<number | null>(last ? null : 0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opened, setOpened] = useState<MealSuggestion | null>(null)
  const [cooking, setCooking] = useState<Dish[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    reload()
      .catch(() => setError('在庫を読み込めませんでした'))
      .finally(() => setStockLoaded(true))
  }, [reload])

  async function suggest(next: MealConditions) {
    setLoading(true)
    setError(null)
    try {
      const result = await api.suggest(next)
      setConditions(next)
      setSuggestions(result)
      setSideMicrowave(next.sideMicrowave)
      setInterview(null)
      saveLastSuggestions(store, { conditions: next, suggestions: result })
    } catch (err) {
      setError(err instanceof MealsError ? err.message : '献立の提案に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const startInterview = () => {
    setError(null)
    setNotice(null)
    setInterview((n) => (n ?? 0) + 1)
  }

  return (
    <section className="meals">
      {interview !== null ? (
        <MealInterview
          key={interview}
          // 使いたい食材と気分は毎回空から聞く（D-53）
          initial={{ ...conditions, mustUse: [], mood: '' }}
          stock={items}
          stockLoaded={stockLoaded}
          today={today}
          loading={loading}
          onSubmit={suggest}
          onCancel={
            suggestions
              ? () => {
                  setError(null)
                  setInterview(null)
                }
              : undefined
          }
        />
      ) : (
        <button type="button" className="primary new-suggestion" onClick={startInterview}>
          新しく提案してもらう
        </button>
      )}

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

      {suggestions && interview === null && !loading && (
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
          <button type="button" className="secondary" onClick={() => suggest(conditions)}>
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
