/** 下部タブのアイコン（D-55）。選択中は塗りつぶし、それ以外は線で描く */
export type TabIconName = 'inventory' | 'meals' | 'recipes' | 'settings'

export function TabIcon({ name, filled }: { name: TabIconName; filled: boolean }) {
  // 塗りつぶしのときは形を文字色で塗り、内側の線を背景色で抜く
  const body = filled
    ? { fill: 'currentColor', stroke: 'currentColor' }
    : { fill: 'none', stroke: 'currentColor' }
  const detail = filled ? 'var(--surface)' : 'currentColor'
  return (
    <svg
      aria-hidden="true"
      data-filled={String(filled)}
      viewBox="0 0 24 24"
      width="26"
      height="26"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === 'inventory' && (
        <>
          <rect x="5" y="2" width="14" height="20" rx="2.5" {...body} />
          <path d="M5 9.5h14" stroke={detail} fill="none" />
          <path d="M8.5 5v2M8.5 12.5v3.5" stroke={detail} fill="none" />
        </>
      )}
      {name === 'meals' && (
        <>
          <path d="M4 11h16v5.5a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5Z" {...body} />
          <path d="M4 8.5h16" stroke="currentColor" fill="none" />
          <path d="M10 8.5a2 2 0 0 1 4 0" stroke="currentColor" fill="none" />
          <path d="M1.5 12.5H4M20 12.5h2.5" stroke="currentColor" fill="none" />
        </>
      )}
      {name === 'recipes' && (
        <>
          <path
            d="M12 6.5C10 5 7 4.5 3 5v14c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5Z"
            {...body}
          />
          <path d="M12 6.5V20" stroke={detail} fill="none" />
        </>
      )}
      {name === 'settings' && (
        <>
          <g {...body}>
            {[0, 45, 90, 135].map((deg) => (
              <rect
                key={deg}
                x="10.5"
                y="1.8"
                width="3"
                height="20.4"
                rx="1"
                transform={`rotate(${deg} 12 12)`}
              />
            ))}
          </g>
          <circle cx="12" cy="12" r="6.6" {...body} />
          {/* 線のときは歯の付け根の線を円で隠す */}
          {!filled && <circle cx="12" cy="12" r="5.8" fill="var(--surface)" stroke="none" />}
          <circle
            cx="12"
            cy="12"
            r="2.6"
            fill={filled ? 'var(--surface)' : 'none'}
            stroke={detail}
          />
        </>
      )}
    </svg>
  )
}
