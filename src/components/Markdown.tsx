import type { ReactNode } from 'react'

/**
 * Renderer markdown minimale e sicuro (niente HTML grezzo):
 * titoli, grassetto, corsivo, codice, elenchi, paragrafi, separatori.
 */
function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_)/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[2]) out.push(<strong key={`${key}-${i++}`}>{m[2]}</strong>)
    else if (m[3]) out.push(<code key={`${key}-${i++}`}>{m[3]}</code>)
    else out.push(<em key={`${key}-${i++}`}>{m[4] ?? m[5]}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let para: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let k = 0

  const flushPara = () => { if (para.length) { blocks.push(<p key={k++}>{inline(para.join(' '), k)}</p>); para = [] } }
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it, k * 100 + i)}</li>)
      blocks.push(list.ordered ? <ol key={k++}>{items}</ol> : <ul key={k++}>{items}</ul>)
      list = null
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    const ul = line.match(/^\s*[-*•]\s+(.*)$/)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (!line.trim()) { flushPara(); flushList(); continue }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushPara(); flushList(); blocks.push(<hr key={k++} />); continue }
    if (h) {
      flushPara(); flushList()
      const level = h[1].length
      const content = inline(h[2].replace(/\*\*/g, ''), k)
      blocks.push(level <= 2 ? <h3 key={k++} className="md-h">{content}</h3> : <h4 key={k++} className="md-h4">{content}</h4>)
      continue
    }
    if (ul || ol) {
      flushPara()
      const ordered = !!ol && !ul
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] } }
      list.items.push((ul ?? ol)![1])
      continue
    }
    // le righe "**Etichetta:** testo" diventano righe separate
    if (/^\*\*[^*]+:\*\*/.test(line.trim())) { flushPara(); flushList(); blocks.push(<p key={k++} className="md-field">{inline(line.trim(), k)}</p>); continue }
    flushList()
    para.push(line.trim())
  }
  flushPara(); flushList()
  return <div className="md">{blocks}</div>
}
