import { useMemo, useRef, useState } from 'react'
import AiRunner from '../AiRunner'
import AiNotesList from '../AiNotesList'
import { useApp } from '../AppState'
import { db, uid } from '../../lib/db'
import { analysisPrompt, buildContentContext, type ContentSources } from '../../lib/content/prompts'
import { saveCampaign } from '../../lib/content/hooks'
import { autoMapping, buildRows, computeStats, computedText, readTable, type Mapping, type ParsedTable } from '../../lib/content/stats'
import { METRICS, METRIC_LABEL, PLATFORM_LABEL, FORMAT_LABEL, type Campaign, type ContentFormat, type Metric, type Platform } from '../../lib/content/types'
import { StepHead } from '../video/common'

const n0 = (x: number) => Math.round(x).toLocaleString('it-IT')
const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`)

export default function StatsTab({ c, src }: { c: Campaign; src: ContentSources }) {
  const { toast } = useApp()
  const file = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ name: string; table: ParsedTable; map: Mapping; platform: Platform } | null>(null)
  const [busy, setBusy] = useState(false)
  const [question, setQuestion] = useState('')
  const s = useMemo(() => computeStats(c), [c])

  async function load(f: File) {
    setBusy(true)
    try {
      const table = await readTable(f)
      const map = autoMapping(table.headers)
      const platform: Platform = /insta|ig|meta|facebook/i.test(f.name) || table.headers.some((h) => /copertura|reach|permalink/i.test(h)) ? 'instagram' : 'tiktok'
      setPending({ name: f.name, table, map, platform })
    } catch (e) {
      toast(`File non leggibile: ${(e as Error).message}`, 'err')
    } finally { setBusy(false) }
  }

  async function confirmImport() {
    if (!pending) return
    const rows = buildRows(pending.table, pending.map)
    if (!rows.length) { toast('Nessuna riga con numeri: controlla le colonne scelte.', 'err'); return }
    await saveCampaign(c, { stats: [...c.stats, { id: uid(), platform: pending.platform, fileName: pending.name, importedAt: Date.now(), rows }] })
    setPending(null)
    toast(`${rows.length} righe importate`)
  }

  const maxViews = Math.max(1, ...s.rows.map((r) => r.values.views ?? 0))
  const timeline = [...s.rows].filter((r) => r.date && r.values.views !== undefined).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <section className="section">
      <StepHead num="C4" title="Statistiche" hint="Carica i dati esportati da TikTok o Instagram (CSV o Excel). L'app riconosce le colonne, calcola le metriche e collega i contenuti al calendario; l'AI commenta solo questi numeri." />

      <div className="card">
        <div className="row">
          <button className="btn primary sm" type="button" disabled={busy} onClick={() => file.current?.click()}>{busy ? <><div className="spinner" /> Lettura…</> : 'Carica file di statistiche'}</button>
          <input ref={file} type="file" accept=".csv,.xlsx,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = '' }} />
        </div>
        <details style={{ marginTop: 10, fontSize: 13 }}>
          <summary className="label" style={{ cursor: 'pointer' }}>Come esportare i dati</summary>
          <ul className="dim" style={{ paddingLeft: 18 }}>
            <li><b>TikTok:</b> da computer, TikTok Studio → Analisi (Analytics) → scegli il periodo → Scarica dati. Il percorso può cambiare con gli aggiornamenti dell'app.</li>
            <li><b>Instagram:</b> serve un account professionale. Da computer, Meta Business Suite → Insights → Contenuti → Esporta dati (CSV).</li>
            <li>Più dettaglio c'è per singolo contenuto (titolo, data, link), più l'analisi è utile. I file per giorno funzionano, ma dicono meno.</li>
          </ul>
        </details>
      </div>

      {pending && (
        <div className="card section">
          <div className="label y">Controlla le colonne · {pending.name} · {pending.table.rows.length} righe</div>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="label">Piattaforma</span>
            {(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => <button key={p} type="button" className={`chip ${pending.platform === p ? 'on' : ''}`} onClick={() => setPending({ ...pending, platform: p })}>{PLATFORM_LABEL[p]}</button>)}
          </div>
          <div className="map-grid">
            {([['date', 'Data'], ['title', 'Titolo / descrizione'], ['url', 'Link']] as const).map(([k, l]) => (
              <label key={k} className="map-row"><span>{l}</span>
                <select className="sl-select" value={pending.map[k]} onChange={(e) => setPending({ ...pending, map: { ...pending.map, [k]: Number(e.target.value) } })}>
                  <option value={-1}>—</option>{pending.table.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select></label>
            ))}
            {METRICS.map((m) => (
              <label key={m} className="map-row"><span>{METRIC_LABEL[m]}</span>
                <select className="sl-select" value={pending.map.metrics[m] ?? -1} onChange={(e) => setPending({ ...pending, map: { ...pending.map, metrics: { ...pending.map.metrics, [m]: Number(e.target.value) } } })}>
                  <option value={-1}>—</option>{pending.table.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select></label>
            ))}
          </div>
          <div className="label" style={{ marginTop: 10 }}>Anteprima (prime 3 righe)</div>
          <div className="preview">{buildRows({ ...pending.table, rows: pending.table.rows.slice(0, 3) }, pending.map).map((r, i) => (
            <div key={i} className="mono" style={{ fontSize: 11 }}>{r.date || 's.d.'} · {r.title.slice(0, 40) || '—'} · {Object.entries(r.values).map(([k, v]) => `${METRIC_LABEL[k as Metric]} ${v}`).join(' · ')}</div>
          ))}</div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary sm" type="button" onClick={confirmImport}>Importa</button>
            <button className="btn ghost sm" type="button" onClick={() => setPending(null)}>Annulla</button>
          </div>
        </div>
      )}

      {c.stats.length > 0 && <>
        <div className="section">
          {c.stats.map((imp) => (
            <div key={imp.id} className="list-item">
              <span className="tag solid">{PLATFORM_LABEL[imp.platform]}</span>
              <div className="grow"><b>{imp.fileName}</b><div className="label">{imp.rows.length} righe · importato {new Date(imp.importedAt).toLocaleDateString('it-IT')}</div></div>
              <button className="btn ghost sm" type="button" aria-label="Rimuovi file" onClick={() => confirm('Rimuovere questi dati?') && saveCampaign(c, { stats: c.stats.filter((x) => x.id !== imp.id) })}>×</button>
            </div>
          ))}
        </div>

        <div className="metrics section">
          {s.metrics.slice(0, 6).map((m) => <div key={m} className="metric"><div className="label">{METRIC_LABEL[m]}</div><div className="metric-val">{n0(s.totals[m] ?? 0)}</div></div>)}
          <div className="metric"><div className="label">Engagement mediano</div><div className="metric-val">{pct(s.medianEr)}</div><div className="metric-hint">interazioni / visualizzazioni</div></div>
          <div className="metric"><div className="label">Mediana visual.</div><div className="metric-val">{n0(s.medViews)}</div><div className="metric-hint">per {s.kind === 'contenuti' ? 'contenuto' : 'giorno'}</div></div>
        </div>
        {s.rows.length < 8 && <div className="notice" style={{ marginTop: 10, fontSize: 13 }}>Solo {s.rows.length} righe: i risultati sono indizi, non conclusioni.</div>}

        {timeline.length > 1 && (
          <div className="chart-wrap">
            <div className="chart-legend"><span className="lg y">Visualizzazioni</span><span className="lg mute">{s.kind === 'contenuti' ? 'per contenuto, in ordine di data' : 'per giorno'}</span></div>
            <div className="bars">
              {timeline.map((r, i) => (
                <div key={i} className="bar-col" title={`${r.date} · ${r.title || ''} · ${n0(r.values.views!)}`}>
                  <div className="bar" style={{ height: `${(r.values.views! / maxViews) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="tl-axis" style={{ marginLeft: 8, marginRight: 8 }}><span>{timeline[0].date}</span><span>{timeline[timeline.length - 1].date}</span></div>
          </div>
        )}

        {s.kind === 'contenuti' && s.top.length > 0 && (
          <div className="grid cols-2 section" style={{ gap: 14 }}>
            <div className="card"><div className="label">Migliori</div>{s.top.map((r, i) => <div key={i} className="list-item"><span className="mono y">{n0(r.values.views!)}</span><div className="grow" style={{ fontSize: 13 }}>{r.title || r.date}<div className="label">{r.date} · {r.platform}{s.medViews ? ` · ${(r.values.views! / s.medViews).toFixed(1)}× mediana` : ''}{r.post ? ' · in calendario' : ''}</div></div></div>)}</div>
            <div className="card"><div className="label">Peggiori</div>{s.bottom.map((r, i) => <div key={i} className="list-item"><span className="mono dim">{n0(r.values.views!)}</span><div className="grow" style={{ fontSize: 13 }}>{r.title || r.date}<div className="label">{r.date} · {r.platform}</div></div></div>)}</div>
          </div>
        )}

        {(s.byPillar.length > 0 || s.byFormat.length > 0) && (
          <div className="card section">
            <div className="label">Per pilastro e formato · {s.linked} righe collegate al calendario (per link o per data)</div>
            {s.byPillar.map((g) => <div key={g.k} className="list-item"><span className="tag y">{g.k}</span><div className="grow mono" style={{ fontSize: 13 }}>mediana {n0(g.median)} · {g.n} contenuti</div></div>)}
            {s.byFormat.map((g) => <div key={g.k} className="list-item"><span className="tag">{FORMAT_LABEL[g.k as ContentFormat]?.split(' (')[0] ?? g.k}</span><div className="grow mono" style={{ fontSize: 13 }}>mediana {n0(g.median)} · {g.n} contenuti</div></div>)}
          </div>
        )}
        {s.linked === 0 && s.kind === 'contenuti' && <div className="label" style={{ marginTop: 8 }}>Per vedere i risultati per pilastro e formato, nel calendario incolla il link di ogni post pubblicato (o pubblica nello stesso giorno indicato).</div>}

        <div className="card section">
          <div className="label" style={{ marginBottom: 8 }}>Analisi AI dei risultati</div>
          <input className="input" style={{ marginBottom: 10 }} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Domanda facoltativa (es. perché i visual vanno meglio delle performance?)" />
          <AiRunner label="Analizza i risultati"
            build={() => analysisPrompt(buildContentContext(c, src), c, computedText(s), question.trim())}
            onResult={async (t) => { if (!t.trim()) throw new Error('Risposta vuota.'); await db.aiNotes.add({ id: uid(), scope: 'project', refId: c.id, kind: 'contenuti-analisi', userNote: question.trim(), markdown: t.trim(), createdAt: Date.now() }) }} />
        </div>
        <AiNotesList refId={c.id} kinds={['contenuti-analisi']} />
      </>}
    </section>
  )
}
