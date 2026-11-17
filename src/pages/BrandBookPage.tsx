import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../components/AppState'
import { useKit } from './ArtLabPage'
import { loadArtFonts } from '../lib/art/utils'
import { FONTS } from '../lib/art/types'

/** Brand book stampabile (Stampa → Salva come PDF). */
export default function BrandBookPage() {
  const { activeProject } = useApp()
  const kit = useKit(activeProject?.id)
  useEffect(() => { loadArtFonts() }, [])
  if (!activeProject || !kit) return <div className="book"><p>Caricamento…</p></div>
  const i = kit.identity
  if (!i) return <div className="book"><p>Nessuna identità scelta. <Link to="/art">Torna all'Art Direction Lab</Link></p></div>
  const kind = (n: string) => FONTS.find((f) => f.name === n)?.kind ?? ''
  return (
    <div className="book">
      <div className="book-bar no-print"><Link to="/art">← Art Direction Lab</Link><button type="button" onClick={() => window.print()}>Stampa / Salva PDF</button></div>
      <header className="book-cover">
        <div className="book-kicker">GENOS AI STUDIO · Brand book · progetto {activeProject.name}</div>
        <h1 style={{ fontFamily: `"${i.fontDisplay}"` }}>{i.name}</h1>
        <p className="book-lead">{i.concept}</p>
        <p>{i.keywords.join(' · ')}</p>
      </header>
      <section><h2>Palette</h2>
        <div className="book-palette">{i.palette.map((p) => <div key={p.hex + p.role}><span style={{ background: p.hex, height: 80 }} /><b>{p.name}</b> {p.hex}<br /><small>{p.role}</small></div>)}</div>
      </section>
      <section><h2>Tipografia</h2>
        <p style={{ fontFamily: `"${i.fontDisplay}"`, fontSize: 48, fontWeight: 800, lineHeight: 1, margin: '8px 0' }}>GENOS — Aa Bb 0123</p>
        <p><b>Titoli:</b> {i.fontDisplay} ({kind(i.fontDisplay)})</p>
        <p style={{ fontFamily: `"${i.fontText}"`, fontSize: 18 }}>Ogni suono lascia una forma. 0123456789</p>
        <p><b>Testi:</b> {i.fontText} ({kind(i.fontText)}) — font gratuiti su Google Fonts.</p>
        <ul>{i.typeRules.map((r) => <li key={r}>{r}</li>)}</ul>
      </section>
      <section><h2>Logo e wordmark</h2><p>{i.logo}</p></section>
      <section><h2>Immagini</h2><p>{i.imagery}</p><h3>Layout</h3><p>{i.layout}</p></section>
      <section><h2>Regole</h2><ul>{i.rules.map((r) => <li key={r}>{r}</li>)}</ul><h3>Da evitare</h3><ul>{i.avoid.map((r) => <li key={r}>{r}</li>)}</ul></section>
      <section><h2>Identità sonora</h2>
        <h3>Suoni firma</h3><ul>{i.sonic.signature.map((r) => <li key={r}>{r}</li>)}</ul>
        <h3>Mix</h3><ul>{i.sonic.mixRules.map((r) => <li key={r}>{r}</li>)}</ul>
        <h3>Arrangiamento</h3><ul>{i.sonic.arrangement.map((r) => <li key={r}>{r}</li>)}</ul>
        <h3>Da evitare</h3><ul>{i.sonic.avoid.map((r) => <li key={r}>{r}</li>)}</ul>
      </section>
    </div>
  )
}
