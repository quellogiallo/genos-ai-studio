import { useState } from 'react'
import AiRunner from '../AiRunner'
import { buildContentContext, parseStrategy, strategyPrompt } from '../../lib/content/prompts'
import { addDays, type Campaign, type Strategy } from '../../lib/content/types'
import { saveCampaign } from '../../lib/content/hooks'
import type { ContentSources } from '../../lib/content/prompts'
import { EditableList, StepHead, TextField } from '../video/common'

const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

export default function StrategyTab({ c, src }: { c: Campaign; src: ContentSources }) {
  const [note, setNote] = useState('')
  const st = c.strategy
  const set = (p: Partial<Strategy>) => st && saveCampaign(c, { strategy: { ...st, ...p, updatedAt: Date.now() } })

  return (
    <section className="section">
      <StepHead num="C1" title="Strategia" hint="Obiettivo, pubblico, pilastri dei contenuti e fasi della campagna rispetto alla data di uscita. Tutto modificabile: i passi successivi (idee, calendario) partono da qui." />
      <div className="card">
        <input className="input" style={{ marginBottom: 10 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Indicazione facoltativa (es. voglio puntare sul pubblico della scena elettronica italiana)" />
        <AiRunner label={st ? 'Rifai la strategia' : 'Crea la strategia'}
          build={() => {
            if (st && !confirm('La nuova strategia sostituisce quella attuale. Continuare?')) throw new Error('Operazione annullata.')
            return strategyPrompt(buildContentContext(c, src), note.trim())
          }}
          onResult={async (t) => saveCampaign(c, { strategy: parseStrategy(t) })} />
        {!src.track && <div className="label" style={{ marginTop: 10 }}>Consiglio: collega un brano analizzato (scheda Impostazioni) per strategie e idee basate sulle sezioni reali del pezzo.</div>}
      </div>

      {st && (
        <div className="section">
          {st.questions.length > 0 && <div className="notice" style={{ marginBottom: 16 }}><b>Domande dell'AI</b><ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>{st.questions.map((q) => <li key={q}>{q}</li>)}</ul><div className="label" style={{ marginTop: 6 }}>Rispondi nell'indicazione qui sopra e rifai la strategia, oppure nelle note della campagna.</div></div>}
          <TextField label="Obiettivo" multiline rows={2} value={st.goal} onSave={(goal) => set({ goal })} />
          <TextField label="Pubblico" multiline rows={2} value={st.audience} onSave={(audience) => set({ audience })} />
          <TextField label="Posizionamento" multiline rows={2} value={st.positioning} onSave={(positioning) => set({ positioning })} />

          <div className="label" style={{ margin: '18px 0 8px' }}>Fasi della campagna</div>
          <div className="phases">
            {st.phases.map((p, i) => (
              <div key={i} className="phase">
                <div className="row" style={{ gap: 8 }}><b>{p.name}</b><span className="tag y">{p.perWeek}/sett.</span></div>
                <div className="label">{p.fromDay === p.toDay ? fmtDate(addDays(c.releaseDate, p.fromDay)) : `${fmtDate(addDays(c.releaseDate, p.fromDay))} → ${fmtDate(addDays(c.releaseDate, p.toDay))}`} · giorni {p.fromDay}…{p.toDay}</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{p.goal}</div>
                {p.notes && <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>{p.notes}</div>}
              </div>
            ))}
          </div>
          {st.phases.some((p) => p.perWeek > c.perWeek) && <div className="notice err" style={{ marginTop: 8, fontSize: 13 }}>Una fase supera il tuo ritmo di {c.perWeek} contenuti a settimana: rifai la strategia o adegua il calendario.</div>}

          <div className="label" style={{ margin: '18px 0 8px' }}>Pilastri dei contenuti</div>
          <div className="grid cols-2" style={{ gap: 10 }}>
            {st.pillars.map((p, i) => (
              <div key={i} className="card" style={{ padding: 14 }}>
                <b className="y">{p.name}</b>
                <div style={{ fontSize: 13, marginTop: 4 }}>{p.description}</div>
                {p.examples.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }} className="dim">{p.examples.map((e) => <li key={e}>{e}</li>)}</ul>}
              </div>
            ))}
          </div>

          <div className="label" style={{ margin: '18px 0 8px' }}>Piattaforme</div>
          {st.platforms.map((p, i) => (
            <div key={i} className="list-item"><span className="tag solid">{p.platform}</span><div className="grow"><b>{p.role}</b><div className="dim" style={{ fontSize: 13 }}>{p.formats.join(' · ')}{p.frequency ? ` — ${p.frequency}` : ''}</div>{p.notes && <div className="dim" style={{ fontSize: 12 }}>{p.notes}</div>}</div></div>
          ))}

          {st.teasers.length > 0 && <>
            <div className="label" style={{ margin: '18px 0 8px' }}>Idee teaser</div>
            {st.teasers.map((t, i) => <div key={i} className="list-item"><span className="tag">{t.format || 'teaser'}</span><div className="grow"><b>{t.title}</b><div className="dim" style={{ fontSize: 13 }}>{t.description}</div></div></div>)}
          </>}

          <div className="grid cols-2 section" style={{ gap: 16 }}>
            <EditableList label="KPI da misurare" items={st.kpis} onSave={(kpis) => set({ kpis })} />
            <EditableList label="Rischi" items={st.risks} onSave={(risks) => set({ risks })} tone="warn" />
          </div>
        </div>
      )}
    </section>
  )
}
