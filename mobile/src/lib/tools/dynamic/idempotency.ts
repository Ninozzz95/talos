/**
 * ⛔⛔ Owner 2026-08-27 — finding critico #5 della revisione: "idempotenza
 * solo nominale". L'interprete generava la stessa chiave su retry
 * (`${executionId}:${nodeId}`, corretta — arXiv 2608.02645 la chiede
 * creata prima del primo tentativo, non durante i retry) ma nessuna
 * capability locale (`talosIntegration.ts`) la usava per deduplicare: se
 * il primo tentativo riusciva ma la risposta si perdeva, il retry poteva
 * creare un doppione.
 *
 * ⛔ Confine onesto di questo file: consultato QUI, nell'interprete, il
 * ledger deduplica i retry DENTRO un singolo giro del ciclo — la finestra
 * in cui l'esecuzione locale sa già di aver avuto successo. Non risolve
 * la classe di guasto più profonda in cui l'effetto avviene DENTRO
 * `repository.createTask(...)` e la risposta si perde PRIMA che
 * l'interprete arrivi a scrivere qui — quello richiede che sia la
 * capability stessa a deduplicare per chiave (lavoro di Fase 3, quando
 * la persistenza reale sostituisce Preferences). Ricerca 2026 (pattern di
 * idempotency key): "only cache successful operations... caching error
 * responses can block successful retries" — qui si scrive SOLO sul
 * successo, mai su un fallimento, cosi un tentativo fallito resta
 * ritentabile normalmente.
 */
export interface ForgeIdempotencyRecord {
    key: string
    result: unknown
    storedAt: number
}

export interface ForgeIdempotencyStore {
    get(key: string): Promise<ForgeIdempotencyRecord | null>
    put(key: string, result: unknown): Promise<void>
}

/**
 * Riferimento in-memoria, scoped al processo: sufficiente per deduplicare
 * i retry di UNA esecuzione (l'unico caso che questo livello può
 * davvero risolvere, vedi sopra). Nessuna gestione di concorrenza fra
 * processi: un solo interprete gira alla volta su un solo executionId,
 * quindi non serve un pattern di prenotazione a due fasi qui — servirebbe
 * per un ledger persistente condiviso, non per questo.
 */
export function createInMemoryForgeIdempotencyStore(ttlMs = 10 * 60_000): ForgeIdempotencyStore {
    const records = new Map<string, ForgeIdempotencyRecord>()
    return {
        async get(key: string): Promise<ForgeIdempotencyRecord | null> {
            const record = records.get(key)
            if (!record) return null
            if (Date.now() - record.storedAt > ttlMs) { records.delete(key); return null }
            return record
        },
        async put(key: string, result: unknown): Promise<void> {
            records.set(key, { key, result, storedAt: Date.now() })
        },
    }
}
