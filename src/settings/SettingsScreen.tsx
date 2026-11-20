import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { formatList, parseList, type MemberPreferences } from '../domain/preferences'
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
        <SaveForm
          label="常備調味料"
          onSave={(fields) => repo.saveStaples(parseList(fields.get('staples') as string))}
        >
          <label>
            常備している調味料
            <textarea name="staples" rows={3} defaultValue={formatList(staples)} />
          </label>
          <p className="hint">在庫に登録しなくても、ある前提で献立を提案します</p>
        </SaveForm>
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
  const listId = useId()
  const [names, setNames] = useState<string[] | null>(null)
  const [catalog, setCatalog] = useState<string[]>([])
  const [input, setInput] = useState('')
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

  async function change(action: () => Promise<void>) {
    setError(null)
    try {
      await action()
      setNames(await shopping.stocked())
    } catch {
      setError('保存できませんでした。通信状況を確認してください')
    }
  }

  function add(e: FormEvent) {
    e.preventDefault()
    const name = input.trim()
    if (!name) return
    if (names?.includes(name)) return setError(`${name}はもう登録しています`)
    change(async () => {
      await shopping.addStocked(name)
      setInput('')
    })
  }

  if (!names) return error && <p role="alert">{error}</p>
  return (
    <section className="card stocked-foods" aria-label="常備食品">
      <h2>常備食品</h2>
      <p className="hint">
        切らしたくない食材です。在庫が「少ない」になったり、なくなったりすると買い物リストに入ります
      </p>
      <ul className="chips">
        {names.map((name) => (
          <li key={name}>
            {name}
            <button
              type="button"
              aria-label={`${name}を外す`}
              onClick={() => change(() => shopping.removeStocked(name))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form className="inline-add" onSubmit={add}>
        <input
          aria-label="常備食品を追加"
          list={listId}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <datalist id={listId}>
          {catalog.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <button type="submit">追加</button>
      </form>
      {error && <p role="alert">{error}</p>}
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

function MemberForm({ member, repo }: { member: MemberPreferences; repo: SettingsRepository }) {
  return (
    <SaveForm
      label={member.displayName}
      onSave={(fields) =>
        repo.savePreferences(member.email, {
          dislikes: parseList(fields.get('dislikes') as string),
          allergies: parseList(fields.get('allergies') as string),
        })
      }
    >
      <label>
        苦手な食材
        <input name="dislikes" defaultValue={formatList(member.dislikes)} />
      </label>
      <label>
        アレルギー
        <input name="allergies" defaultValue={formatList(member.allergies)} />
      </label>
      <p className="hint">「、」で区切って入力。アレルギーの食材は献立の提案に一切使いません</p>
    </SaveForm>
  )
}

/** 見出しつきの保存フォーム。保存結果をフォーム内に表示する */
function SaveForm({
  label,
  onSave,
  children,
}: {
  label: string
  onSave: (fields: FormData) => Promise<void>
  children: ReactNode
}) {
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('idle')
    try {
      await onSave(new FormData(e.currentTarget))
      setStatus('saved')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <form className="card" role="group" aria-label={label} onSubmit={submit}>
      <h2>{label}</h2>
      {children}
      <button type="submit">保存する</button>
      {status === 'saved' && <p className="saved">保存しました</p>}
      {status === 'failed' && <p role="alert">保存できませんでした。通信状況を確認してください</p>}
    </form>
  )
}
