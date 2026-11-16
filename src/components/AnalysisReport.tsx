import { useMemo } from 'react'
import type { AudioAnalysis } from '../lib/audio/types'
import { runChecks } from '../lib/audio/checks'
import { CorrelationChart, LoudnessTimeline, Spectrogram, SpectrumChart } from './charts'

const f = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : Number.isFinite(v) ? v.toFixed(d) : v > 0 ? '+∞' : '−∞')
export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function Metric({ label, value, unit, hint, tone }: { label: string; value: string; unit?: string; hint?: string; tone?: 'y' | 'red' }) {
  return (
    <div className="metric" title={hint}>
      <div className="label">{label}</div>
      <div className="metric-val" style={tone === 'red' ? { color: 'var(--red)' } : tone === 'y' ? { color: 'var(--y)' } : undefined}>
        {value}{unit && <small> {unit}</small>}
      </div>
      {hint && <div className="metric-hint">{hint}</div>}
    </div>
  )
}

function Confidence({ v }: { v: number }) {
  const label = v >= 0.6 ? 'alta' : v >= 0.3 ? 'media' : 'bassa'
  return (
    <span className="conf">
      <span className="conf-bar"><span style={{ width: `${Math.round(v * 100)}%` }} /></span>
      <span className="label">affidabilità {label}</span>
    </span>
  )
}

function Head({ num, title, tag }: { num: string; title: string; tag?: string }) {
  return (
    <div className="section-head">
      <span className="num">{num}</span>
      <h2 className="display" style={{ fontSize: '1.2rem' }}>{title}</h2>
      <div className="spacer" />
      {tag && <span className="tag">{tag}</span>}
    </div>
  )
}

