import { useId, useState } from 'react'
import { expiryStatus } from '../domain/expiry'
import type { IsoDate } from '../domain/food'
import type { InventoryItem } from '../domain/inventory'
import {
  formatDaysLeft,
  mustUseCandidates,
  nextStep,
  previousStep,
  QUESTION_COUNT,
  questionNumber,
  type InterviewStep,
  type MustUseCandidate,
} from '../domain/mealInterview'
import type { MealConditions } from './MealsApi'

type Props = {
  /** 選んでおく答え（前回の条件。使いたい食材と気分は空） */
  initial: MealConditions
  stock: InventoryItem[]
  /** 在庫を読み込むまでは「使いたい食材」を飛ばさない */
  stockLoaded: boolean
  today: IsoDate
  loading: boolean
  onSubmit: (conditions: MealConditions) => void
  /** 前回の結果に戻る。結果がないときは渡さない */
  onCancel?: () => void
}

type Option<T> = readonly [T, string]

const MINUTES: Option<MealConditions['maxMinutes']>[] = [
  [15, '15 分'],
  [30, '30 分'],
  [45, '45 分'],
  [null, '指定なし'],
]
const SHOPPING: Option<boolean>[] = [
  [false, '在庫のみ'],
  [true, '買い足し OK'],
]
const SOUP: Option<boolean>[] = [
  [true, 'あり'],
  [false, 'なし'],
]
const SIDE: Option<boolean>[] = [
  [false, 'どちらでも'],
  [true, 'レンジで'],
]

const QUESTIONS: Record<Exclude<InterviewStep, 'confirm'>, string> = {
  minutes: '調理時間はどのくらい？',
  shopping: '食材を買い足してもいい？',
  mustUse: '使いたい食材はある？',
  soup: '汁物はつける？',
  side: '副菜はレンジで作る？',
  mood: '気分やリクエストはある？',
}

const labelOf = <T,>(options: Option<T>[], value: T) => options.find(([v]) => v === value)![1]

/** 献立提案の条件を 1 問ずつ聞くインタビュー（D-53） */
export function MealInterview({
  initial,
  stock,
  stockLoaded,
  today,
  loading,
  onSubmit,
  onCancel,
}: Props) {
  const headingId = useId()
  const [step, setStep] = useState<InterviewStep>('minutes')
  const [answers, setAnswers] = useState(initial)
  const hasStock = !stockLoaded || stock.length > 0
  const back = previousStep(step, hasStock)
  const forward = () => setStep(nextStep(step, hasStock) ?? 'confirm')
  const answer = (patch: Partial<MealConditions>) => {
    setAnswers((a) => ({ ...a, ...patch }))
    forward()
  }

  const choice = <T,>(name: string, options: Option<T>[], value: T, patch: (v: T) => object) => (
    <div className="choices">
      {options.map(([v, label]) => (
        <label key={label}>
          {/* 選ばれている答えをタップしても次へ進むよう、change ではなく click で答える */}
          <input
            type="radio"
            name={name}
            readOnly
            checked={value === v}
            onClick={() => answer(patch(v))}
          />
          {label}
        </label>
      ))}
    </div>
  )

  const toggleMustUse = (name: string) =>
    setAnswers((a) => ({
      ...a,
      mustUse: a.mustUse.includes(name)
        ? a.mustUse.filter((n) => n !== name)
        : [...a.mustUse, name],
    }))

  return (
    <section className="card interview">
      {step === 'confirm' ? (
        <Confirm answers={answers} onEdit={setStep} />
      ) : (
        <fieldset aria-labelledby={headingId}>
          <p className="progress">
            {questionNumber(step)} / {QUESTION_COUNT}
          </p>
          <h2 id={headingId}>{QUESTIONS[step]}</h2>
          {step === 'minutes' &&
            choice('maxMinutes', MINUTES, answers.maxMinutes, (v) => ({ maxMinutes: v }))}
          {step === 'shopping' &&
            choice('allowShopping', SHOPPING, answers.allowShopping, (v) => ({
              allowShopping: v,
            }))}
          {step === 'mustUse' &&
            (stock.length > 0 ? (
              <div className="choices wrap">
                {mustUseCandidates(stock).map((c) => (
                  <MustUseChoice
                    key={c.name}
                    candidate={c}
                    today={today}
                    checked={answers.mustUse.includes(c.name)}
                    onToggle={() => toggleMustUse(c.name)}
                  />
                ))}
              </div>
            ) : (
              <p className="hint">
                {stockLoaded ? '在庫に食材がありません' : '在庫を読み込んでいます…'}
              </p>
            ))}
          {step === 'soup' && choice('soup', SOUP, answers.soup, (v) => ({ soup: v }))}
          {step === 'side' &&
            choice('sideMicrowave', SIDE, answers.sideMicrowave, (v) => ({ sideMicrowave: v }))}
          {step === 'mood' && (
            <input
              aria-labelledby={headingId}
              value={answers.mood}
              maxLength={200}
              placeholder="例: 和食でさっぱり"
              onChange={(e) => setAnswers((a) => ({ ...a, mood: e.target.value }))}
            />
          )}
        </fieldset>
      )}
      <div className="interview-actions">
        {back && (
          <button type="button" className="secondary" onClick={() => setStep(back)}>
            戻る
          </button>
        )}
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            やめる
          </button>
        )}
        {(step === 'mustUse' || step === 'mood') && (
          <button type="button" className="primary" onClick={forward}>
            次へ
          </button>
        )}
        {step === 'confirm' && (
          <button
            type="button"
            className="primary"
            disabled={loading}
            onClick={() => onSubmit(answers)}
          >
            献立を提案してもらう
          </button>
        )}
      </div>
    </section>
  )
}

function MustUseChoice({
  candidate: c,
  today,
  checked,
  onToggle,
}: {
  candidate: MustUseCandidate
  today: IsoDate
  checked: boolean
  onToggle: () => void
}) {
  const id = useId()
  const days = formatDaysLeft(c.expiresOn, today)
  return (
    <label data-expiry={expiryStatus(c.expiresOn, today)}>
      <input
        type="checkbox"
        name={c.name}
        checked={checked}
        aria-labelledby={`${id}-name`}
        aria-describedby={days ? `${id}-expiry` : undefined}
        onChange={onToggle}
      />
      <span id={`${id}-name`}>{c.name}</span>
      {days && (
        <small id={`${id}-expiry`} className="days-left">
          {days}
          {c.estimated && '・目安'}
        </small>
      )}
    </label>
  )
}

function Confirm({
  answers: a,
  onEdit,
}: {
  answers: MealConditions
  onEdit: (step: InterviewStep) => void
}) {
  const rows: [InterviewStep, string, string][] = [
    ['minutes', '調理時間', labelOf(MINUTES, a.maxMinutes)],
    ['shopping', '食材', labelOf(SHOPPING, a.allowShopping)],
    ['mustUse', '使いたい食材', a.mustUse.join('、') || 'なし'],
    ['soup', '汁物', labelOf(SOUP, a.soup)],
    ['side', '副菜', labelOf(SIDE, a.sideMicrowave)],
    ['mood', '気分', a.mood.trim() || 'なし'],
  ]
  return (
    <>
      <h2>この条件で提案します</h2>
      <ul className="answers">
        {rows.map(([step, label, value]) => (
          <li key={step}>
            <button type="button" onClick={() => onEdit(step)}>
              <span className="answer-label">{label}</span>
              <span>{value}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
