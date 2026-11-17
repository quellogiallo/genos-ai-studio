import Dexie from 'dexie'
import { db, CLOUD_ENABLED, getSetting, setSetting } from './db'
import { LEGACY_DB_NAME } from './cloudConfig'

/**
 * Con la sincronizzazione attiva Dexie Cloud usa un database locale nuovo
 * (nome con suffisso). Al primo avvio copiamo qui i dati del database locale
 * precedente: al login verranno caricati nel cloud. Il vecchio database non
 * viene cancellato (resta come copia di sicurezza su questo dispositivo).
 */
export async function migrateLegacyData(): Promise<number> {
  if (!CLOUD_ENABLED) return 0
  if (await getSetting<boolean>('legacyMigrated', false)) return 0
  if (db.name === LEGACY_DB_NAME || !(await Dexie.exists(LEGACY_DB_NAME))) {
    await setSetting('legacyMigrated', true)
    return 0
  }
  const old = new Dexie(LEGACY_DB_NAME)
  let copied = 0
  try {
    await old.open() // apertura "dinamica": legge lo schema esistente
    for (const t of old.tables) {
      const target = db.tables.find((x) => x.name === t.name)
      if (!target) continue
      const rows = await t.toArray()
      if (!rows.length) continue
      if (t.name === 'settings') {
        // le impostazioni locali (chiavi API, progetto attivo…) non sovrascrivono quelle già presenti
        for (const r of rows as { key: string }[]) if (!(await target.get(r.key))) await target.put(r)
      } else {
        await target.bulkPut(rows)
      }
      copied += rows.length
    }
  } finally {
    old.close()
  }
  await setSetting('legacyMigrated', true)
  return copied
}

export function cloudUserLabel(u: { email?: string; userId?: string; name?: string } | undefined) {
  return u?.email || u?.name || u?.userId || ''
}
