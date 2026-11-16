/**
 * Analisi locale del testo: sillabe, rime, ripetizioni, coerenza metrica.
 * Tutto è calcolato con regole (nessuna AI): la sillabazione è una STIMA,
 * soprattutto in inglese e nei casi di dittongo/iato.
 */

export type Lang = 'it' | 'en'

export interface LyricLine {
  text: string
  syllables: number
  /** sillabe contando le sinalefi (fusione tra vocale finale e iniziale), solo italiano */
  sung: number
  rhymeKey: string
  rhyme: string
  offMeter: boolean
}

export interface LyricSection {
  name: string
  lines: LyricLine[]
  median: number
}

export interface LyricsAnalysis {
  lang: Lang
  sections: LyricSection[]
  totalLines: number
  totalWords: number
  totalSyllables: number
  uniqueWordRatio: number
  topWords: { word: string; count: number }[]
  repeatedLines: { text: string; count: number }[]
  cliches: { phrase: string; line: string }[]
}

const IT_STOP = new Set('il lo la i gli le un uno una di a da in con su per tra fra e ed o ma se che chi non mi ti si ci vi ne è sono sei era al allo alla ai agli alle del dello della dei degli delle dal dalla nel nella nei sul sulla col come più io tu lui lei noi voi loro mio tuo suo mia tua sua questo questa quello quella anche ancora poi già qui là dove quando cosa tutto tutti mai sempre ho hai ha c\'è l\' un\' d\''.split(' '))
const EN_STOP = new Set('the a an and or but if of to in on at for with from by is are was were be been am i you he she it we they me my your his her our their this that these those not no so do does did have has had will would can could just all as up down out into over then than there here what when where who why how oh yeah'.split(' '))

const CLICHES: Record<Lang, string[]> = {
  it: ['cuore e amore', 'amore e cuore', 'per sempre', 'nel buio', 'senza di te', 'mille volte', 'ali per volare', 'il sole e la luna', 'fino alla fine', 'occhi negli occhi', 'cielo e mare', 'non è mai troppo tardi', 'sei la mia luce', 'tu sei tutto', 'come un fiume', 'lacrime di pioggia', 'mi manchi da morire', 'la notte e il giorno'],
  en: ['fire and desire', 'heart apart', 'tonight light', 'forever and ever', 'in the dark', 'break my heart', 'can\'t live without you', 'end of time', 'set me free', 'fall apart', 'touch the sky', 'stars align', 'lost in your eyes', 'rain and pain', 'love above'],
}

export function detectLang(text: string): Lang {
  const w = text.toLowerCase().match(/[a-zàèéìòóù']+/g) ?? []
  let it = 0, en = 0
  for (const x of w) { if (IT_STOP.has(x)) it++; if (EN_STOP.has(x)) en++ }
  return en > it * 1.2 ? 'en' : 'it'
}

/* ---------------- sillabe ---------------- */

const STRONG = 'aeoàèéòóìù' // vocali "forti" (e accentate)
const isV = (c: string) => 'aeiouàèéìíòóùú'.includes(c)

function itSyllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-zàèéìíòóùú]/g, '')
  if (!w) return 0
  w = w.replace(/qu/g, 'q').replace(/gu(?=[aeioàèéìòóù])/g, 'g')
    .replace(/sci(?=[aou])/g, 'sc').replace(/([cg])i(?=[aou])/g, '$1').replace(/gli(?=[aeou])/g, 'gl')
  let count = 0, prev = ''
  for (const c of w) {
    if (isV(c)) {
      if (!isV(prev)) count++
      else if (STRONG.includes(prev) && STRONG.includes(c)) count++ // iato tra vocali forti
      else if ('ìíùú'.includes(c) || 'ìíùú'.includes(prev)) count++ // i/u accentata: iato
    }
    prev = c
  }
  return Math.max(1, count)
}

function enSyllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  const m = w.match(/[aeiouy]{1,2}/g)
  return Math.max(1, m ? m.length : 1)
}

export function countSyllables(word: string, lang: Lang) {
  return lang === 'it' ? itSyllables(word) : enSyllables(word)
}

