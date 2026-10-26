import { useCallback, useEffect, useState } from 'react'
import { monthOf, monthRange, monthWeeks, shiftMonth, type YearMonth } from '../domain/calendar'
import type { IsoDate } from '../domain/food'
import type { InventoryRepository } from '../inventory/InventoryRepository'
import { CookedSheet } from './CookedSheet'
import { RecipeDialog } from './RecipeDialog'
import type { CookingRecord, Dish, RecipesRepository } from './RecipesRepository'
import { useSavedDishes } from './useSavedDishes'

type Props = { repo: RecipesRepository; inventory: InventoryRepository; today: IsoDate }

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

const monthDay = (date: IsoDate) => {
  const [, m, d] = date.split('-').map(Number)
  return `${m}月${d}日`
}

const monthTitle = (month: YearMonth) => {
  const [y, m] = month.split('-').map(Number)
  return `${y}年${m}月`
}

/** レシピタブ（D-39）。★保存した料理と調理履歴のカレンダー（D-45） */
export function RecipesScreen({ repo, inventory, today }: Props) {
  const { saved, savedNames, toggle } = useSavedDishes(repo)
  const [month, setMonth] = useState<YearMonth>(() => monthOf(today))
  const [selected, setSelected] = useState<IsoDate>(today)
  const [history, setHistory] = useState<CookingRecord[]>([])
  const [opened, setOpened] = useState<Dish | null>(null)
  // CookedSheet には開いている間同じ配列を渡す
  const [cooking, setCooking] = useState<Dish[] | null>(null)

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

  return (
    <section className="recipes">
      <h2>保存した料理</h2>
      {saved && saved.length === 0 && (
        <p className="empty">献立のレシピで★を押すと、ここに保存されます</p>
      )}
      <ul aria-label="保存した料理" className="card list">
        {saved?.map((dish) => (
          <li key={dish.name}>
            <button type="button" onClick={() => setOpened(dish)}>
              {dish.name}
            </button>
          </li>
        ))}
      </ul>

      <h2>調理履歴</h2>
      <HistoryCalendar
        month={month}
        history={history}
        today={today}
        selected={selected}
        onSelect={setSelected}
        onMonth={(delta) => setMonth((m) => shiftMonth(m, delta))}
        onOpen={setOpened}
      />

      {opened && (
        <RecipeDialog
          title={opened.name}
          dishes={[{ dish: opened }]}
          savedNames={savedNames}
          onToggleSave={toggle}
          onClose={() => setOpened(null)}
        >
          <button
            type="button"
            className="primary"
            onClick={() => {
              setCooking([opened])
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
