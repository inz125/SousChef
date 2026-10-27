import { useCallback, useEffect, useState } from 'react'
import { monthOf, monthRange, monthWeeks, shiftMonth, type YearMonth } from '../domain/calendar'
import type { IsoDate } from '../domain/food'
import type { InventoryRepository } from '../inventory/InventoryRepository'
import { useStock } from '../inventory/useStock'
import { useOnline } from '../lib/useOnline'
import { CookedSheet } from './CookedSheet'
import { MicrowaveBadge, RecipeDialog } from './RecipeDialog'
import type { CookingRecord, Dish, RecipesRepository, SuggestedDish } from './RecipesRepository'
import { useSavedDishes } from './useSavedDishes'

type Props = { repo: RecipesRepository; inventory: InventoryRepository; today: IsoDate }

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

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

/** レシピタブ（D-39）。★保存した料理・最近提案された料理（D-51）・調理履歴のカレンダー（D-45） */
export function RecipesScreen({ repo, inventory, today }: Props) {
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

  return (
    <section className="recipes">
      <h2>保存した料理</h2>
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

      {suggested && (
        <>
          <h2>最近提案された料理</h2>
          {suggested.length === 0 ? (
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
          )}
        </>
      )}

      <h2>調理履歴</h2>
      <HistoryCalendar
        month={month}
        history={history}
        today={today}
        selected={selected}
        onSelect={setSelected}
        onMonth={(delta) => setMonth((m) => shiftMonth(m, delta))}
        onOpen={(dish) => setOpened({ dish })}
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
