import type { AudioAnalysis } from './types'

/**
 * Controlli tecnici automatici: regole fisse applicate ai dati misurati.
 * NON sono giudizi artistici: segnalano solo valori fuori dalle soglie comuni.
 * La diagnosi ragionata (con contesto e genere) arriva con l'AI nella fase 2.
 */
export interface Check {
  id: string
  level: 'alert' | 'warn' | 'info' | 'ok'
  title: string
  value: string
  why: string
}

const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '−∞')

export function runChecks(a: AudioAnalysis): Check[] {
  const out: Check[] = []

  if (a.clipEvents > 0) {
    out.push({ id: 'clip', level: 'alert', title: 'Clipping digitale', value: `${a.clipEvents} punti (${a.clippedSamples} campioni)`,
      why: 'Tre o più campioni consecutivi al massimo livello: la forma d\'onda è tagliata. Di solito si sente come distorsione dura sui transienti.' })
  }

  if (a.truePeakDb > -0.1) {
    out.push({ id: 'tp', level: 'alert', title: 'True peak sopra 0 dBTP', value: `${f(a.truePeakDb, 2)} dBTP`,
      why: 'I picchi tra un campione e l\'altro superano il massimo: in conversione (DAC, MP3/AAC per lo streaming) possono distorcere.' })
  } else if (a.truePeakDb > -1) {
    out.push({ id: 'tp', level: 'warn', title: 'True peak vicino a 0', value: `${f(a.truePeakDb, 2)} dBTP`,
      why: 'Le piattaforme consigliano −1 dBTP (−2 per master molto forti) per evitare distorsione nella codifica in formati compressi.' })
  } else {
    out.push({ id: 'tp', level: 'ok', title: 'True peak con margine', value: `${f(a.truePeakDb, 2)} dBTP`, why: 'Sotto −1 dBTP: margine sufficiente per la codifica.' })
  }

  if (Number.isFinite(a.integratedLufs)) {
    const diff = a.integratedLufs - -14
    out.push({ id: 'lufs', level: 'info', title: 'Loudness e normalizzazione', value: `${f(a.integratedLufs)} LUFS`,
      why: diff > 0.5
        ? `Spotify e YouTube normalizzano intorno a −14 LUFS: questo brano verrà abbassato di circa ${f(diff)} dB. Non è un errore, ma la compressione usata per alzarlo non porta vantaggi di volume in streaming.`
        : diff < -0.5
          ? `Più basso del riferimento streaming (−14 LUFS) di ${f(-diff)} dB. Spotify lo alza solo se c'è margine di picco; Apple Music e YouTube non lo alzano.`
          : 'In linea con il riferimento di normalizzazione dello streaming (−14 LUFS).' })
  }

  if (Number.isFinite(a.plr)) {
    if (a.plr < 7) out.push({ id: 'plr', level: 'warn', title: 'Dinamica molto compressa', value: `PLR ${f(a.plr)} dB`,
      why: 'La distanza tra picchi e loudness media è ridotta: transienti schiacciati, rischio di suono affaticante. Normale in alcuni generi molto aggressivi, da valutare a orecchio.' })
    else if (a.plr > 16) out.push({ id: 'plr', level: 'info', title: 'Dinamica molto ampia', value: `PLR ${f(a.plr)} dB`,
      why: 'Picchi molto più alti della loudness media: suono aperto, ma in streaming potrebbe risultare più piano di brani simili.' })
  }

  if (a.stereo) {
    const s = a.stereo
    if (s.correlation < 0) out.push({ id: 'corr', level: 'alert', title: 'Correlazione stereo negativa', value: f(s.correlation, 2),
      why: 'I canali sono in gran parte in controfase: in mono (smartphone, casse Bluetooth, club) parti del mix si annullano.' })
    else if (s.negativeCorrPct > 5) out.push({ id: 'corr', level: 'warn', title: 'Momenti in controfase', value: `${f(s.negativeCorrPct, 0)}% del tempo`,
      why: 'In alcuni passaggi la correlazione va sotto zero: controlla quei punti nel grafico. Cause tipiche: allargatori stereo, chorus, delay molto corti.' })
    if (s.monoLossDb > 3) out.push({ id: 'mono', level: 'warn', title: 'Perdita in mono', value: `−${f(s.monoLossDb)} LU`,
      why: 'Sommato in mono il brano perde volume in modo evidente: qualcosa si cancella. Ascolta il mix in mono per capire quali elementi spariscono.' })
    if (Math.abs(s.balanceDb) > 1.5) out.push({ id: 'bal', level: 'warn', title: 'Sbilanciamento sinistra/destra', value: `${s.balanceDb > 0 ? 'Sinistra' : 'Destra'} +${f(Math.abs(s.balanceDb))} dB`,
      why: 'Un canale è più forte dell\'altro su tutto il brano. Se non è una scelta voluta, controlla panning ed effetti stereo.' })
    const low = a.bands.filter((b) => b.hi <= 250 && b.widthDb !== null && b.levelDb > -30)
    const wideLow = low.find((b) => (b.widthDb as number) > -10)
    if (wideLow) out.push({ id: 'lowwidth', level: 'warn', title: 'Basse frequenze larghe', value: `${wideLow.label}: Side/Mid ${f(wideLow.widthDb as number)} dB`,
      why: 'Sotto i 250 Hz c\'è molta informazione stereo. Le basse larghe perdono energia in mono e sono difficili da riprodurre in vinile e su impianti club.' })
  } else {
    out.push({ id: 'mono-file', level: 'info', title: 'File mono', value: '1 canale', why: 'Le misure stereo non sono disponibili.' })
  }

  if (a.dcOffset > 0.002) out.push({ id: 'dc', level: 'warn', title: 'DC offset', value: f(a.dcOffset * 100, 2) + '%',
    why: 'La forma d\'onda è spostata dallo zero: riduce il margine utile e può creare click nei tagli. Si risolve con un filtro passa-alto molto basso (5–20 Hz).' })

  if (a.fileSampleRate && a.fileSampleRate < 44100) out.push({ id: 'sr', level: 'warn', title: 'Sample rate basso', value: `${a.fileSampleRate} Hz`,
    why: 'Sotto i 44.1 kHz le alte frequenze vengono tagliate. Per master e distribuzione usa almeno 44.1 kHz.' })

  return out
}
