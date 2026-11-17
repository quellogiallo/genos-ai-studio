import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type AiNote } from '../lib/db'
import { useApp } from './AppState'
import Markdown from './Markdown'

const LABEL: Record<AiNote['kind'], string> = {
  'testo-analisi': 'Analisi testo',
  'testo-brainstorming': 'Brainstorming',
  beat: 'Concept beat',
  'contenuti-analisi': 'Analisi contenuti',
  'moodboard-critica': 'Critica moodboard',
  'progetto-revisione': 'Revisione progetto',
}

/** Elenco dei risultati AI salvati per un brano o un progetto. */
export default function AiNotesList({ refId, kinds, render }: { refId: string; kinds: AiNote['kind'][]; render?: (n: AiNote) => React.ReactNode }) {
  const notes = useLiveQuery(async () => (await db.aiNotes.where('refId').equals(refId).reverse().sortBy('createdAt')).filter((n) => kinds.includes(n.kind)), [refId, kinds.join()])
  if (!notes?.length) return null
  return <div style={{ marginTop: 16 }}>{notes.map((n) => <NoteCard key={n.id} n={n} render={render} />)}</div>
}

function NoteCard({ n, render }: { n: AiNote; render?: (n: AiNote) => React.ReactNode }) {
  const { toast } = useApp()
  const [open, setOpen] = useState(true)
  return (
    <article className="diag">
      <header className="row diag-head" onClick={() => setOpen((o) => !o)}>
        <span className={`tag ${n.kind === 'testo-analisi' ? 'solid' : 'y'}`}>{LABEL[n.kind]}</span>
        <span className="label">{n.model ?? ''} · {new Date(n.createdAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</span>
        <div className="spacer" /><span className="mono dim">{open ? '−' : '+'}</span>
      </header>
      {open && <>
        {n.userNote && <div className="label" style={{ margin: '10px 0' }}>Richiesta: {n.userNote}</div>}
        {render ? render(n) : <Markdown text={n.markdown} />}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(n.markdown); toast('Testo copiato') } catch { toast('Copia non riuscita', 'err') } }}>Copia testo</button>
          <button className="btn danger sm" onClick={() => confirm('Eliminare questo risultato?') && db.aiNotes.delete(n.id)}>Elimina</button>
        </div>
      </>}
    </article>
  )
}
