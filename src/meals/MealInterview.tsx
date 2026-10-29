import { useId, useState } from 'react'
import { expiryStatus } from '../domain/expiry'
import type { IsoDate } from '../domain/food'
import type { InventoryItem } from '../domain/inventory'
import { FoodIllustration } from '../illustrations/FoodIllustration'
import { NOODLE_LABELS, type Noodle } from '../../supabase/functions/_shared/meals.ts'
import {
  fitAnswers,
  formatDaysLeft,
  mustUseCandidates,
  nextStep,
  noodleChoices,
  previousStep,
  QUESTION_COUNT,
  questionNumber,
  type InterviewStep,
  type MustUseCandidate,
} from '../domain/mealInterview'
import { InterviewIllustration, type InterviewIllustrationName } from './InterviewIllustration'
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

/** 答えの値・表示名・タイルのイラスト（D-62） */
type Option<T> = readonly [T, string, InterviewIllustrationName]

const MINUTES: Option<MealConditions['maxMinutes']>[] = [
  [15, '15 分', 'timer-15'],
  [30, '30 分', 'timer-30'],
  [45, '45 分', 'timer-45'],
  [null, '指定なし', 'yunomi'],
]
const SHOPPING: Option<boolean>[] = [
  [false, '在庫のみ', 'fridge'],
  [true, '買い足し OK', 'basket-veg'],
]
const RICE: Option<boolean>[] = [
  [true, '炊いてある', 'rice-steam'],
  [false, '炊いてない', 'rice-bag'],
]
const SOUP: Option<boolean>[] = [
  [true, 'あり', 'soup-steam'],
  [false, 'なし', 'soup-empty'],
]
const SIDE_DISH: Option<boolean>[] = [
  [true, 'あり', 'kobachi-full'],
  [false, 'なし', 'kobachi-empty'],
]
const SIDE: Option<boolean>[] = [
  [false, 'どちらでも', 'pan-microwave'],
  [true, 'レンジで', 'microwave'],
]

const QUESTIONS: Record<Exclude<InterviewStep, 'confirm'>, string> = {
  minutes: '調理時間はどのくらい？',
  shopping: '食材を買い足してもいい？',
  rice: 'ご飯は炊いてある？',
  noodle: '主食の麺はどれにする？',
  mustUse: '使いたい食材はある？',
  soup: '汁物はつける？',
  sideDish: '副菜はつける？',
  side: '副菜はレンジで作る？',
  mood: '気分やリクエストはある？',
}

/** 見出しの上・確認画面の行に出す質問のイラスト（D-62） */
const QUESTION_ILLUSTRATIONS: Record<
  Exclude<InterviewStep, 'confirm'>,
  InterviewIllustrationName
> = {
  minutes: 'clock',
  shopping: 'basket',
  rice: 'rice-bowl',
  noodle: 'noodle-bowl',
  mustUse: 'fridge-open',
  soup: 'soup-bowl',
  sideDish: 'kobachi',
  side: 'microwave',
  mood: 'speech',
}

const NOODLE_ILLUSTRATIONS: Record<Noodle, InterviewIllustrationName> = {
  udon: 'udon-bowl',
  pasta: 'pasta-plate',
  soba: 'zaru-soba',
}

const labelOf = <T,>(options: Option<T>[], value: T) => options.find(([v]) => v === value)![1]

