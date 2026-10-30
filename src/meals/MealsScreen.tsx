import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from 'react'
import type { IsoDate } from '../domain/food'
import type { InventoryItem } from '../domain/inventory'
import type { InventoryRepository } from '../inventory/InventoryRepository'
import { useStock } from '../inventory/useStock'
import { CookedSheet } from '../recipes/CookedSheet'
import { frozenMeatsOf } from '../domain/thaw'
import { MicrowaveBadge, RecipeDialog, type DishRevise } from '../recipes/RecipeDialog'
import type { Dish, RecipesRepository } from '../recipes/RecipesRepository'
import { useSavedDishes } from '../recipes/useSavedDishes'
import { dishesOf, type Course } from '../../supabase/functions/_shared/meals.ts'
import type { MealPlanner, ShownPlan } from './mealPlanner'
import { MealInterview } from './MealInterview'
import { MealsError, type MealConditions, type MealOutline, type MealSuggestion } from './MealsApi'

type Props = {
  /** 表示中の提案とレシピ作り。タブを移ってもレシピ作りを続けるよう、アプリで 1 つ持つ（D-63） */
  planner: MealPlanner
  inventory: InventoryRepository
  recipes: RecipesRepository
  today: IsoDate
}

const INITIAL: MealConditions = {
  maxMinutes: 30,
  allowShopping: false,
  riceCooked: true,
  noodle: null,
  soup: true,
  sideDish: true,
  sideMicrowave: false,
  mood: '',
  mustUse: [],
}

/**
 * 献立提案（D-07, D-19, D-34, D-44, D-50, D-54）。条件をインタビューで聞いて（D-53）3 案を提案してもらい、レシピを見る。
 * 案を先に出し、レシピは裏で案ごとに同時に作る（D-63）。
 * 最後の提案は端末に保存し、画面を離れても次の提案まで表示する（D-43）
 */
