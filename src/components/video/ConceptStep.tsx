import AiRunner from '../AiRunner'
import { buildVideoContext, conceptPrompt, parseConcept } from '../../lib/video/prompts'
import type { ConceptAnalysis } from '../../lib/video/types'
import { EditableList, StepHead, TextField, type StepProps } from './common'

export default function ConceptStep({ video, project, track, update }: StepProps) {
  const c = video.concept
  const patch = (p: Partial<ConceptAnalysis>) => { if (c) update({ concept: { ...c, ...p } }) }
  const answered = c?.questions.filter((q) => q.answer.trim()).length ?? 0
  const open = (c?.questions.length ?? 0) - answered

  return (
    <section className="section">
      <StepHead num="01" title="Analisi del concept"
        hint="Scrivi l'idea come ti viene, anche astratta. L'analisi è critica di proposito: segnala debolezze e cliché, e ti fa domande invece di inventare." />

      <TextField label="Idea di partenza" multiline rows={6} value={video.idea} onSave={(idea) => update({ idea })}
        placeholder="Di cosa parla il video? Immagini che hai in testa, sensazione, storia, cosa NON vuoi…" />

      <AiRunner
        label={c ? 'Rianalizza con le mie risposte' : 'Analizza il concept'}
        disabledReason={video.idea.trim().length < 20 ? "Scrivi almeno un paio di frasi sull'idea per poterla analizzare." : undefined}
        build={() => conceptPrompt(buildVideoContext(video, project, track, 'concept'))}
        onResult={(text) => update({ concept: parseConcept(text, video.concept) })}
      />

      {c && (
        <div className="section stack">
          <div className="card">
            <div className="label y">Logline</div>
            <TextField multiline rows={2} value={c.logline} onSave={(logline) => patch({ logline })} />
            <div className="grid cols-2">
              <TextField label="Tema" multiline rows={3} value={c.theme} onSave={(theme) => patch({ theme })} />
              <TextField label="Sottotesto" multiline rows={3} value={c.subtext} onSave={(subtext) => patch({ subtext })} />
              <TextField label="Tono" multiline rows={3} value={c.tone} onSave={(tone) => patch({ tone })} />
              <TextField label="Promessa visiva" multiline rows={3} value={c.visualPromise} onSave={(visualPromise) => patch({ visualPromise })} />
            </div>
          </div>

          <div className="grid cols-2">
            <div className="card"><EditableList label="Punti di forza" tone="ok" items={c.strengths} onSave={(strengths) => patch({ strengths })} /></div>
            <div className="card"><EditableList label="Debolezze" tone="alert" items={c.weaknesses} onSave={(weaknesses) => patch({ weaknesses })} /></div>
          </div>
          <div className="card"><EditableList label="Cliché da evitare" tone="warn" items={c.cliches} onSave={(cliches) => patch({ cliches })} /></div>

          {c.questions.length > 0 && (
            <div className="card">
              <div className="row">
                <div className="label y">Domande per te</div>
                <div className="spacer" />
                <span className="tag">{answered} risposte · {open} aperte</span>
              </div>
              <p className="dim" style={{ fontSize: 13 }}>Le risposte diventano vincoli per tutti i passi successivi. Dopo aver risposto, rianalizza.</p>
              {c.questions.map((q) => (
                <div key={q.id} className="qa">
                  <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <b style={{ flex: 1 }}>{q.question}</b>
                    <button className="btn ghost sm" type="button" aria-label="Rimuovi domanda"
                      onClick={() => patch({ questions: c.questions.filter((x) => x.id !== q.id) })}>×</button>
                  </div>
                  <TextField multiline rows={2} value={q.answer} placeholder="La tua risposta"
                    onSave={(answer) => patch({ questions: c.questions.map((x) => (x.id === q.id ? { ...x, answer } : x)) })} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
