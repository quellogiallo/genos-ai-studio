# GENOS AI STUDIO

Assistente creativo privato per progetti musicali e audiovisivi.

**Stato attuale: Fase 0 (base dell'app)** — progetti, memoria creativa, impostazioni AI, backup.
I moduli Music / Video / Content / Art sono visibili ma non ancora attivi (nessuna funzione simulata).

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
- `src/pages/`, `src/components/` — interfaccia