export default function AnalysisReport({ a, time, onSeek }: { a: AudioAnalysis; time?: number; onSeek?: (t: number) => void }) {
  const checks = useMemo(() => runChecks(a), [a])
  const s = a.stereo

  const widthLabel = (db: number | null) => {
    if (db === null) return '—'
    if (db <= -40) return 'mono'
    if (db >= 40) return 'solo Side'
    return `${f(db)} dB`
  }

  return (
    <div>
      {/* ---------------- metriche chiave ---------------- */}
      <section className="section">
        <Head num="A" title="Loudness e dinamica" tag="misurato · EBU R128" />
        <div className="metrics">
          <Metric label="Loudness integrata" value={f(a.integratedLufs)} unit="LUFS" hint="Volume percepito medio di tutto il brano" tone="y" />
          <Metric label="True peak" value={f(a.truePeakDb, 2)} unit="dBTP" hint="Picco reale, inclusi i picchi tra i campioni" tone={a.truePeakDb > -0.1 ? 'red' : undefined} />
          <Metric label="Loudness range" value={f(a.lra)} unit="LU" hint="Quanto varia il volume tra parti piano e forti" />
          <Metric label="PLR" value={f(a.plr)} unit="dB" hint="Distanza picco–loudness: più basso = più compresso" />
          <Metric label="Max short-term" value={f(a.maxShortTerm)} unit="LUFS" hint="Il punto più forte (finestra di 3 s)" />
          <Metric label="Crest factor" value={f(a.crestDb)} unit="dB" hint="Picco campione / RMS" />
          <Metric label="Picco campione" value={f(a.samplePeakDb, 2)} unit="dBFS" />
          <Metric label="Clipping" value={String(a.clipEvents)} unit={a.clipEvents === 1 ? 'punto' : 'punti'} tone={a.clipEvents ? 'red' : undefined} />
        </div>
        <div className="chart-wrap">
          <div className="chart-legend"><span className="lg y">Short-term LUFS</span><span className="lg dim">Integrata</span><span className="lg mute">Forma d'onda</span><span className="lg">A B … = sezioni stimate</span></div>
          <LoudnessTimeline a={a} time={time} onSeek={onSeek} />
        </div>
      </section>

      {/* ---------------- controlli automatici ---------------- */}
      <section className="section">
        <Head num="B" title="Controlli tecnici" tag="regole fisse" />
        <p className="dim" style={{ marginTop: -6, fontSize: 13 }}>Soglie standard applicate ai dati misurati. Non sono giudizi artistici: la diagnosi ragionata arriverà con l'AI (fase 2).</p>
        {checks.map((c) => (
          <div key={c.id} className={`check ${c.level}`}>
            <div className="check-dot" />
            <div className="grow">
              <div className="row" style={{ gap: 8 }}><b>{c.title}</b><span className="mono" style={{ fontSize: 13, color: 'var(--fg-dim)' }}>{c.value}</span></div>
              <div className="dim" style={{ fontSize: 13 }}>{c.why}</div>
            </div>
          </div>
        ))}
      </section>

      {/* ---------------- spettro ---------------- */}
      <section className="section">
        <Head num="C" title="Spettro e frequenze" tag="misurato" />
        <div className="chart-wrap">
          <div className="chart-legend"><span className="lg y">Mid (centro)</span>{a.spectrum.side && <span className="lg dim">Side (lati)</span>}<span className="lg mute">dB relativi, smussato 1/12 ottava</span></div>
          <SpectrumChart spectra={[
            { label: 'Mid', color: '#ffd400', freqs: a.spectrum.freqs, values: a.spectrum.mid },
            ...(a.spectrum.side ? [{ label: 'Side', color: '#9a9a94', freqs: a.spectrum.freqs, values: a.spectrum.side }] : []),
          ]} />
        </div>
        <div className="bands">
          {a.bands.map((b) => {
            const pct = Math.max(2, Math.min(100, ((b.levelDb + 50) / 50) * 100))
            return (
              <div key={b.id} className="band">
                <div className="band-name"><b>{b.label}</b><span className="label">{b.lo >= 1000 ? `${b.lo / 1000}k` : b.lo}–{b.hi >= 1000 ? `${b.hi / 1000}k` : b.hi} Hz</span></div>
                <div className="band-bar"><span style={{ width: `${pct}%` }} /></div>
                <div className="band-val mono">{f(b.levelDb)} dB</div>
                {s && <div className="band-w mono" title="Larghezza stereo (Side/Mid)">{widthLabel(b.widthDb)}</div>}
              </div>
            )
          })}
          <div className="label" style={{ marginTop: 8 }}>
            Energia di ogni banda rispetto al totale{s ? ' · ultima colonna: larghezza stereo (Side/Mid)' : ''} · pendenza spettrale {f(a.tiltDbPerOct)} dB/ottava (100 Hz–10 kHz)
          </div>
        </div>
        <div className="chart-wrap">
          <div className="chart-legend"><span className="lg">Spettrogramma</span><span className="lg mute">tempo → · frequenza ↑ · chiaro = più energia</span></div>
          <Spectrogram a={a} time={time} onSeek={onSeek} />
        </div>
      </section>

      {/* ---------------- stereo ---------------- */}
      {s && (
        <section className="section">
          <Head num="D" title="Immagine stereo" tag="misurato" />
          <div className="metrics">
            <Metric label="Correlazione" value={f(s.correlation, 2)} hint="+1 = mono · 0 = molto largo · negativo = controfase" tone={s.correlation < 0 ? 'red' : undefined} />
            <Metric label="Larghezza" value={widthLabel(s.widthDb)} hint="Energia Side rispetto a Mid" />
            <Metric label="Perdita in mono" value={s.monoLossDb >= 40 ? 'totale' : f(s.monoLossDb)} unit={s.monoLossDb >= 40 ? '' : 'LU'} hint="Quanto cala il volume sommando in mono" tone={s.monoLossDb > 3 ? 'red' : undefined} />
            <Metric label="Bilanciamento L/R" value={Math.abs(s.balanceDb) < 0.05 ? 'centrato' : `${s.balanceDb > 0 ? 'L' : 'R'} +${f(Math.abs(s.balanceDb))}`} unit={Math.abs(s.balanceDb) < 0.05 ? '' : 'dB'} />
            <Metric label="Tempo in controfase" value={f(s.negativeCorrPct, 0)} unit="%" />
          </div>
          <div className="chart-wrap">
            <div className="chart-legend"><span className="lg">Correlazione nel tempo</span><span className="lg red">rosso = controfase</span></div>
            <CorrelationChart a={a} time={time} onSeek={onSeek} />
          </div>
        </section>
      )}

      {/* ---------------- stime ---------------- */}
      <section className="section">
        <Head num="E" title="Tempo, tonalità, struttura" tag="stime algoritmiche" />
        <p className="dim" style={{ marginTop: -6, fontSize: 13 }}>Calcolati con metodi statistici: possono sbagliare, soprattutto tra metà/doppio tempo e tra tonalità relative (es. Do minore / Mib maggiore).</p>
        <div className="metrics">
          <div className="metric">
            <div className="label">BPM</div>
            {a.tempo ? <>
              <div className="metric-val">{f(a.tempo.bpm)}</div>
              {a.tempo.alternatives.length > 0 && <div className="metric-hint">oppure {a.tempo.alternatives.join(' / ')} (metà/doppio)</div>}
              <Confidence v={a.tempo.confidence} />
            </> : <div className="metric-hint">Nessun ritmo rilevabile</div>}
          </div>
          <div className="metric">
            <div className="label">Tonalità</div>
            {a.key ? <>
              <div className="metric-val" style={{ fontSize: 20 }}>{a.key.key}</div>
              <div className="metric-hint">alternativa: {a.key.alternative}</div>
              <Confidence v={a.key.confidence} />
            </> : <div className="metric-hint">Nessun contenuto tonale rilevabile</div>}
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          {a.sections.map((sec, i) => (
            <button key={i} className="section-row" onClick={() => onSeek?.(sec.start)}>
              <span className="sec-letter">{sec.label}</span>
              <span className="mono">{fmtTime(sec.start)} – {fmtTime(sec.end)}</span>
              <span className="dim mono">{f(sec.end - sec.start, 0)} s</span>
              <div className="spacer" />
              <span className="mono">{f(sec.loudness)} LUFS</span>
            </button>
          ))}
          <div className="label" style={{ marginTop: 8 }}>Sezioni con la stessa lettera hanno timbro e armonia simili. Tocca una sezione per ascoltarla.</div>
        </div>
      </section>

      {/* ---------------- file ---------------- */}
      <section className="section">
        <Head num="F" title="Dati del file" />
        <div className="metrics">
          <Metric label="Durata" value={fmtTime(a.duration)} />
          <Metric label="Canali" value={String(a.channels)} />
          <Metric label="Sample rate file" value={a.fileSampleRate ? `${a.fileSampleRate / 1000}` : 'n.d.'} unit={a.fileSampleRate ? 'kHz' : ''} hint={a.fileSampleRate ? undefined : 'Leggibile solo da WAV/AIFF'} />
          <Metric label="Bit depth" value={a.fileBitDepth ? String(a.fileBitDepth) : 'n.d.'} unit={a.fileBitDepth ? 'bit' : ''} />
          <Metric label="DC offset" value={f(a.dcOffset * 100, 3)} unit="%" />
        </div>
        <div className="label" style={{ marginTop: 8 }}>Analisi eseguita a {a.analysisSampleRate / 1000} kHz il {new Date(a.analyzedAt).toLocaleString('it-IT')}</div>
      </section>
    </div>
  )
}
