import { useCallback, useEffect, useState } from 'react'
import { monthOf, monthRange, monthWeeks, shiftMonth, type YearMonth } from '../domain/calendar'
import type { IsoDate } from '../domain/food'
import type { InventoryRepository } from '../inventory/InventoryRepository'
import { useStock } from '../inventory/useStock'
import { useOnline } from '../lib/useOnline'
import { SwipePager } from '../ui/SwipePager'
import { CookedSheet } from './CookedSheet'
import { MicrowaveBadge, RecipeDialog } from './RecipeDialog'
import type { CookingRecord, Dish, RecipesRepository, SuggestedDish } from './RecipesRepository'
import { useSavedDishes } from './useSavedDishes'

type Props = { repo: RecipesRepository; inventory: InventoryRepository; today: IsoDate }

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** 上部の切替（D-58）。選んだ区分だけを表示する */
const SECTIONS = [
  ['saved', '保存'],
  ['suggested', '最近の提案'],
  ['history', '調理履歴'],
] as const

type Section = (typeof SECTIONS)[number][0]

const monthDay = (date: IsoDate) => {
  const [, m, d] = date.split('-').map(Number)
  return `${m}月${d}日`
}

const shortDate = (date: IsoDate) => {
  const [, m, d] = date.split('-').map(Number)
  return `${m}/${d}`
}

const monthTitle = (month: YearMonth) => {
  const [y, m] = month.split('-').map(Number)
  return `${y}年${m}月`
}

