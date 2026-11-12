/*
 * Telefono 0.1.48 (owner 11/11/2026 17:45, «Cura completa»): ciò che la compattazione ha accorciato per stare nella
 * finestra del dispositivo, detto nella riga del riassunto. Modulo a parte e senza dipendenze: lo leggono la riga (caricata
 * al bisogno) e lo store della compattazione, mai l'avvio (il cancello `verify-initial-chunk.mjs` pesa l'avvio al byte).
 */
export interface TalosAccorciatiPerLaFinestra { esiti: number, scambi: number }

/**
 * La frase, con le parole del PC per lo stesso caso (`harness-ui/frontend/src/i18n/testi/chat.js:2061`, «{n} results
 * shortened: TALOS may not have seen everything.»). `null` se non si è accorciato niente: la riga resta quella di sempre.
 */
export function testoAccorciatiPerLaFinestra(
    t: (chiave: string, valori?: Record<string, string | number>) => string,
    accorciati: Partial<TalosAccorciatiPerLaFinestra> | null | undefined,
): string | null {
    const numero = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : 0)
    const esiti = numero(accorciati?.esiti)
    const scambi = numero(accorciati?.scambi)
    const parti: string[] = []
    if (esiti) parti.push(t(esiti === 1 ? 'chat.compaction.resultsShortenedOne' : 'chat.compaction.resultsShortenedMany', { n: esiti }))
    if (scambi) parti.push(t(scambi === 1 ? 'chat.compaction.exchangesLeftOutOne' : 'chat.compaction.exchangesLeftOutMany', { n: scambi }))
    return parti.length ? t('chat.compaction.shortenedForDevice', { what: parti.join(' · ') }) : null
}
