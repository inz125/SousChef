import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { formatList, parseList, type MemberPreferences } from '../domain/preferences'
import type { SettingsRepository } from './SettingsRepository'

type Props = { repo: SettingsRepository; me: string }

export function SettingsScreen({ repo, me }: Props) {
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
