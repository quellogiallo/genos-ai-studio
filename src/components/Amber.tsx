/** Pietra d'ambra che gira con la percentuale sopra: il caricamento di GENOS AI STUDIO. */
export default function Amber({ pct, label, size = 112 }: { pct?: number | null; label?: string; size?: number }) {
  const n = pct == null || Number.isNaN(pct) ? '…' : `${Math.max(0, Math.min(100, Math.round(pct)))}%`
  return (
    <div className="amber" role="status" aria-live="polite" aria-label={label ? `${label} ${n}` : n}>
      <div className="amber-stone" style={{ width: size, height: size }}>
        <svg className="amber-gem" viewBox="0 0 120 120" aria-hidden="true">
          <defs>
            <radialGradient id="amberG" cx="45%" cy="38%" r="70%">
              <stop offset="0" stopColor="#ffe9a0" /><stop offset=".45" stopColor="#f3bf28" /><stop offset="1" stopColor="#9a5f00" />
            </radialGradient>
          </defs>
          <polygon points="60,6 93,19 113,51 105,89 75,113 37,109 10,82 12,40 33,15" fill="url(#amberG)" />
          <g stroke="#fce6a6" strokeOpacity=".35" strokeWidth=".8">
            <polygon points="57,58 60,6 93,19" fill="#ffd24a" fillOpacity=".55" />
            <polygon points="57,58 93,19 113,51" fill="#f3bf28" fillOpacity=".35" />
            <polygon points="57,58 113,51 105,89" fill="#bd8903" fillOpacity=".6" />
            <polygon points="57,58 105,89 75,113" fill="#8a5300" fillOpacity=".55" />
            <polygon points="57,58 75,113 37,109" fill="#a86d00" fillOpacity=".45" />
            <polygon points="57,58 37,109 10,82" fill="#c98f05" fillOpacity=".4" />
            <polygon points="57,58 10,82 12,40" fill="#e0a812" fillOpacity=".35" />
            <polygon points="57,58 12,40 33,15" fill="#ffdc6e" fillOpacity=".5" />
            <polygon points="57,58 33,15 60,6" fill="#fff0b8" fillOpacity=".45" />
          </g>
          <g fill="#5a3200" fillOpacity=".55"><circle cx="82" cy="78" r="2.4" /><circle cx="88" cy="72" r="1.2" /><circle cx="36" cy="84" r="1.6" /><circle cx="70" cy="34" r="1" /></g>
          <path d="M30 26 L48 14" stroke="#fffbe8" strokeWidth="3" strokeLinecap="round" opacity=".8" />
        </svg>
        <span className="amber-n" style={{ fontSize: Math.round(size * 0.21) }}>{n}</span>
      </div>
      {label && <div className="amber-label">{label}</div>}
    </div>
  )
}
