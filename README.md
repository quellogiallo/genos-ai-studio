# GENOS AI STUDIO

Assistente creativo privato per progetti musicali e audiovisivi.

**Stato attuale: Music Lab Fase 2 + Video Lab Fase 1** — progetti, memoria creativa, impostazioni AI, backup,
analisi audio misurata, e il percorso video da concept a sceneggiatura. Content / Art sono visibili ma non ancora attivi (nessuna funzione simulata).

## Video Lab (V1)

Progetto attivo → Video Lab → crea un video → segui i passi:

1. **Concept** — scrivi l'idea; l'AI la analizza in modo critico (debolezze, cliché) e ti fa domande. Le tue risposte diventano vincoli.
2. **Direzione artistica** — tre proposte diverse con palette, look, luce, camera, motivazione e limiti. Ne scegli una; quelle scartate finiscono tra le *idee scartate* del progetto e non vengono riproposte.
3. **Moodboard** — immagini e link. I colori dominanti delle immagini sono misurati dall'app. L'AI non vede le immagini: legge le tue note e suggerisce cosa cercare.
4. **Schede condivise** — personaggi, ambienti, oggetti: la fonte unica della coerenza tra le scene.
5. **Sceneggiatura** — scene con azione, schede coinvolte, musica, durata. L'app controlla la durata totale e segnala i nomi senza scheda.

Se colleghi un brano del Music Lab, le scene usano durata e sezioni misurate.

**Senza chiave a pagamento:** i passi AI funzionano con qualsiasi chiave salvata in Setup (anche Gemini gratuita). In alternativa ogni passo AI ha la modalità manuale — *Copia prompt*, incollalo in una chat di Claude
(abbonamento), poi incolla la risposta nell'app. Il risultato è identico e non ha costi aggiuntivi.

Passi 06–11 (storyboard, shot list, prompt per scena, riprese, montaggio, color, export) arrivano con V2 e V3.

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

## Music Lab (F2) — Diagnosi AI

Nella versione di un brano, scheda **Diagnosi AI**. Tre strade:
- **Diagnosi automatica**: l'AI (Gemini gratuito o Claude API) riceve SOLO i dati misurati + contesto del progetto
  (decisioni, idee scartate, reference) + confronto con la versione precedente, e risponde nel formato
  Diagnosi → Problema → Causa → Intervento (Ableton) → Alternative creative.
- **Ascolto AI** (solo Gemini): il modello ascolta il brano (mono 16 kHz, max 8 minuti) e descrive strumenti
  e arrangiamento. È una percezione, non una misura.
- **Copia per Claude**: copia lo stesso prompt per incollarlo in una chat di Claude (usa l'abbonamento, nessuna API);
  poi incolli la risposta nell'app per salvarla.

## Music Lab (F3) — Confronto versioni

Nella pagina del brano: **Confronta versioni A/B** (servono 2 versioni analizzate).
- Lettore A/B: le due versioni suonano sincronizzate, il cambio è istantaneo alla stessa posizione.
  "Volume allineato" abbassa la più forte della differenza di LUFS (Web Audio, funziona anche su iPhone).
- Allineamento automatico (attacchi, risoluzione 10 ms) se una versione parte prima; regolabile a mano.
- Loudness nel tempo sovrapposta, controlli risolti/nuovi, tabella delle differenze, spettri sovrapposti
  e differenza spettrale a parità di volume.
- Valutazione AI del confronto (o Copia per Claude), salvata sulla versione B.

Chiave Gemini gratuita: https://aistudio.google.com/apikey → Setup → Google (Gemini) → Salva e verifica.

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
- `src/lib/music/diagnosis.ts` — prompt della diagnosi e preparazione audio per l'ascolto
- `src/lib/audio/` — motore di analisi (loudness, spettro, stime) eseguito in un Web Worker
- `src/lib/video/` — modello dati del Video Lab, prompt e controllo delle risposte AI, colori dominanti
- `src/components/AiRunner.tsx` — esegue un passo AI via API oppure in modalità manuale (copia/incolla)
- `src/pages/`, `src/components/` — interfaccia
