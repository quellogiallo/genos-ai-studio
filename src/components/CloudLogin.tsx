import { useEffect, useState } from 'react'
import { useObservable } from 'dexie-react-hooks'
import { db, CLOUD_ENABLED } from '../lib/db'

/** Testi italiani per i passaggi di accesso (i testi del server sono in inglese). */
const TITLES: Record<string, string> = {
  email: 'Accedi per sincronizzare',
  otp: 'Inserisci il codice',
  'message-alert': 'Avviso',
  'logout-confirmation': 'Uscire dall\'account?',
}
const HINTS: Record<string, string> = {
  email: 'Usa sempre la stessa email su tutti i dispositivi: riceverai un codice di accesso.',
  otp: 'Controlla la tua email (anche lo spam) e incolla il codice ricevuto.',
  'logout-confirmation': 'Ci sono modifiche non ancora sincronizzate: se esci ora andranno perse su questo dispositivo.',
}
const ERRORS: Record<string, string> = {
  INVALID_OTP: 'Codice non valido o scaduto.',
  INVALID_EMAIL: 'Email non valida.',
  LICENSE_LIMIT_REACHED: 'Limite di utenti del piano gratuito raggiunto.',
  NO_SEATS_AVAILABLE: 'Nessun posto disponibile nel piano gratuito.',
  USER_DEACTIVATED: 'Questo utente è disattivato.',
}

/** Finestra di accesso della sincronizzazione cloud (email → codice). */
export default function CloudLogin() {
  if (!CLOUD_ENABLED) return null
  return <CloudLoginInner />
}

function CloudLoginInner() {
  const ui = useObservable(db.cloud.userInteraction)
  const [values, setValues] = useState<Record<string, string>>({})
  useEffect(() => setValues({}), [ui])
  if (!ui) return null

  const fields = Object.entries(ui.fields ?? {}) as [string, { type: string; label?: string; placeholder?: string }][]
  return (
    <div className="modal-back" role="dialog" aria-modal="true">
      <form className="modal" onSubmit={(e) => { e.preventDefault(); ui.onSubmit(values) }}>
        <div className="label y">Sincronizzazione</div>
        <h2 className="display" style={{ fontSize: '1.5rem', marginTop: 6 }}>{TITLES[ui.type] ?? ui.title}</h2>
        {HINTS[ui.type] && <p className="dim" style={{ fontSize: 14 }}>{HINTS[ui.type]}</p>}
        {ui.alerts?.map((a, i) => (
          <div key={i} className={`notice ${a.type === 'error' ? 'err' : ''}`} style={{ margin: '10px 0', fontSize: 13 }}>
            {(a.type === 'error' && ERRORS[a.messageCode]) || (/could not connect/i.test(a.message) ? 'Impossibile contattare il server di sincronizzazione. Controlla la connessione e riprova.' : a.message)}
          </div>
        ))}
        {fields.map(([name, f], i) => (
          <div className="field" key={name}>
            {f.label && <label className="label" htmlFor={`f-${name}`}>{name === 'otp' ? 'Codice' : f.label}</label>}
            <input id={`f-${name}`} className="input" autoFocus={i === 0}
              type={name === 'email' ? 'email' : 'text'} inputMode={name === 'otp' ? 'numeric' : undefined}
              autoComplete={name === 'email' ? 'email' : name === 'otp' ? 'one-time-code' : 'off'}
              placeholder={name === 'email' ? 'la-tua@email.it' : f.placeholder}
              value={values[name] ?? ''} onChange={(e) => setValues({ ...values, [name]: e.target.value.trim() })} />
          </div>
        ))}
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn primary">{ui.type === 'email' ? 'Invia codice' : ui.type === 'otp' ? 'Accedi' : ui.type === 'logout-confirmation' ? 'Esci comunque' : 'OK'}</button>
          {ui.cancelLabel && <button type="button" className="btn ghost" onClick={() => ui.onCancel()}>Annulla</button>}
        </div>
      </form>
    </div>
  )
}