/** 献立提案の条件を 1 問ずつ聞くインタビュー（D-53・D-54） */
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
  const [raw, setAnswers] = useState(initial)
  const hasStock = !stockLoaded || stock.length > 0
  // 麺は今の答え（在庫のみ / 買い足し OK）と在庫に合うものだけ残す。在庫を読み込むまでは判定しない
  const choices = (a: MealConditions) => noodleChoices(stock, a.allowShopping)
  const fit = (a: MealConditions) => (stockLoaded ? fitAnswers(a, choices(a)) : a)
  const answers = fit(raw)
  const back = previousStep(step, { hasStock, answers })
  const goNext = (a: MealConditions) =>
    setStep(nextStep(step, { hasStock, answers: a }) ?? 'confirm')
  const forward = () => goNext(answers)
  const answer = (patch: Partial<MealConditions>) => {
    const next = fit({ ...answers, ...patch })
    setAnswers(next)
    goNext(next)
  }

  const choice = <T,>(name: string, options: Option<T>[], value: T, patch: (v: T) => object) => (
    // イラストつきのタイルを 2 列に並べる（D-62）
    <div className="choice-tiles">
      {options.map(([v, label, illustration]) => (
        <label key={label} className="choice-tile">
          {/* 選ばれている答えをタップしても次へ進むよう、change ではなく click で答える */}
          <input
            type="radio"
            name={name}
            readOnly
            checked={value === v}
            onClick={() => answer(patch(v))}
          />
          <span className="tile-icon">
            <InterviewIllustration name={illustration} className="choice-illustration" />
            {/* ✓ は CSS で描く（ラベルの文字に混ぜない） */}
            {value === v && <span className="check-badge" aria-hidden="true" />}
          </span>
          {label}
        </label>
      ))}
    </div>
  )

  const noodles = choices(answers)

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
          {/* key で質問ごとに作り直し、切り替わるたびにふわっと出す */}
          <InterviewIllustration
            key={step}
            name={QUESTION_ILLUSTRATIONS[step]}
            className="question-illustration"
          />
          <h2 id={headingId}>{QUESTIONS[step]}</h2>
          {step === 'minutes' &&
            choice('maxMinutes', MINUTES, answers.maxMinutes, (v) => ({ maxMinutes: v }))}
          {step === 'shopping' &&
            choice('allowShopping', SHOPPING, answers.allowShopping, (v) => ({
              allowShopping: v,
            }))}
          {step === 'rice' &&
            choice('riceCooked', RICE, answers.riceCooked, (v) => ({ riceCooked: v }))}
          {step === 'noodle' &&
            (!stockLoaded ? (
              <p className="hint">在庫を読み込んでいます…</p>
            ) : noodles.length > 0 ? (
              choice(
                'noodle',
                noodles.map((n): Option<Noodle | null> => [
                  n,
                  NOODLE_LABELS[n],
                  NOODLE_ILLUSTRATIONS[n],
                ]),
                answers.noodle,
                (v) => ({ noodle: v }),
              )
            ) : (
              <p className="hint">在庫に麺がありません。主食なしで提案します</p>
            ))}
          {step === 'mustUse' &&
            (stock.length > 0 ? (
              // 在庫と同じホーム画面風の並び（D-57）
              <div className="food-grid must-use">
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
          {step === 'sideDish' &&
            choice('sideDish', SIDE_DISH, answers.sideDish, (v) => ({ sideDish: v }))}
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
        {(step === 'mustUse' ||
          step === 'mood' ||
          (step === 'noodle' && stockLoaded && noodles.length === 0)) && (
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
    <label className="food-tile" data-expiry={expiryStatus(c.expiresOn, today)}>
      <input
        type="checkbox"
        name={c.name}
        checked={checked}
        aria-labelledby={`${id}-name`}
        aria-describedby={days ? `${id}-expiry` : undefined}
        onChange={onToggle}
      />
      <span className="tile-icon">
        <FoodIllustration name={c.name} />
        {checked && (
          <span className="check-badge" aria-hidden="true">
            ✓
          </span>
        )}
      </span>
      <span id={`${id}-name`} className="tile-name">
        {c.name}
      </span>
      {days && (
        <small id={`${id}-expiry`} className="days-left">
          {/* 「・」の前では改行できないので、改行は「・」と「目安」の間で */}
          <span>
            {days}
            {c.estimated && '・'}
          </span>
          {c.estimated && <span>目安</span>}
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
  const rice = a.riceCooked
    ? '炊いてある'
    : `炊いてない（${a.noodle ? NOODLE_LABELS[a.noodle] : '主食なし'}）`
  const rows: [Exclude<InterviewStep, 'confirm'>, string, string][] = [
    ['minutes', '調理時間', labelOf(MINUTES, a.maxMinutes)],
    ['shopping', '食材', labelOf(SHOPPING, a.allowShopping)],
    ['rice', 'ご飯', rice],
    ['mustUse', '使いたい食材', a.mustUse.join('、') || 'なし'],
    ['soup', '汁物', labelOf(SOUP, a.soup)],
    // 副菜の有無は麺を選んだときだけ聞き、副菜なしならレンジは聞かない（D-54）
    ...(a.noodle
      ? [['sideDish', '副菜の有無', labelOf(SIDE_DISH, a.sideDish)] as ['sideDish', string, string]]
      : []),
    ...(a.sideDish
      ? [['side', '副菜', labelOf(SIDE, a.sideMicrowave)] as ['side', string, string]]
      : []),
    ['mood', '気分', a.mood.trim() || 'なし'],
  ]
  return (
    <>
      <h2>この条件で提案します</h2>
      <ul className="answers">
        {rows.map(([step, label, value]) => (
          <li key={step}>
            <button type="button" onClick={() => onEdit(step)}>
              <InterviewIllustration
                name={QUESTION_ILLUSTRATIONS[step]}
                className="answer-illustration"
              />
              <span className="answer-label">{label}</span>
              <span>{value}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