export function MealsScreen({ planner, inventory, recipes, today }: Props) {
  const { savedNames, microwaveNames, toggle } = useSavedDishes(recipes)
  const last = useSyncExternalStore(planner.subscribe, planner.getSnapshot)
  // 表示中の案を提案したときの条件。「別の案を出す」はこの条件で提案し直す
  const conditions = last?.conditions ?? INITIAL
  const plans = last?.plans ?? null
  // 表示中の案を「副菜: レンジで」で提案したか。印は提案したときの条件で付ける（D-50）
  const isMicrowave = (dish: { name: string }, side: boolean) =>
    (side && conditions.sideMicrowave) || microwaveNames.has(dish.name)
  // 修正した料理は、直したときの印のまま（名前が変わっても消さない, D-64）
  const markOf =
    (plan: ShownPlan): Mark =>
    (dish, course) =>
      plan.revisions?.[course]?.microwave ?? isMicrowave(dish, course === 'side')
  const { stock: items, reload, thaw } = useStock(inventory, today)
  const [stockLoaded, setStockLoaded] = useState(false)
  // インタビュー中か。始めるたびに key を変えて、答えを初期値からやり直す
  const [interview, setInterview] = useState<number | null>(last ? null : 0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 開いている案の番号。レシピが届いたら開いたまま表示を更新する */
  const [opened, setOpened] = useState<number | null>(null)
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
      await planner.suggest(next)
      setOpened(null)
      setInterview(null)
    } catch (err) {
      setError(err instanceof MealsError ? err.message : '献立の提案に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const shown = opened === null ? null : (plans?.[opened] ?? null)

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
            plans
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
          考えています…（15 秒ほどかかります）
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && (
        <p role="status" className="notice-text">
          {notice}
        </p>
      )}

      {plans && interview === null && !loading && (
        <>
          {plans.map((p, i) => (
            <SuggestionCard
              key={p.outline.main.name}
              suggestion={p.recipe ?? p.outline}
              stock={items}
              isMicrowave={markOf(p)}
              onOpen={() => setOpened(i)}
            >
              <RecipeStatus plan={p} onRetry={() => planner.makeRecipe(i)} />
            </SuggestionCard>
          ))}
          <button type="button" className="secondary" onClick={() => suggest(conditions)}>
            別の案を出す
          </button>
        </>
      )}

      {shown && opened !== null && (
        <PlanRecipe
          plan={shown}
          isMicrowave={markOf(shown)}
          onRevise={(course, instruction, microwave) =>
            planner.revise(opened, course, instruction, microwave)
          }
          onUndo={(course) => planner.undo(opened, course)}
          savedNames={savedNames}
          onToggleSave={toggle}
          onClose={() => setOpened(null)}
          stock={items}
          onThaw={thaw}
          onRetry={() => planner.makeRecipe(opened)}
          onCooked={(dishes) => {
            setCooking(dishes)
            setOpened(null)
          }}
        />
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

/** 料理に「レンジ」の印（D-50）を付けるか */
type Mark = (dish: { name: string }, course: Course) => boolean

/** 案のカード。レシピがまだの案（D-63）でも、料理名・合計時間・材料から分かる印は出せる */
function SuggestionCard({
  suggestion: s,
  stock,
  isMicrowave,
  onOpen,
  children,
}: {
  suggestion: MealSuggestion | MealOutline
  stock: InventoryItem[]
  isMicrowave: Mark
  onOpen: () => void
  children?: ReactNode
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
        {isMicrowave(s.main, 'main') && <MicrowaveBadge />}
      </h2>
      {dishes.slice(1).map((d) => (
        <p key={d.name} className="side">
          ＋ {d.name}
          {isMicrowave(d, d === s.side ? 'side' : 'soup') && <MicrowaveBadge />}
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
      {children}
      <button type="button" onClick={onOpen}>
        レシピを見る
      </button>
    </article>
  )
}

/** レシピを作っている・作れなかったときの表示と「レシピを作る」（D-63） */
function RecipeStatus({ plan, onRetry }: { plan: ShownPlan; onRetry: () => void }) {
  if (plan.making) return <p className="recipe-status">レシピを作っています…</p>
  if (plan.failure === null) return null
  return (
    <p className="recipe-status">
      {plan.failure || 'レシピはまだできていません'}
      <button type="button" onClick={onRetry}>
        レシピを作る
      </button>
    </p>
  )
}

/**
 * 案のレシピ。レシピがまだなら料理名と材料名だけを出し、★保存・「作った」はできない（D-63）。
 * レシピができた料理は頼み方に合わせて直せる（D-64）
 */
function PlanRecipe({
  plan,
  isMicrowave,
  onRetry,
  onCooked,
  onRevise,
  onUndo,
  ...dialog
}: {
  plan: ShownPlan
  isMicrowave: Mark
  onRevise: (course: Course, instruction: string, microwave: boolean) => Promise<void>
  onUndo: (course: Course) => void
  savedNames: Set<string>
  onToggleSave: (dish: Dish, microwave: boolean) => void
  onClose: () => void
  stock: InventoryItem[]
  onThaw: ComponentProps<typeof RecipeDialog>['onThaw']
  onRetry: () => void
  onCooked: (dishes: Dish[]) => void
}) {
  const { recipe } = plan
  const s = recipe ?? plan.outline
  const entry = (course: Course, label: string) => {
    const dish = s[course]
    if (!dish) return []
    const microwave = isMicrowave(dish, course)
    const revise: DishRevise | undefined = recipe
      ? {
          busy: plan.revising.includes(course),
          revised: plan.revisions?.[course] !== undefined,
          onRevise: (instruction) => onRevise(course, instruction, microwave),
          onUndo: () => onUndo(course),
        }
      : undefined
    return [{ label, dish, microwave, revise }]
  }
  return (
    <RecipeDialog
      {...dialog}
      title={s.main.name}
      dishes={[...entry('main', '主菜'), ...entry('side', '副菜'), ...entry('soup', '汁物')]}
      // 1 品だけなら並行して作る段取りはない（D-54）
      tip={recipe && dishesOf(recipe).length > 1 ? recipe.tip : undefined}
      status={<RecipeStatus plan={plan} onRetry={onRetry} />}
    >
      {recipe && (
        <button
          type="button"
          className="primary"
          // 直している途中の内容では記録しない（D-64）
          disabled={plan.revising.length > 0}
          onClick={() => onCooked(dishesOf(recipe))}
        >
          作った
        </button>
      )}
    </RecipeDialog>
  )
}
