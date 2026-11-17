import { METRICS, METRIC_LABEL, type Campaign, type Metric, type Post, type StatImport, type StatRow } from './types'

/* ======================================================================
   Lettura dei file esportati (CSV / Excel) da TikTok Studio, Instagram
   (Meta Business Suite / Insights), con riconoscimento automatico delle colonne.
   ====================================================================== */

export type Cell = string | number | Date | boolean | null

export interface ParsedTable { headers: string[]; rows: Cell[][] }

/** CSV con separatore automatico (, ; tab) e campi tra virgolette. */
export function parseCsv(text: string): Cell[][] {
  const clean = text.replace(/^﻿/, '')
  const first = clean.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const sep = [',', ';', '\t'].map((s) => ({ s, n: first.split(s).length })).sort((a, b) => b.n - a.n)[0].s
  const rows: Cell[][] = []
  let row: string[] = [], cur = '', q = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (q) {
      if (ch === '"') { if (clean[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === sep) { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
    } else cur += ch
  }
  row.push(cur)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}

export async function readTable(file: File): Promise<ParsedTable> {
  let raw: Cell[][]
  if (/\.(xlsx|xlsm)$/i.test(file.name)) {
    const { default: readXlsxFile } = await import('read-excel-file/browser')
    const sheets = await readXlsxFile(file)
    // il primo foglio con più righe utili
    const best = [...sheets].sort((a, b) => b.data.length - a.data.length)[0]
    raw = (best?.data ?? []) as Cell[][]
  } else if (/\.xls$/i.test(file.name)) {
    throw new Error('Il vecchio formato .xls non è supportato: esporta in .xlsx o .csv.')
  } else {
    raw = parseCsv(await file.text())
  }
  if (raw.length < 2) throw new Error('Il file non contiene abbastanza righe.')
  // la riga di intestazione è la prima con almeno 2 colonne riconosciute
  let h = 0
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const known = raw[i].filter((c) => typeof c === 'string' && (guessColumn(c) || DATE_RE.test(c) || TITLE_RE.test(c))).length
    if (known >= 2) { h = i; break }
  }
  const headers = raw[h].map((c, i) => (c == null || c === '' ? `Colonna ${i + 1}` : String(c).trim()))
  return { headers, rows: raw.slice(h + 1).filter((r) => r.some((c) => c !== null && c !== '')) }
}

/* ---------------- riconoscimento colonne ---------------- */

const DATE_RE = /(^date|^data\b|^giorno|^day\b|publish|pubblicazion|post time|created|orario)/i
const TITLE_RE = /(titolo|title|descrizione|description|caption|didascalia|contenuto)/i
const URL_RE = /(link|url|permalink)/i

const RULES: [Metric, RegExp][] = [
  ['completion', /(complet|visto per intero|full video|watched full|percentuale.*intero)/i],
  ['avgWatch', /(average watch|avg.*watch|tempo medio|durata media|visione media|average time)/i],
  ['watchTime', /(total (play|watch) ?time|tempo (totale )?di (visione|riproduzione)|watch time)/i],
  ['views', /(video views|views|visualizzazion|impression|riproduzion|plays|play count)/i],
  ['reach', /(reach|copertura|account raggiunti|accounts reached)/i],
  ['likes', /(likes|mi piace|reaction|reazioni)/i],
  ['comments', /(comment)/i],
  ['shares', /(share|condivision)/i],
  ['saves', /(save|salvataggi|salvati|preferiti|favorites|bookmark)/i],
  ['follows', /(follow|new followers|nuovi follower)/i],
]

export function guessColumn(header: string): Metric | null {
  const h = header.trim()
  if (/profile views|visite al profilo/i.test(h)) return null
  for (const [m, re] of RULES) if (re.test(h)) return m
  return null
}

export interface Mapping { date: number; title: number; url: number; metrics: Partial<Record<Metric, number>> }

export function autoMapping(headers: string[]): Mapping {
  const m: Mapping = { date: -1, title: -1, url: -1, metrics: {} }
  headers.forEach((h, i) => {
    if (/^id\b|\bid$/i.test(h.trim())) return
    if (m.date < 0 && DATE_RE.test(h)) { m.date = i; return }
    if (m.url < 0 && URL_RE.test(h)) { m.url = i; return }
    if (m.title < 0 && TITLE_RE.test(h)) { m.title = i; return }
    const g = guessColumn(h)
    if (g && m.metrics[g] === undefined) m.metrics[g] = i
  })
  return m
}

/* ---------------- numeri e date ---------------- */

export function parseNum(v: Cell): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v !== 'string') return undefined
  let s = v.trim().replace(/\s/g, '').replace(/%$/, '')
  let mult = 1
  const suf = s.match(/([kKmM])$/)
  if (suf) { mult = /k/i.test(suf[1]) ? 1e3 : 1e6; s = s.slice(0, -1) }
  // durate tipo 0:12 o 1:02:03 → secondi
  if (/^\d+:\d{2}(:\d{2})?$/.test(s)) return s.split(':').reduce((a, x) => a * 60 + Number(x), 0)
  s = s.replace(/s$/, '')
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.')
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (lc > -1) s = /,\d{3}$/.test(s) && !suf ? s.replace(/,/g, '') : s.replace(',', '.')
  else if (!suf && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '') // 1.234 = migliaia (formato italiano)
  const n = Number(s)
  return Number.isFinite(n) ? n * mult : undefined
}