/** レシピタブ（D-39）。★保存した料理・最近提案された料理（D-51）・調理履歴のカレンダー（D-45）を切り替えて表示する（D-58） */
export function RecipesScreen({ repo, inventory, today }: Props) {
  // 端末には覚えず、開くたびに「保存」から（D-58）
  const [section, setSection] = useState<Section>('saved')
  const { saved, savedNames, microwaveNames, toggle } = useSavedDishes(repo)
  const [month, setMonth] = useState<YearMonth>(() => monthOf(today))
  const [selected, setSelected] = useState<IsoDate>(today)
  const [history, setHistory] = useState<CookingRecord[]>([])
  // microwave: 提案されたときに「レンジ」の印が付いていたか（D-51）
  const [opened, setOpened] = useState<{ dish: Dish; microwave?: boolean } | null>(null)
  // CookedSheet には開いている間同じ配列を渡す
  const [cooking, setCooking] = useState<Dish[] | null>(null)
  // レシピを開いたら、冷凍の肉を使うか今の在庫で確かめる（D-49）
  const { stock, reload, thaw } = useStock(inventory, today)
  const online = useOnline()
  const suggested = useSuggestedDishes(repo, today)

  const loadHistory = useCallback(() => {
    const { from, to } = monthRange(month)
    return repo
      .history(from, to)
      .then(setHistory)
      .catch(() => setHistory([]))
  }, [repo, month])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    if (opened) reload().catch(() => {})
  }, [opened, reload])

  /** 区分ごとの中身。スワイプ中は隣の区分も描く（D-68） */
  function renderPage(index: number) {
    switch (SECTIONS[index][0]) {
      case 'saved':
        return (
          <>
            {saved && saved.length === 0 && (
              <p className="empty">献立のレシピで★を押すと、ここに保存されます</p>
            )}
            <ul aria-label="保存した料理" className="card list">
              {saved?.map((dish) => (
                <li key={dish.name}>
                  <button type="button" onClick={() => setOpened({ dish })}>
                    {dish.name}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )
      case 'suggested':
        return !suggested ? (
          // オフラインでは読み込まない（D-17）
          !online && <p className="empty">オフラインでは表示できません</p>
        ) : suggested.length === 0 ? (
          <p className="empty">献立を提案すると、ここに 7 日間残ります</p>
        ) : (
          <ul aria-label="最近提案された料理" className="card list suggested">
            {suggested.map((s) => (
              <li key={s.dish.name}>
                <button type="button" onClick={() => setOpened(s)}>
                  {s.dish.name}
                </button>
                {s.microwave && <MicrowaveBadge />}
                <span className="meta">
                  {shortDate(s.suggestedOn)} {s.actorName}
                </span>
              </li>
            ))}
          </ul>
        )
      case 'history':
        return (
          <HistoryCalendar
            month={month}
            history={history}
            today={today}
            selected={selected}
            onSelect={setSelected}
            onMonth={(delta) => setMonth((m) => shiftMonth(m, delta))}
            onOpen={(dish) => setOpened({ dish })}
          />
        )
    }
  }

  return (
    <section className="recipes">
      <div role="tablist" className="segmented">
        {SECTIONS.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={section === value}
            onClick={() => setSection(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 中身を横スワイプで隣の区分へ移る（D-68）。切替のバーは動かさない */}
      <SwipePager
        count={SECTIONS.length}
        index={SECTIONS.findIndex(([value]) => value === section)}
        onChange={(i) => setSection(SECTIONS[i][0])}
        disabled={opened !== null || cooking !== null}
        renderPage={renderPage}
      />

      {opened && (
        <RecipeDialog
          title={opened.dish.name}
          dishes={[
            {
              dish: opened.dish,
              microwave: opened.microwave || microwaveNames.has(opened.dish.name),
            },
          ]}
          savedNames={savedNames}
          onToggleSave={toggle}
          onClose={() => setOpened(null)}
          stock={stock}
          onThaw={thaw}
        >
          <button
            type="button"
            className="primary"
            onClick={() => {
              setCooking([opened.dish])
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
          recipes={repo}
          today={today}
          onDone={() => {
            setCooking(null)
            loadHistory()
          }}
          onCancel={() => setCooking(null)}
        />
      )}
    </section>
  )
}

/** 最近提案された料理（D-51）。端末に保存しないので、オフラインでは null（表示しない）。オンラインに戻ったら読み直す */
function useSuggestedDishes(repo: RecipesRepository, today: IsoDate) {
  const online = useOnline()
  const [suggested, setSuggested] = useState<SuggestedDish[] | null>(null)
  useEffect(() => {
    if (!online) return
    let active = true
    repo
      .suggestedDishes(today)
      .then((list) => active && setSuggested(list))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [repo, today, online])
  return online ? suggested : null
}

function HistoryCalendar({
  month,
  history,
  today,
  selected,
  onSelect,
  onMonth,
  onOpen,
}: {
  month: YearMonth
  history: CookingRecord[]
  today: IsoDate
  selected: IsoDate
  onSelect: (date: IsoDate) => void
  onMonth: (delta: number) => void
  onOpen: (dish: Dish) => void
}) {
  const cookedDays = new Set(history.map((h) => h.cookedOn))
  // 履歴は新しい順なので、同じ日の記録は作った順に並べ直す
  const records = history.filter((h) => h.cookedOn === selected).reverse()
  const inMonth = monthOf(selected) === month
  return (
    <div className="card history-calendar">
      <div className="month-nav">
        <button type="button" onClick={() => onMonth(-1)}>
          前の月
        </button>
        <h3>{monthTitle(month)}</h3>
        <button type="button" onClick={() => onMonth(1)}>
          次の月
        </button>
      </div>
      <table role="grid" aria-label="調理履歴のカレンダー">
        <thead>
          <tr>
            {WEEKDAYS.map((w) => (
              <th key={w} scope="col">
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthWeeks(month).map((week, n) => (
            <tr key={n}>
              {week.map((date, i) => (
                <td key={date ?? `blank-${i}`}>
                  {date && (
                    <button
                      type="button"
                      aria-label={`${monthDay(date)}${cookedDays.has(date) ? ' 作った日' : ''}`}
                      aria-pressed={date === selected}
                      data-today={date === today || undefined}
                      onClick={() => onSelect(date)}
                    >
                      {Number(date.slice(8))}
                      {cookedDays.has(date) && <span className="dot" aria-hidden="true" />}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {inMonth &&
        (records.length === 0 ? (
          <p className="empty">この日の記録はありません</p>
        ) : (
          <ul aria-label={`${monthDay(selected)}の記録`} className="list history">
            {records.map((h, n) => (
              <li key={n}>
                <span className="dishes">
                  {h.dishNames.map((name, i) => {
                    const dish = h.dishes?.find((d) => d.name === name)
                    return (
                      <span key={name}>
                        {i > 0 && '・'}
                        {dish ? (
                          <button type="button" className="link" onClick={() => onOpen(dish)}>
                            {name}
                          </button>
                        ) : (
                          name
                        )}
                      </span>
                    )
                  })}
                </span>
                <span className="actor">{h.actorName}</span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
