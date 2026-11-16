# GENOS AI STUDIO

Assistente creativo privato per progetti musicali e audiovisivi.

**Stato attuale: Music Lab Fase 1** — progetti, memoria creativa, impostazioni AI, backup,
upload e analisi audio misurata. Video / Content / Art sono visibili ma non ancora attivi (nessuna funzione simulata).

## Music Lab (F1)

Progetto attivo → Music Lab → crea un brano → carica una versione (WAV/AIFF consigliati, anche MP3/M4A).
L'analisi gira nel browser, il file non esce dal dispositivo.

Misurato (verificato con ffmpeg ebur128 su segnali di test, scarto < 0.1 LU):
loudness integrata, LRA, max momentary/short-term (EBU R128 / ITU-R BS.1770-4), true peak (4x),
picco campione, RMS, crest factor, PLR, clipping, DC offset, correlazione/larghezza/bilanciamento stereo,
perdita in mono, spettro medio Mid/Side, energia e larghezza per banda, pendenza spettrale, spettrogramma.

Stimato (può sbagliare, mostrato con affidabilità): BPM (con alternative metà/doppio), tonalità
(con alternativa, spesso la relativa), sezioni con lettere di somiglianza.

I "Controlli tecnici" sono regole fisse sulle misure, non giudizi artistici.

## Come si usa

1. **Setup** → incolla la chiave API Anthropic (si crea su console.anthropic.com → API Keys).
   L'API si paga a parte rispetto all'abbonamento Claude, con credito prepagato.
   Premi *Salva e verifica*, poi *Prova una richiesta reale*.
2. **Progetti** → crea un progetto e rendilo *attivo*. Compila:
   - **Concept**: di cosa parla.
   - **Decisioni creative**: vincoli fissi che l'AI dovrà rispettare.
   - **Idee scartate**: l'AI non le riproporrà.
   - **Reference**, **Obiettivi e scadenze**.
3. **Backup** → in Setup, *Esporta backup* ogni tanto. I dati vivono nel browser del dispositivo:
   telefono e PC hanno archivi separati (usa esporta/importa per spostarli).

## Dove sono i dati

- Progetti e impostazioni: IndexedDB del browser (solo sul tuo dispositivo).
- La chiave API non finisce mai nel codice né nei backup.
- Il codice è pubblico su GitHub (necessario per GitHub Pages gratuito), ma non contiene dati personali.

## Per sviluppatori

```
npm install
npm run dev      # sviluppo locale
npm run build    # build in dist/
```
Stack: React + TypeScript + Vite, Dexie (IndexedDB), react-router (HashRouter).
Pubblicazione automatica su GitHub Pages a ogni push su `main` (`.github/workflows/deploy.yml`).

Struttura:
- `src/lib/db.ts` — database locale e modello Progetto
- `src/lib/ai/` — livello AI multi-provider (`runTask` sceglie il modello per compito)
- `src/lib/context.ts` — trasforma il progetto in contesto per l'AI
- `src/lib/audio/` — motore di analisi (loudness, spettro, stime) eseguito in un Web Worker
- `src/pages/`, `src/components/` — interfaccia
