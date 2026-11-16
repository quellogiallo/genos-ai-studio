import type { Project } from './db'

/**
 * Trasforma un progetto in un blocco di contesto per l'AI.
 * Le decisioni sono vincolanti; le idee scartate non vanno riproposte.
 * Verrà usato da tutti i moduli (Music Lab dalla fase 2).
 */
export function buildProjectContext(p: Project): string {
  const lines: string[] = []
  lines.push(`PROGETTO: ${p.name} (${p.type}, stato: ${p.status})`)
  if (p.description) lines.push(`DESCRIZIONE: ${p.description}`)
  if (p.decisions.length) {
    lines.push('DECISIONI CREATIVE GIÀ PRESE (rispettale, non rimetterle in discussione se non richiesto):')
    p.decisions.forEach((d) => lines.push(`- [${d.area}] ${d.text}`))
  }
  if (p.discarded.length) {
    lines.push('IDEE SCARTATE (non riproporle, nemmeno in forma simile):')
    p.discarded.forEach((d) => lines.push(`- ${d.text}${d.reason ? ` — motivo: ${d.reason}` : ''}`))
  }
  if (p.references.length) {
    lines.push('REFERENCE:')
    p.references.forEach((r) => lines.push(`- ${r.title}${r.note ? ` — ${r.note}` : ''}`))
  }
  if (p.goals.length) {
    lines.push('OBIETTIVI:')
    p.goals.forEach((g) => lines.push(`- ${g.done ? '[fatto] ' : ''}${g.text}${g.deadline ? ` (entro ${g.deadline})` : ''}`))
  }
  return lines.join('\n')
}
