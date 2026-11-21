import {
  InterviewIllustration,
  type InterviewIllustrationName,
} from '../meals/InterviewIllustration'

/** 一覧が空のときの案内。イラストと、次にする操作のボタン（D-82） */
export function EmptyState({
  illustration,
  text,
  action,
  onAction,
  disabled = false,
}: {
  illustration: InterviewIllustrationName
  text: string
  action: string
  onAction: () => void
  disabled?: boolean
}) {
  return (
    <div className="empty-state">
      <InterviewIllustration name={illustration} className="empty-illustration" />
      <p className="empty">{text}</p>
      <button type="button" className="primary" disabled={disabled} onClick={onAction}>
        {action}
      </button>
    </div>
  )
}
