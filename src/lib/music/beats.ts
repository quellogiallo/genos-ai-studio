/* Concept beat: prompt, controllo della risposta JSON e anteprima sonora del groove. */

export const LANES = ['kick', 'snare', 'clap', 'hat', 'openhat', 'perc'] as const
export type Lane = (typeof LANES)[number]
export const LANE_LABEL: Record<Lane, string> = { kick: 'Cassa', snare: 'Rullante', clap: 'Clap', hat: 'Hi-hat', openhat: 'Hat aperto', perc: 'Perc' }

export interface BeatConcept {
  titolo: string
  idea: string
  perche_funziona: string
  limiti: string
  bpm: number
  swing: number
  groove: Partial<Record<Lane, string>>
  palette: { ruolo: string; suono: string; ableton: string }[]
  arrangiamento: { sezione: string; battute: number; cosa_succede: string }[]
  prompt_ai: string
  variante_sperimentale: string
}

export interface BeatResult { concepts: BeatConcept[]; domande: string[] }

export const BEAT_SYSTEM = `Sei GENOS AI BRAIN in modalità CREATIVA + TECNICA: produttore che inventa concept di beat per Genos (synthpop sperimentale, produce in Ableton Live).

REGOLE
1. Proponi esattamente 3 concept DAVVERO diversi tra loro (groove, palette, energia), non tre variazioni dello stesso.
2. Originalità non è casualità: ogni scelta deve servire l'idea. Per ogni concept spiega perché funziona e quali sono i limiti.
3. Parti dal concept del progetto, dalle reference fornite (con i loro dati misurati, se ci sono) e dalla richiesta. Rispetta le decisioni, non riproporre idee scartate.
4. Il groove è una battuta in 4/4 a 16 step (sedicesimi). Per ogni strumento una stringa di ESATTAMENTE 16 caratteri: "x" = colpo, "o" = colpo leggero (ghost note), "." = pausa. Usa solo gli strumenti che servono tra: kick, snare, clap, hat, openhat, perc.
5. Palette: suoni concreti e come ottenerli in Ableton con strumenti ed effetti nativi (Drum Rack, Operator, Wavetable, Drift, Simpler, Saturator, Echo, Hybrid Reverb…).
6. Arrangiamento: sezioni con numero di battute.
7. prompt_ai: un prompt in INGLESE per generatori musicali AI (stile, tempo, strumenti, mood, struttura), max 400 caratteri, senza nomi di artisti reali.
8. Italiano per tutto il resto.

RISPONDI SOLO CON JSON VALIDO, senza testo prima o dopo, con questa struttura:
{"concepts":[{"titolo":"","idea":"","perche_funziona":"","limiti":"","bpm":120,"swing":0,"groove":{"kick":"x...x...x...x...","snare":"....x.......x...","hat":"x.x.x.x.x.x.x.x."},"palette":[{"ruolo":"","suono":"","ableton":""}],"arrangiamento":[{"sezione":"","battute":8,"cosa_succede":""}],"prompt_ai":"","variante_sperimentale":""}],"domande":[]}
swing va da 0 a 60 (percentuale). domande: massimo 3, solo se servono davvero.`

/** Estrae e controlla il JSON della risposta; lancia un errore leggibile se non è valido. */
export function parseBeats(text: string): BeatResult {
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('La risposta non contiene JSON. Riprova, oppure incolla solo il blocco JSON.')
  let raw: unknown
  try { raw = JSON.parse(text.slice(start, end + 1)) } catch { throw new Error('Il JSON della risposta non è valido (forse è stato tagliato). Riprova.') }
  const r = raw as { concepts?: unknown[]; domande?: unknown[] }
  if (!Array.isArray(r.concepts) || !r.concepts.length) throw new Error('Nella risposta non ci sono concept.')
  const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
  const concepts = r.concepts.map((c0) => {
    const c = c0 as Record<string, unknown>
    const groove: Partial<Record<Lane, string>> = {}
    const g = (c.groove ?? {}) as Record<string, unknown>
    for (const lane of LANES) {
      const s = str(g[lane]).replace(/[^xXoO.\-_ 0-1]/g, '').replace(/[-_ 0]/g, '.').replace(/1/g, 'x').toLowerCase()
      if (s.replace(/\./g, '').length) groove[lane] = (s + '.'.repeat(16)).slice(0, 16)
    }
    return {
      titolo: str(c.titolo) || 'Senza titolo', idea: str(c.idea), perche_funziona: str(c.perche_funziona), limiti: str(c.limiti),
      bpm: Math.max(50, Math.min(220, Number(c.bpm) || 120)), swing: Math.max(0, Math.min(60, Number(c.swing) || 0)),
      groove,
      palette: Array.isArray(c.palette) ? c.palette.map((p0) => { const p = p0 as Record<string, unknown>; return { ruolo: str(p.ruolo), suono: str(p.suono), ableton: str(p.ableton) } }) : [],
      arrangiamento: Array.isArray(c.arrangiamento) ? c.arrangiamento.map((a0) => { const a = a0 as Record<string, unknown>; return { sezione: str(a.sezione), battute: Number(a.battute) || 0, cosa_succede: str(a.cosa_succede) } }) : [],
      prompt_ai: str(c.prompt_ai), variante_sperimentale: str(c.variante_sperimentale),
    }
  })
  return { concepts, domande: Array.isArray(r.domande) ? r.domande.map(str).filter(Boolean) : [] }
}

