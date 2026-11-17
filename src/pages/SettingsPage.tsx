import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSetting, setSetting, exportAll, importAll } from '../lib/db'
import { PROVIDER_IDS, TASKS, getRouting, providers, runTask, type ModelInfo, type ProviderId, type TaskId, type TaskRouting } from '../lib/ai'
import { useApp } from '../components/AppState'
import { CloudPanel } from '../components/CloudStatus'

const PROVIDER_NOTES: Record<ProviderId, React.ReactNode> = {
  google: <>
    <b>Gratuito.</b> Crea la chiave su <a className="y" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a> con il tuo account Google (non serve carta).
    Limiti al minuto e al giorno; sul piano gratuito Google può usare le richieste per migliorare i suoi prodotti: evita di inviare materiale riservato. È l'unico che può <b>ascoltare</b> l'audio.
  </>,
  anthropic: <>
    <b>A pagamento, separato dall'abbonamento Claude.</b> Chiave su <a className="y" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>, consumo con credito prepagato.
    Senza chiave puoi comunque usare Claude con il tuo abbonamento tramite il pulsante <b>“Copia per Claude”</b> nel Music Lab.
  </>,
}

export default function SettingsPage() {
  const { toast } = useApp()
  const [trial, setTrial] = useState<{ busy: boolean; out?: string; err?: string }>({ busy: false })
  const fileRef = useRef<HTMLInputElement>(null)
  const [refresh, setRefresh] = useState(0)
  const [includeAudio, setIncludeAudio] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)

  const keys = useLiveQuery(() => getSetting<Record<string, string>>('apiKeys', {}), [refresh])
  const hasAny = keys && Object.values(keys).some(Boolean)

  async function trialCall() {
    setTrial({ busy: true })
    try {
      const r = await runTask('fast', {
        system: 'Rispondi in italiano, in una sola frase breve.',
        messages: [{ role: 'user', content: 'Conferma che la connessione con GENOS AI STUDIO funziona.' }],
        maxTokens: 300,
      })
      setTrial({ busy: false, out: `${r.text.trim()}  —  [${r.model} · ${r.inputTokens ?? '?'} in / ${r.outputTokens ?? '?'} out token]` })
    } catch (e) {
      setTrial({ busy: false, err: (e as Error).message })
    }
  }

  async function doExport() {
    setBackupBusy(true)
    try {
      const blob = await exportAll({ includeAudio })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `genos-backup-${new Date().toISOString().slice(0, 10)}${includeAudio ? '-con-audio' : ''}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10000)
      toast(`Backup pronto (${(blob.size / 1048576).toFixed(1)} MB)`)
    } catch (e) {
      toast(`Backup non riuscito: ${(e as Error).message}`, 'err')
    } finally { setBackupBusy(false) }
  }

  async function doImport(f: File) {
    setBackupBusy(true)
    try {
      const st = await importAll(await f.text())
      toast(`Importati: ${st.projects} progetti, ${st.tracks} brani, ${st.versions} versioni, ${st.texts} tra diagnosi/chat/note${st.audio ? `, ${st.audio} file audio` : ''}`)
    } catch (e) { toast((e as Error).message, 'err') } finally { setBackupBusy(false) }
  }

  return (
    <div className="page">
      <div className="label">// Impostazioni</div>
      <h1 className="display">Setup</h1>

      <section className="section">
        <div className="section-head"><span className="num">00</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Sincronizzazione</h2></div>
        <CloudPanel />
      </section>

      <section className="section">
        <div className="section-head"><span className="num">01</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Chiavi AI</h2></div>
        <p className="dim" style={{ marginTop: -6, fontSize: 13 }}>Le chiavi restano salvate solo su questo dispositivo. Basta una delle due; con entrambe l'app sceglie la più adatta a ogni compito.</p>
        {(['google', 'anthropic'] as ProviderId[]).map((p) => <ProviderCard key={p} id={p} onChange={() => setRefresh((r) => r + 1)} />)}
      </section>

      <section className="section">
        <div className="section-head"><span className="num">02</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Modello per compito</h2></div>
        <RoutingEditor refresh={refresh} />
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn sm" disabled={!hasAny || trial.busy} onClick={trialCall}>
            {trial.busy ? <><div className="spinner" /> Invio…</> : 'Prova una richiesta reale'}
          </button>
          <span className="label">usa il modello "Veloce"</span>
        </div>
        {trial.out && <div className="notice ok" style={{ marginTop: 12 }}>{trial.out}</div>}
        {trial.err && <div className="notice err" style={{ marginTop: 12 }}>{trial.err}</div>}
      </section>

      <section className="section">
        <div className="section-head"><span className="num">03</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Backup</h2></div>
        <p className="dim" style={{ marginTop: -6, fontSize: 13 }}>Tutto è salvato nel browser di questo dispositivo: se cancelli i dati del browser lo perdi, e telefono e PC hanno archivi separati. Il backup contiene progetti, testi del Video Lab e tutto il Music Lab (brani, testi delle canzoni, versioni con le analisi, diagnosi, conversazioni Ableton, concept beat, reference). Non contiene le chiavi API né le immagini di moodboard e schede. I file audio solo se spunti l'opzione qui sotto.</p>
        <label className="row" style={{ gap: 8, fontSize: 14, marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={includeAudio} onChange={(e) => setIncludeAudio(e.target.checked)} style={{ accentColor: 'var(--y)', width: 18, height: 18 }} />
          Includi i file audio <span className="label">(file molto più grande: ~1,4 volte i tuoi audio. Meglio da PC)</span>
        </label>
        <div className="row">
          <button className="btn" disabled={backupBusy} onClick={doExport}>{backupBusy ? <><div className="spinner" /> Attendi…</> : 'Esporta backup'}</button>
          <button className="btn ghost" disabled={backupBusy} onClick={() => fileRef.current?.click()}>Importa backup</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
        </div>
      </section>
    </div>
  )
}

function ProviderCard({ id, onChange }: { id: ProviderId; onChange: () => void }) {
  const prov = providers[id]
  const { toast } = useApp()
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState('')
  const [show, setShow] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => { getSetting<Record<string, string>>('apiKeys', {}).then((k) => { setKey(k[id] ?? ''); setSaved(k[id] ?? '') }) }, [id])

  async function saveAndTest() {
    setTesting(true); setStatus(null)
    try {
      const list = await prov.testConnection(key)
      const keys = await getSetting<Record<string, string>>('apiKeys', {})
      await setSetting('apiKeys', { ...keys, [id]: key.trim() })
      await setSetting(`models.${id}`, list)
      setSaved(key.trim())
      setStatus({ kind: 'ok', text: `Connessione riuscita. ${list.length} modelli disponibili.` })
      toast('Chiave salvata'); onChange()
    } catch (e) {
      setStatus({ kind: 'err', text: (e as Error).message })
    } finally { setTesting(false) }
  }

  async function remove() {
    if (!confirm(`Rimuovere la chiave ${prov.label} da questo dispositivo?`)) return
    const keys = await getSetting<Record<string, string>>('apiKeys', {})
    delete keys[id]
    await setSetting('apiKeys', keys)
    await setSetting(`models.${id}`, [])
    setKey(''); setSaved(''); setStatus(null)
    toast('Chiave rimossa'); onChange()
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row"><h2 className="display" style={{ fontSize: '1.1rem' }}>{prov.label}</h2><div className="spacer" />{saved ? <span className="tag solid">Attiva</span> : <span className="tag">Non configurata</span>}</div>
      <p className="dim" style={{ fontSize: 13 }}>{PROVIDER_NOTES[id]}</p>
      <div className="row" style={{ alignItems: 'stretch' }}>
        <input className="input mono" style={{ flex: '1 1 240px' }} type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false}
          value={key} onChange={(e) => setKey(e.target.value)} placeholder={`${prov.keyPrefix}...`} aria-label={`Chiave ${prov.label}`} />
        <button className="btn ghost sm" type="button" onClick={() => setShow((s) => !s)}>{show ? 'Nascondi' : 'Mostra'}</button>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary sm" disabled={!key.trim() || testing} onClick={saveAndTest}>{testing ? <><div className="spinner" /> Verifica…</> : 'Salva e verifica'}</button>
        {saved && <button className="btn danger sm" onClick={remove}>Rimuovi</button>}
      </div>
      {status && <div className={`notice ${status.kind}`} style={{ marginTop: 12 }}>{status.text}</div>}
    </div>
  )
}

function RoutingEditor({ refresh }: { refresh: number }) {
  const [routing, setRouting] = useState<Partial<Record<TaskId, TaskRouting>>>({})
  const [models, setModels] = useState<Record<ProviderId, ModelInfo[]>>({ anthropic: [], google: [] })
  const [keys, setKeys] = useState<Record<string, string>>({})

  useEffect(() => {
    (async () => {
      setKeys(await getSetting('apiKeys', {}))
      const m = { anthropic: [], google: [] } as Record<ProviderId, ModelInfo[]>
      for (const p of PROVIDER_IDS) m[p] = await getSetting<ModelInfo[]>(`models.${p}`, [])
      setModels(m)
      setRouting(await getRouting())
    })()
  }, [refresh])

  async function change(task: TaskId, value: string) {
    const [provider, model] = value.split('|') as [ProviderId, string]
    const saved = await getSetting<Partial<Record<TaskId, TaskRouting>>>('routing', {})
    await setSetting('routing', { ...saved, [task]: { provider, model } })
    setRouting(await getRouting())
  }

  const active = PROVIDER_IDS.filter((p) => keys[p])
  if (!active.length) return <div className="notice">Aggiungi almeno una chiave per scegliere i modelli.</div>

  return (
    <>
      <p className="dim" style={{ marginTop: -6, fontSize: 13 }}>Scelti automaticamente in base alle chiavi disponibili; puoi cambiarli. I modelli più potenti costano di più (o consumano più quota gratuita).</p>
      {(Object.keys(TASKS) as TaskId[]).map((t) => {
        const r = routing[t]
        const provs = active.filter((p) => !TASKS[t].needsAudio || providers[p].canListen)
        return (
          <div key={t} className="list-item" style={{ alignItems: 'center' }}>
            <div className="grow"><b>{TASKS[t].label}</b><div className="label">{TASKS[t].hint}</div></div>
            {provs.length === 0 ? <span className="tag">richiede Gemini</span> : (
              <select className="select mono" style={{ width: 'auto', maxWidth: '58%', fontSize: 12 }} value={r ? `${r.provider}|${r.model}` : ''} onChange={(e) => change(t, e.target.value)}>
                {provs.map((p) => (
                  <optgroup key={p} label={providers[p].label}>
                    {models[p].map((m) => <option key={m.id} value={`${p}|${m.id}`}>{m.id}</option>)}
                  </optgroup>
                ))}
              </select>
            )}
          </div>
        )
      })}
    </>
  )
}
