import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useObservable } from 'dexie-react-hooks'
import { db, CLOUD_ENABLED } from '../lib/db'
import { cloudUserLabel } from '../lib/cloud'

/** Piccolo indicatore nella barra in alto. */
export function CloudBadge() {
  if (!CLOUD_ENABLED) return null
  return <CloudBadgeInner />
}

function CloudBadgeInner() {
  const user = useObservable(db.cloud.currentUser)
  const sync = useObservable(db.cloud.syncState)
  if (!user?.isLoggedIn) return <Link to="/settings" className="tag" style={{ textDecoration: 'none' }}>Non sincronizzato</Link>
  const expired = sync?.license === 'expired' || user.license?.status === 'expired'
  const p = sync?.phase
  const label = expired ? 'Sync scaduta' : p === 'offline' || sync?.status === 'offline' ? 'Offline' : p === 'error' ? 'Errore sync' : p === 'pushing' || p === 'pulling' ? 'Sync…' : 'Sincronizzato'
  const bad = expired || p === 'error'
  return <Link to="/settings" className={`tag ${bad ? '' : 'y'}`} style={{ textDecoration: 'none', ...(bad ? { borderColor: 'var(--red)', color: 'var(--red)' } : {}) }}>{label}</Link>
}

/** Sezione "Sincronizzazione" in Setup. */
export function CloudPanel() {
  if (!CLOUD_ENABLED) {
    return <div className="notice">La sincronizzazione tra dispositivi non è ancora attiva su questa versione dell'app.</div>
  }
  return <CloudPanelInner />
}

function CloudPanelInner() {
  const user = useObservable(db.cloud.currentUser)
  const sync = useObservable(db.cloud.syncState)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('')
    try { await fn() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  if (!user?.isLoggedIn) {
    return (
      <div>
        <p className="dim" style={{ fontSize: 13, marginTop: -6 }}>Accedi con la tua email per avere gli stessi progetti, brani, testi, analisi, diagnosi e chat su tutti i dispositivi. Restano solo su questo dispositivo: file audio, immagini del Video Lab e chiavi API.</p>
        <button className="btn primary" disabled={busy} onClick={() => run(() => db.cloud.login())}>Accedi e sincronizza</button>
        {err && <div className="notice err" style={{ marginTop: 10 }}>{err}</div>}
      </div>
    )
  }

  const lic = user.license
  return (
    <div>
      <div className="metrics">
        <div className="metric"><div className="label">Account</div><div style={{ marginTop: 6, overflowWrap: 'anywhere' }}><b>{cloudUserLabel(user)}</b></div></div>
        <div className="metric"><div className="label">Stato</div><div style={{ marginTop: 6 }}><b>{phaseLabel(sync?.phase, sync?.status)}</b></div>{sync?.error && <div className="metric-hint" style={{ color: 'var(--red)' }}>{sync.error.message}</div>}</div>
        {lic && <div className="metric"><div className="label">Licenza</div><div style={{ marginTop: 6 }}><b>{lic.type === 'prod' ? 'Definitiva' : lic.type === 'eval' ? 'Prova' : lic.type}</b>{lic.status !== 'ok' && <span style={{ color: 'var(--red)' }}> · {lic.status === 'expired' ? 'scaduta' : 'disattivata'}</span>}</div>{lic.type === 'eval' && lic.evalDaysLeft !== undefined && <div className="metric-hint">{lic.evalDaysLeft} giorni rimasti</div>}</div>}
      </div>
      {lic?.type === 'eval' && (
        <div className="notice" style={{ marginTop: 12, fontSize: 13 }}>
          Il tuo account è in <b>prova</b>: alla scadenza l'app continua a funzionare ma smette di sincronizzare. Per renderlo definitivo (gratis, il piano include 3 utenti): apri <a className="y" href="https://manager.dexie.cloud" target="_blank" rel="noreferrer">manager.dexie.cloud</a>, accedi con la stessa email, apri il database e nella lista utenti passa il tuo utente a <b>production</b>.
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn sm" disabled={busy} onClick={() => run(() => db.cloud.sync({ wait: true, purpose: 'pull' }))}>{busy ? <><div className="spinner" /> Sincronizzo…</> : 'Sincronizza ora'}</button>
        <button className="btn ghost sm" disabled={busy} onClick={() => run(() => db.cloud.logout())}>Esci</button>
      </div>
      {err && <div className="notice err" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  )
}

function phaseLabel(p?: string, s?: string) {
  if (s === 'offline' || p === 'offline') return 'Offline: sincronizzerà al ritorno della rete'
  switch (p) {
    case 'in-sync': return 'Sincronizzato'
    case 'pushing': return 'Invio modifiche…'
    case 'pulling': return 'Ricezione modifiche…'
    case 'error': return 'Errore'
    case 'not-in-sync': return 'In attesa di sincronizzare'
    default: return 'Avvio…'
  }
}
