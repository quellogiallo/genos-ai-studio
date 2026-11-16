/**
 * Pagina dei moduli non ancora sviluppati.
 * Mostra cosa arriverà, senza simulare funzioni che non esistono.
 */
const INFO: Record<string, { idx: string; title: string; phases: { id: string; text: string }[] }> = {
  content: { idx: '03', title: 'Content Lab', phases: [{ id: '—', text: 'Script short, calendari editoriali, analisi performance. Da pianificare.' }] },
  art: { idx: '04', title: 'Art Direction', phases: [{ id: '—', text: 'Moodboard, palette, identità visiva, prompt immagini. Da pianificare.' }] },
}

export default function ModulePage({ id }: { id: keyof typeof INFO }) {
  const m = INFO[id]
  return (
    <div className="page">
      <div className="label">{m.idx} / Modulo</div>
      <h1 className="display">{m.title}</h1>
      <div className="notice section">Questo modulo non è ancora attivo. Nessuna funzione qui è simulata: arriverà fase per fase.</div>
      <section className="section">
        <div className="section-head"><span className="num">//</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Roadmap</h2></div>
        {m.phases.map((p) => (
          <div key={p.id + p.text} className="list-item">
            <span className="tag y">{p.id}</span>
            <div className="grow">{p.text}</div>
          </div>
        ))}
      </section>
    </div>
  )
}