export function beatsToMarkdown(r: BeatResult): string {
  return r.concepts.map((c, i) => [
    `## ${i + 1}. ${c.titolo} — ${c.bpm} BPM`,
    c.idea, `**Perché funziona:** ${c.perche_funziona}`, `**Limiti:** ${c.limiti}`,
    '```', ...Object.entries(c.groove).map(([k, v]) => `${k.padEnd(8)} ${v}`), '```',
    ...c.palette.map((p) => `- **${p.ruolo}:** ${p.suono} — ${p.ableton}`),
    `**Arrangiamento:** ${c.arrangiamento.map((a) => `${a.sezione} (${a.battute})`).join(' → ')}`,
    `**Prompt AI:** ${c.prompt_ai}`, `**Variante sperimentale:** ${c.variante_sperimentale}`,
  ].join('\n\n')).join('\n\n') + (r.domande.length ? `\n\n## Domande\n${r.domande.map((d) => `- ${d}`).join('\n')}` : '')
}

/* ---------------- anteprima del groove (suoni sintetizzati nel browser) ---------------- */

let shared: AudioContext | null = null

function hit(ctx: AudioContext, dest: AudioNode, lane: Lane, t: number, vel: number, noise: AudioBuffer) {
  const out = ctx.createGain()
  out.connect(dest)
  if (lane === 'kick') {
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
    out.gain.setValueAtTime(0.9 * vel, t); out.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
    o.connect(out); o.start(t); o.stop(t + 0.4)
    return
  }
  const src = ctx.createBufferSource(); src.buffer = noise
  const f = ctx.createBiquadFilter()
  const conf: Record<Exclude<Lane, 'kick'>, { type: BiquadFilterType; freq: number; dec: number; g: number }> = {
    snare: { type: 'bandpass', freq: 1800, dec: 0.18, g: 0.7 },
    clap: { type: 'bandpass', freq: 1200, dec: 0.12, g: 0.7 },
    hat: { type: 'highpass', freq: 7000, dec: 0.045, g: 0.35 },
    openhat: { type: 'highpass', freq: 6000, dec: 0.3, g: 0.3 },
    perc: { type: 'bandpass', freq: 3500, dec: 0.06, g: 0.5 },
  }
  const c = conf[lane]
  f.type = c.type; f.frequency.value = c.freq
  out.gain.setValueAtTime(c.g * vel, t); out.gain.exponentialRampToValueAtTime(0.001, t + c.dec)
  src.connect(f).connect(out); src.start(t); src.stop(t + c.dec + 0.05)
  if (lane === 'snare') {
    const o = ctx.createOscillator(), g2 = ctx.createGain()
    o.frequency.value = 190; g2.gain.setValueAtTime(0.4 * vel, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
    o.connect(g2).connect(dest); o.start(t); o.stop(t + 0.12)
  }
}

/** Suona il groove per `bars` battute. Restituisce la durata e una funzione per fermarlo. */
export function playGroove(groove: Partial<Record<Lane, string>>, bpm: number, swing: number, bars = 4): { duration: number; stop: () => void } {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  shared = shared ?? new Ctx()
  const ctx = shared
  ctx.resume()
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const step = 60 / bpm / 4
  const t0 = ctx.currentTime + 0.08
  const master = ctx.createGain()
  master.gain.value = 0.8
  master.connect(ctx.destination)
  for (let b = 0; b < bars; b++) {
    for (let s = 0; s < 16; s++) {
      const sw = s % 2 === 1 ? (swing / 100) * step * 0.66 : 0
      const t = t0 + (b * 16 + s) * step + sw
      for (const lane of LANES) {
        const ch = groove[lane]?.[s]
        if (ch === 'x' || ch === 'o') hit(ctx, master, lane, t, ch === 'x' ? 1 : 0.45, noise)
      }
    }
  }
  return { duration: bars * 16 * step, stop: () => master.disconnect() }
}