const words = (line: string) => line.match(/[A-Za-zÀ-ÿ']+/g) ?? []

function lineSyllables(line: string, lang: Lang) {
  const ws = words(line)
  const syl = ws.reduce((s, w) => s + countSyllables(w, lang), 0)
  let sung = syl
  if (lang === 'it') {
    // sinalefe: vocale finale + vocale (o h) iniziale si cantano insieme
    for (let i = 0; i < ws.length - 1; i++) {
      const a = ws[i].toLowerCase(), b = ws[i + 1].toLowerCase()
      if (isV(a[a.length - 1]) && (isV(b[0]) || (b[0] === 'h' && isV(b[1] ?? '')))) sung--
    }
  }
  return { syl, sung: Math.max(1, sung) }
}

/* ---------------- rime ---------------- */

function rhymeKey(line: string, lang: Lang): string {
  const ws = words(line)
  let w = (ws[ws.length - 1] ?? '').toLowerCase().replace(/'/g, '')
  if (!w) return ''
  if (lang === 'it') {
    w = w.replace(/qu/g, 'q').replace(/([cg])i(?=[aou])/g, '$1')
    const acc = w.search(/[àèéìíòóùú]/)
    if (acc >= 0) return w.slice(acc).normalize('NFD').replace(/[̀-ͯ]/g, '')
    // accento presunto sulla penultima vocale (parole piane, le più comuni)
    const idx: number[] = []
    for (let i = 0; i < w.length; i++) if (isV(w[i]) && !(isV(w[i - 1] ?? '') && !STRONG.includes(w[i]))) idx.push(i)
    const pos = idx.length >= 2 ? idx[idx.length - 2] : idx[0] ?? 0
    return w.slice(pos)
  }
  const m = w.match(/[aeiouy]+[^aeiouy]*e?$/)
  return m ? m[0].replace(/e$/, '') || m[0] : w.slice(-2)
}

/* ---------------- analisi completa ---------------- */

export function analyzeLyrics(text: string): LyricsAnalysis {
  const lang = detectLang(text)
  const sections: LyricSection[] = []
  let cur: LyricSection = { name: 'Testo', lines: [], median: 0 }
  const push = () => { if (cur.lines.length) sections.push(cur) }

  const HEAD = /^\(?((?:strofa|ritornello|pre-?ritornello|bridge|ponte|intro|outro|verse|chorus|pre-?chorus|hook|refrain)[^:)]*):?\)?$/i
  const rawLines = text.replace(/\r/g, '').split('\n').map((l) => l.trim())
  const hasHeads = rawLines.some((l) => /^\[.+\]$/.test(l) || HEAD.test(l))
  if (!hasHeads) cur.name = 'Blocco 1'
  for (const line of rawLines) {
    const head = line.match(/^\[(.+)\]$/) ?? line.match(HEAD)
    if (head) { push(); cur = { name: head[1].trim(), lines: [], median: 0 }; continue }
    if (!line) {
      // senza titoli di sezione, le righe vuote separano i blocchi
      if (!hasHeads && cur.lines.length) { push(); cur = { name: `Blocco ${sections.length + 1}`, lines: [], median: 0 } }
      continue
    }
    const { syl, sung } = lineSyllables(line, lang)
    cur.lines.push({ text: line, syllables: syl, sung, rhymeKey: rhymeKey(line, lang), rhyme: '', offMeter: false })
  }
  push()

  for (const s of sections) {
    const vals = s.lines.map((l) => (lang === 'it' ? l.sung : l.syllables)).sort((a, b) => a - b)
    s.median = vals[Math.floor(vals.length / 2)] ?? 0
    // schema di rima per sezione
    const keys: string[] = []
    for (const l of s.lines) {
      let i = keys.findIndex((k) => k && l.rhymeKey && (k === l.rhymeKey || (k.length >= 3 && l.rhymeKey.length >= 3 && k.slice(-3) === l.rhymeKey.slice(-3))))
      if (i < 0) { keys.push(l.rhymeKey); i = keys.length - 1 }
      l.rhyme = String.fromCharCode(65 + (i % 26))
      const v = lang === 'it' ? l.sung : l.syllables
      l.offMeter = s.lines.length >= 3 && Math.abs(v - s.median) / Math.max(1, s.median) > 0.3
    }
    // lettere usate una sola volta = nessuna rima → "x"
    const counts: Record<string, number> = {}
    s.lines.forEach((l) => (counts[l.rhyme] = (counts[l.rhyme] ?? 0) + 1))
    s.lines.forEach((l) => { if (counts[l.rhyme] === 1) l.rhyme = 'x' })
  }

  const all = sections.flatMap((s) => s.lines)
  const ws = all.flatMap((l) => words(l.text).map((w) => w.toLowerCase().replace(/'/g, '')))
  const stop = lang === 'it' ? IT_STOP : EN_STOP
  const freq: Record<string, number> = {}
  ws.filter((w) => w.length > 2 && !stop.has(w)).forEach((w) => (freq[w] = (freq[w] ?? 0) + 1))
  const lineFreq: Record<string, number> = {}
  all.forEach((l) => { const k = l.text.toLowerCase().replace(/[^\p{L}\s]/gu, '').trim(); if (k) lineFreq[k] = (lineFreq[k] ?? 0) + 1 })

  const cliches: { phrase: string; line: string }[] = []
  for (const c of CLICHES[lang]) {
    const parts = c.split(' ').filter((p) => p.length > 2 && !stop.has(p))
    const hit = all.find((l) => { const t = l.text.toLowerCase(); return t.includes(c) || (parts.length >= 2 && parts.every((p) => t.includes(p))) })
    if (hit) cliches.push({ phrase: c, line: hit.text })
    else if (parts.length >= 2) {
      // coppie in rima tra righe consecutive (es. cuore/amore)
      for (let i = 0; i < all.length - 1; i++) {
        const a = all[i].text.toLowerCase(), b = all[i + 1].text.toLowerCase()
        if (parts.every((p) => a.includes(p) || b.includes(p)) && parts.some((p) => a.endsWith(p)) && parts.some((p) => b.endsWith(p))) { cliches.push({ phrase: c, line: `${all[i].text} / ${all[i + 1].text}` }); break }
      }
    }
  }

  return {
    lang, sections,
    totalLines: all.length,
    totalWords: ws.length,
    totalSyllables: all.reduce((s, l) => s + (lang === 'it' ? l.sung : l.syllables), 0),
    uniqueWordRatio: ws.length ? new Set(ws).size / ws.length : 0,
    topWords: Object.entries(freq).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([word, count]) => ({ word, count })),
    repeatedLines: Object.entries(lineFreq).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([text, count]) => ({ text, count })),
    cliches,
  }
}

/** Testo riassuntivo delle misure, per l'AI. */
export function lyricsReport(a: LyricsAnalysis, music?: { bpm?: number; duration?: number; sections?: string }) {
  const sung = a.lang === 'it'
  return `MISURE DEL TESTO (calcolate con regole, sillabazione stimata${sung ? ', con sinalefi' : ''}):
- Lingua rilevata: ${a.lang === 'it' ? 'italiano' : 'inglese'} · righe ${a.totalLines} · parole ${a.totalWords} · sillabe ${a.totalSyllables} · varietà lessicale ${(a.uniqueWordRatio * 100).toFixed(0)}%
${a.sections.map((s) => `- ${s.name}: ${s.lines.length} righe, mediana ${s.median} sillabe, schema ${s.lines.map((l) => l.rhyme).join('')}\n${s.lines.map((l) => `    ${sung ? l.sung : l.syllables} sill. [${l.rhyme}]${l.offMeter ? ' (fuori metrica)' : ''} ${l.text}`).join('\n')}`).join('\n')}
- Parole più ripetute: ${a.topWords.map((w) => `${w.word} ×${w.count}`).join(', ') || 'nessuna'}
- Righe ripetute: ${a.repeatedLines.map((r) => `"${r.text}" ×${r.count}`).join('; ') || 'nessuna'}
- Possibili cliché (lista fissa): ${a.cliches.map((c) => c.phrase).join(', ') || 'nessuno trovato'}
${music?.bpm ? `MUSICA (dalla versione analizzata): BPM stimato ${music.bpm}${music.duration ? `, durata ${Math.round(music.duration)} s` : ''}${music.sections ? `, sezioni ${music.sections}` : ''}` : 'MUSICA: nessuna versione analizzata collegata.'}`
}

/* ---------------- prompt AI ---------------- */

export const LYRICS_CRITIC_SYSTEM = `Sei GENOS AI BRAIN in modalità CRITICA: editor di testi e songwriter esigente che lavora per Genos (synthpop sperimentale). Analizzi il testo di una canzone.

REGOLE
1. Non riscrivere il testo intero. Intervieni su versi specifici, citandoli tra virgolette.
2. Per ogni problema proponi al massimo 2 versi alternativi nello stile e nella lingua dell'autore, non nel tuo.
3. Valuta: immagini (concrete o generiche), cliché e frasi fatte, coerenza con il concept e le decisioni del progetto, punto di vista, forza dell'hook/ritornello, struttura, rime forzate, metrica (usa le sillabe fornite: sono stime), cantabilità (vocali aperte sulle note lunghe, consonanti dure nei passaggi veloci).
4. Usa la densità sillabica rispetto al BPM quando disponibile (righe troppo piene per il tempo).
5. Critico e diretto, niente complimenti di circostanza. Se qualcosa funziona, una riga per dire perché.
6. Rispetta le decisioni creative e non riproporre idee scartate.
7. Se mancano informazioni decisive (melodia esistente? lingua definitiva? tema?), fai al massimo 3 domande alla fine.

FORMATO (markdown)
## Sintesi
## Cosa funziona
## Problemi
Per ognuno: ### titolo · **Verso:** "..." · **Problema:** · **Perché conta:** · **Proposte:** (max 2 versi alternativi)
## Metrica e cantabilità
## Domande`

export const LYRICS_BRAINSTORM_SYSTEM = `Sei GENOS AI BRAIN in modalità CREATIVA (brainstorming) per il testo e la melodia di una canzone di Genos (synthpop sperimentale).

REGOLE
1. Brainstorming, non prodotto finito: proponi idee varie e distinte tra loro, non variazioni della stessa.
2. Originalità non è casualità: per ogni idea spiega in una riga perché funziona e qual è il suo limite.
3. Parti dal concept del progetto e dal testo esistente; non riproporre idee scartate; rispetta le decisioni.
4. Evita cliché e immagini generiche (cuore, anima, notte, stelle) a meno che non le ribalti in modo esplicito.
5. Per le idee melodiche descrivi: andamento (sale/scende/ripetuto), registro, ritmo rispetto al BPM, dove cade l'accento, relazione con la tonalità se fornita. Non scrivere notazione che non puoi verificare.
6. Italiano (o la lingua del testo se diversa).

FORMATO (markdown)
## Angolazioni
3–5 punti di vista o temi possibili.
## Immagini e dettagli concreti
## Hook e titoli
5 proposte di hook/ritornello brevi.
## Idee melodiche
3 idee.
## Da scartare subito
Le direzioni più ovvie da evitare, in una riga ciascuna.`
