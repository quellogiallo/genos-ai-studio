/**
 * Indirizzo del database cloud (Dexie Cloud) per la sincronizzazione tra dispositivi.
 * Non è un segreto: l'accesso ai dati richiede il login con email + codice,
 * e il database accetta solo richieste dal sito dell'app.
 * Vuoto = sincronizzazione disattivata, l'app lavora solo in locale.
 */
export const CLOUD_DB_URL = 'https://zrt07piks.dexie.cloud'

/** Tabelle che restano solo sul dispositivo (chiavi API, file pesanti). */
export const LOCAL_ONLY_TABLES = ['settings', 'audioFiles', 'videoImages']

/** Nome del database locale usato prima della sincronizzazione. */
export const LEGACY_DB_NAME = 'genos-ai-studio'