const MONTHS: Record<string, number> = { jan: 1, gen: 1, feb: 2, mar: 3, apr: 4, may: 5, mag: 5, jun: 6, giu: 6, jul: 7, lug: 7, aug: 8, ago: 8, sep: 9, set: 9, oct: 10, ott: 10, nov: 11, dec: 12, dic: 12 }

export function parseDate(v: Cell): string {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  if (typeof v === 'number' && v > 30000 && v < 80000) { // numero seriale di Excel
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
  }
  if (typeof v !== 'string') return ''
  const s = v.trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) {
    let [, a, b, y] = m
    if (y.length === 2) y = '20' + y
    // formato italiano gg/mm salvo che il primo numero non possa essere un giorno
    let d = Number(a), mo = Number(b)
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  m = s.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/) ?? null
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`
  m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/)
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const t = Date.parse(s)
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : ''
}

export function buildRows(t: ParsedTable, map: Mapping): StatRow[] {
  return t.rows.map((r) => {
    const values: Partial<Record<Metric, number>> = {}
    for (const [m, i] of Object.entries(map.metrics) as [Metric, number][]) {
      if (i < 0) continue
      const n = parseNum(r[i])
      if (n !== undefined) values[m] = n
    }
    return {
      date: map.date >= 0 ? parseDate(r[map.date]) : '',
      title: map.title >= 0 && r[map.title] != null ? String(r[map.title]).trim().slice(0, 300) : '',
      url: map.url >= 0 && r[map.url] != null ? String(r[map.url]).trim() : '',
      values,
    }
  }).filter((r) => Object.keys(r.values).length > 0)
}

/* ======================================================================
   Calcoli (affidabili, fatti dall'app): l'AI li riceve già pronti.
   ====================================================================== */

export interface RowCalc extends StatRow { platform: string; er: number | null; post?: Post }

const engagement = (v: StatRow['values']) => {
  const views = v.views ?? v.reach
  const inter = (v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0) + (v.saves ?? 0)
  return views && views > 0 && (v.likes !== undefined || v.comments !== undefined || v.shares !== undefined || v.saves !== undefined) ? inter / views : null
}

/** Collega una riga di statistiche a un post del calendario (per link, oppure stessa data e piattaforma). */
function matchPost(c: Campaign, imp: StatImport, r: StatRow): Post | undefined {
  if (r.url) {
    const p = c.posts.find((p) => p.url && (r.url.includes(p.url) || p.url.includes(r.url)))
    if (p) return p
  }
  if (r.date) {
    const same = c.posts.filter((p) => p.date === r.date && p.platform === imp.platform)
    if (same.length === 1) return same[0]
  }
  return undefined
}

export function computeStats(c: Campaign) {
  const rows: RowCalc[] = c.stats.flatMap((imp) => imp.rows.map((r) => ({ ...r, platform: imp.platform, er: engagement(r.values), post: matchPost(c, imp, r) })))
  const with_ = (m: Metric) => rows.filter((r) => r.values[m] !== undefined)
  const sum = (m: Metric) => with_(m).reduce((s, r) => s + (r.values[m] ?? 0), 0)
  const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0 }
  const metrics = METRICS.filter((m) => with_(m).length)
  const totals = Object.fromEntries(metrics.map((m) => [m, sum(m)])) as Partial<Record<Metric, number>>
  const viewsRows = with_('views')
  const medViews = median(viewsRows.map((r) => r.values.views!))
  const top = [...viewsRows].sort((a, b) => b.values.views! - a.values.views!).slice(0, 3)
  const bottom = [...viewsRows].sort((a, b) => a.values.views! - b.values.views!).slice(0, 3)
  const ers = rows.map((r) => r.er).filter((x): x is number => x !== null)
  const byWeekday = Array.from({ length: 7 }, (_, d) => {
    const rs = viewsRows.filter((r) => r.date && (new Date(r.date + 'T12:00:00').getDay() + 6) % 7 === d)
    return { d, n: rs.length, avg: rs.length ? rs.reduce((s, r) => s + r.values.views!, 0) / rs.length : 0 }
  })
  // per pilastro / formato (solo righe collegate a idee)
  const byGroup = (key: (r: RowCalc) => string | undefined) => {
    const g = new Map<string, number[]>()
    viewsRows.forEach((r) => { const k = key(r); if (k) g.set(k, [...(g.get(k) ?? []), r.values.views!]) })
    return [...g.entries()].map(([k, v]) => ({ k, n: v.length, median: median(v) })).sort((a, b) => b.median - a.median)
  }
  const ideaOf = (r: RowCalc) => (r.post?.ideaId ? c.ideas.find((i) => i.id === r.post!.ideaId) : undefined)
  const kind = rows.some((r) => r.title || r.url) ? 'contenuti' : 'giorni'
  return {
    rows, kind, metrics, totals, medViews, top, bottom,
    medianEr: ers.length ? median(ers) : null,
    shareRate: totals.views ? (totals.shares ?? 0) / totals.views : null,
    saveRate: totals.views ? (totals.saves ?? 0) / totals.views : null,
    byWeekday, linked: rows.filter((r) => r.post).length,
    byPillar: byGroup((r) => ideaOf(r)?.pillar || undefined),
    byFormat: byGroup((r) => ideaOf(r)?.format),
  }
}

export type Computed = ReturnType<typeof computeStats>

const pct = (x: number | null) => (x === null ? 'n.d.' : `${(x * 100).toFixed(1)}%`)
const n0 = (x: number) => Math.round(x).toLocaleString('it-IT')

export function computedText(s: Computed): string {
  const WD = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
  const name = (r: RowCalc) => `${r.date || 's.d.'} ${r.title ? `"${r.title.slice(0, 60)}"` : ''} (${r.platform})`
  return [
    `Righe: ${s.rows.length} (${s.kind}); collegate al calendario: ${s.linked}`,
    `Totali: ${s.metrics.map((m) => `${METRIC_LABEL[m]} ${n0(s.totals[m] ?? 0)}`).join(' · ')}`,
    `Mediana visualizzazioni per riga: ${n0(s.medViews)}`,
    `Engagement mediano (mi piace+commenti+condivisioni+salvataggi / visualizzazioni): ${pct(s.medianEr)}`,
    `Tasso di condivisione: ${pct(s.shareRate)} · tasso di salvataggio: ${pct(s.saveRate)}`,
    `Migliori per visualizzazioni: ${s.top.map((r) => `${name(r)} ${n0(r.values.views!)} (${s.medViews ? (r.values.views! / s.medViews).toFixed(1) : '?'}× la mediana)`).join('; ')}`,
    `Peggiori: ${s.bottom.map((r) => `${name(r)} ${n0(r.values.views!)}`).join('; ')}`,
    `Media visualizzazioni per giorno della settimana: ${s.byWeekday.filter((w) => w.n).map((w) => `${WD[w.d]} ${n0(w.avg)} (${w.n})`).join(', ')}`,
    s.byPillar.length ? `Per pilastro (mediana visualizzazioni): ${s.byPillar.map((g) => `${g.k} ${n0(g.median)} (${g.n})`).join(', ')}` : '',
    s.byFormat.length ? `Per formato: ${s.byFormat.map((g) => `${g.k} ${n0(g.median)} (${g.n})`).join(', ')}` : '',
  ].filter(Boolean).join('\n')
}
