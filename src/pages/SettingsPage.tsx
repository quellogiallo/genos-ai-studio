import { useEffect, useRef, useState } from 'react'
import { getSetting, setSetting, exportAll, importAll } from '../lib/db'
import { DEFAULT_ROUTING, TASKS, getRouting, providers, runTask, type ModelInfo, type TaskId, type TaskRouting } from '../lib/ai'
import { useApp } from '../components/AppState'

export default function SettingsPage() {
  const { toast } = useApp()
  const [key, setKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [show, setShow] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [routing, setRouting] = useState<Record<TaskId, TaskRouting>>(DEFAULT_ROUTING)
  const [trial, setTrial] = useState<{ busy: boolean; out?: string; err?: string }>({ busy: false })
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getSetting<Record<string, string>>('apiKeys', {}).then((k) => { setKey(k.anthropic ?? ''); setSavedKey(k.anthropic ?? '') })
    getSetting<ModelInfo[]>('models.anthropic', []).then(setModels)
    getRouting().then(setRouting)
  }, [])

  async function saveAndTest() {
    setTesting(true); setStatus(null)
    try {
      const list = await providers.anthropic.testConnection(key)
      const keys = await getSetting<Record<string, string>>('apiKeys', {})
      await setSetting('apiKeys', { ...keys, anthropic: key.trim() })
      await setSetting('models.anthropic', list)
      setSavedKey(key.trim()); setModels(list)
      setStatus({ kind: 'ok', text: `Connessione riuscita. ${list.length} modelli disponibili per la tua chiave.` })
      toast('Chiave salvata')
    } catch (e) {
      setStatus({ kind: 'err', text: (e as Error).message })
    } finally {
      setTesting(false)
    }
  }

  async function removeKey() {
    if (!confirm('Rimuovere la chiave API da questo dispositivo?')) return
    const keys = await getSetting<Record<string, string>>('apiKeys', {})
    delete keys.anthropic
    await setSetting('apiKeys', keys)
    await setSetting('models.anthropic', [])
    setKey(''); setSavedKey(''); setModels([]); setStatus(null)
    toast('Chiave rimossa')
  }

  async function changeRoute(task: TaskId, model: string) {
    const next = { ...routing, [task]: { provider: 'anthropic' as const, model } }
    setRouting(next)
    await setSetting('routing', next)
  }

  async function trialCall() {
    setTrial({ busy: true })
    try {
      const r = await runTask('fast', {
        system: 'Rispondi in italiano, in una sola frase breve.',
        messages: [{ role: 'user', content: 'Conferma che la connessione con GENOS AI STUDIO funziona.' }],
        maxTokens: 60,
      })
      setTrial({ busy: false, out: `${r.text}  —  [${r.model} · ${r.inputTokens ?? '?'} in / ${r.outputTokens ?? '?'} out token]` })
    } catch (e) {
      setTrial({ busy: false, err: (e as Error).message })
    }
  }

  async function doExport() {
    const json = await exportAll()
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `genos-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function doImport(f: File) {
    try {
      const n = await importAll(await f.text())
      toast(`${n} progetti importati`)
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  const modelOptions = (current: string) => {
    const ids = new Set(models.map((m) => m.id))
    const list = [...models]
    if (current && !ids.has(current)) list.unshift({ id: current, name: `${current} (non verificato)` })
    return list
  }

  return (
    <div className="page">
      <div className="label">// Impostazioni</div>
      <h1 className="display">Setup</h1>

      <section className="section">
        <div className="section-head"><span className="num">01</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Chiave API Anthropic</h2></div>
        <div className="notice" style={{ marginBottom: 16, fontSize: 14 }}>
          <b>Nota:</b> l'abbonamento Claude (app/chat) e l'API sono separati. La chiave si crea su{' '}
          <a className="y" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>{' '}
          e il consumo si paga a parte con credito prepagato. La chiave resta salvata solo su questo dispositivo.
        </div>
        <div className="field">
          <label className="label" htmlFor="k">Chiave (inizia con sk-ant-)</label>
          <div className="row" style={{ alignItems: 'stretch' }}>
            <input id="k" className="input mono" style={{ flex: '1 1 260px' }} type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false}
              value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-..." />
            <button className="btn ghost sm" type="button" onClick={() => setShow((s) => !s)}>{show ? 'Nascondi' : 'Mostra'}</button>
          </div>
        </div>
        <div className="row">
          <button className="btn primary" disabled={!key.trim() || testing} onClick={saveAndTest}>
            {testing ? <><div className="spinner" /> Verifica…</> : 'Salva e verifica'}
          </button>
          {savedKey && <button className="btn danger sm" onClick={removeKey}>Rimuovi chiave</button>}
          {savedKey && <span className="tag y">Chiave salvata</span>}
        </div>
        {status && <div className={`notice ${status.kind}`} style={{ marginTop: 14 }}>{status.text}</div>}
      </section>

      <section className="section">
        <div className="section-head"><span className="num">02</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Modello per compito</h2></div>
        <p className="dim" style={{ marginTop: -6, fontSize: 13 }}>L'app sceglie il modello in base al tipo di lavoro. I modelli più potenti costano di più per richiesta.</p>
        {models.length === 0 && <div className="notice" style={{ marginBottom: 12 }}>Salva e verifica la chiave per vedere i modelli disponibili.</div>}
        {(Object.keys(TASKS) as TaskId[]).map((t) => (
          <div key={t} className="list-item" style={{ alignItems: 'center' }}>
            <div className="grow">
              <b>{TASKS[t].label}</b>
              <div className="label">{TASKS[t].hint}</div>
            </div>
            <select className="select mono" style={{ width: 'auto', maxWidth: '55%', fontSize: 13 }} value={routing[t].model}
              disabled={models.length === 0} onChange={(e) => changeRoute(t, e.target.value)}>
              {modelOptions(routing[t].model).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        ))}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn sm" disabled={!savedKey || trial.busy} onClick={trialCall}>
            {trial.busy ? <><div className="spinner" /> Invio…</> : 'Prova una richiesta reale'}
          </button>
          <span className="label">usa il modello "Veloce" · costo minimo</span>
        </div>
        {trial.out && <div className="notice ok" style={{ marginTop: 12 }}>{trial.out}</div>}
        {trial.err && <div className="notice err" style={{ marginTop: 12 }}>{trial.err}</div>}
      </section>

      <section className="section">
        <div className="section-head"><span className="num">03</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Backup</h2></div>
        <p className="dim" style={{ marginTop: -6, fontSize: 13 }}>I progetti sono salvati nel browser di questo dispositivo. Esporta un backup ogni tanto: se cancelli i dati del browser, li perdi. Il backup contiene i progetti (concept, decisioni, reference, obiettivi), non la chiave API né i file audio del Music Lab: tieni i tuoi bounce anche altrove.</p>
        <div className="row">
          <button className="btn" onClick={doExport}>Esporta backup</button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>Importa backup</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
        </div>
      </section>
    </div>
  )
}
