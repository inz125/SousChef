import { useEffect, useId, useState, type FormEvent } from 'react'
import { addChips, type MemberPreferences } from '../domain/preferences'
import { missingIllustrations } from '../illustrations/illustrations'
import type { InventoryRepository } from '../inventory/InventoryRepository'
import type { ShoppingRepository } from '../shopping/ShoppingRepository'
import type { SettingsRepository } from './SettingsRepository'

type Props = {
  repo: SettingsRepository
  /** 常備食品（D-71） */
  shopping: ShoppingRepository
  /** イラスト待ちの食材を補完候補から探す（D-56） */
  inventory: InventoryRepository
  me: string
  onSignOut: () => void
}

export function SettingsScreen({ repo, shopping, inventory, me, onSignOut }: Props) {
  const [members, setMembers] = useState<MemberPreferences[] | null>(null)
  const [staples, setStaples] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([repo.members(), repo.staples()])
      .then(([list, s]) => {
        // 自分を先頭に
        setMembers(list.toSorted((a, b) => Number(b.email === me) - Number(a.email === me)))
        setStaples(s)
      })
      .catch(() => setError('設定を読み込めませんでした'))
  }, [repo, me])

  return (
    <section className="settings">
      {error && <p role="alert">{error}</p>}
      {members?.map((m) => (
        <MemberForm key={m.email} member={m} repo={repo} />
      ))}
      {staples && (
        <section className="card" aria-label="常備調味料">
          <h2>常備調味料</h2>
          <ChipEditor
            label="常備している調味料"
            names={staples}
            onSave={async (next) => {
              await repo.saveStaples(next)
              setStaples(next)
            }}
          />
          <p className="hint">在庫に登録しなくても、ある前提で献立を提案します</p>
        </section>
      )}
      <StockedFoods shopping={shopping} inventory={inventory} />
      <PendingIllustrations inventory={inventory} />
      {/* めったに使わないので一番下に置く（D-41） */}
      <button type="button" className="sign-out" onClick={onSignOut}>
        ログアウト
      </button>
    </section>
  )
}

/** 常備食品（D-71）。切らしたくない食材。献立の常備調味料とは別で、提案には使わない */
function StockedFoods({
  shopping,
  inventory,
}: {
  shopping: ShoppingRepository
  inventory: InventoryRepository
}) {
  const [names, setNames] = useState<string[] | null>(null)
  const [catalog, setCatalog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    shopping
      .stocked()
      .then(setNames)
      .catch(() => setError('常備食品を読み込めませんでした'))
    inventory
      .catalog()
      .then((entries) => setCatalog(entries.map((e) => e.name)))
      .catch(() => {})
  }, [shopping, inventory])

  if (!names) return error && <p role="alert">{error}</p>
  return (
    <section className="card stocked-foods" aria-label="常備食品">
      <h2>常備食品</h2>
      <p className="hint">
        切らしたくない食材です。在庫が「少ない」になったり、なくなったりすると買い物リストに入ります
      </p>
      <ChipEditor
        label="常備食品"
        hideLabel
        names={names}
        suggestions={catalog}
        onSave={async (next) => {
          for (const name of next.filter((n) => !names.includes(n))) await shopping.addStocked(name)
          for (const name of names.filter((n) => !next.includes(n)))
            await shopping.removeStocked(name)
          setNames(await shopping.stocked())
        }}
      />
    </section>
  )
}

/** イラストのない食材名（D-56）。利用者が Claude に伝えると、次の実装でイラストを足す */
function PendingIllustrations({ inventory }: { inventory: InventoryRepository }) {
  const [names, setNames] = useState<string[] | null>(null)

  useEffect(() => {
    inventory
      .catalog()
      .then((entries) => setNames(missingIllustrations(entries.map((e) => e.name))))
      .catch(() => {})
  }, [inventory])

  if (!names) return null
  return (
    <section className="card pending-illustrations" aria-label="イラスト待ち">
      <h2>イラスト待ち</h2>
      {names.length === 0 ? (
        <p className="hint">すべての食材にイラストがあります</p>
      ) : (
        <>
          <p className="hint">次のアップデートでイラストを追加する食材です</p>
          <ul>
            {names.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** 夫婦それぞれの苦手な食材・アレルギー（D-32）。チップで足し・外し、すぐ保存する（D-81） */
function MemberForm({ member, repo }: { member: MemberPreferences; repo: SettingsRepository }) {
  const [prefs, setPrefs] = useState({ dislikes: member.dislikes, allergies: member.allergies })
  const save = async (next: typeof prefs) => {
    await repo.savePreferences(member.email, next)
    setPrefs(next)
  }
  return (
    <section className="card" role="group" aria-label={member.displayName}>
      <h2>{member.displayName}</h2>
      <ChipEditor
        label="苦手な食材"
        names={prefs.dislikes}
        onSave={(dislikes) => save({ ...prefs, dislikes })}
      />
      <ChipEditor
        label="アレルギー"
        names={prefs.allergies}
        onSave={(allergies) => save({ ...prefs, allergies })}
      />
      <p className="hint">アレルギーの食材は献立の提案に一切使いません</p>
    </section>
  )
}

/**
 * 名前のチップの一覧（D-71・D-81）。入力して「追加」（「、」「,」で分けて複数）、「×」で外す。
 * どちらもすぐ onSave で保存し、失敗したら一覧を変えずに知らせる
 */
function ChipEditor({
  label,
  names,
  onSave,
  suggestions,
  hideLabel = false,
}: {
  label: string
  names: string[]
  onSave: (next: string[]) => Promise<void>
  /** 入力の補完候補 */
  suggestions?: string[]
  /** 見出しと同じ名前なら、欄の名前は画面に出さない */
  hideLabel?: boolean
}) {
  const id = useId()
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function save(next: string[]) {
    try {
      await onSave(next)
      return true
    } catch {
      setError('保存できませんでした。通信状況を確認してください')
      return false
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { names: next, duplicates } = addChips(names, input)
    if (duplicates.length > 0) setError(`${duplicates.join('、')}はもう登録しています`)
    if (next.length === names.length) return
    if (await save(next)) setInput('')
  }

  async function remove(name: string) {
    setError(null)
    await save(names.filter((n) => n !== name))
  }

  return (
    <div role="group" aria-label={label} className="chip-editor">
      {!hideLabel && (
        <span className="field-label" aria-hidden="true">
          {label}
        </span>
      )}
      {names.length > 0 && (
        <ul className="chips">
          {names.map((name) => (
            <li key={name}>
              {name}
              {/* 「×」は CSS で描く（一覧の文字に混ぜない） */}
              <button type="button" aria-label={`${name}を外す`} onClick={() => remove(name)} />
            </li>
          ))}
        </ul>
      )}
      <form className="inline-add" onSubmit={add}>
        <input
          aria-label={`${label}を追加`}
          list={suggestions ? `${id}-list` : undefined}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {suggestions && (
          <datalist id={`${id}-list`}>
            {suggestions.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        )}
        <button type="submit">追加</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
