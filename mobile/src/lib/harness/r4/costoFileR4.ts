/**
 * ⛔ K3-C Allegati A3 (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`; owner 16/10, chip «Come il desktop»): il costo nel chip di un file,
 * `stimaTokenTesto` + `etichettaCosto` di `components/allegati.js` (desktop r4 @ 701c6c0d2, invariate da 2161afb32). «~N token» dai caratteri letti, con la
 * tilde perché è una stima; vuoto senza caratteri: un file che l'agente apre da sé non ha un costo noto, e nessun peso si inventa.
 *
 * Sta da solo perché la lista dei messaggi è nel pacchetto d'avvio: `allegatiR4.ts` si porta dietro i testi del desktop.
 */
export function costoDelFileR4(caratteri: number | undefined, lingua: string): string {
    const n = Number(caratteri)
    const token = Number.isFinite(n) && n > 0 ? Math.ceil(n / 4) : 0
    if (token <= 0) return ''
    if (token < 1000) return `~${token} token`
    const cifre = token < 10000 ? 1 : 0
    const locale = /^it(?:-|$)/iu.test(lingua) ? 'it-IT' : 'en-US'
    return `~${new Intl.NumberFormat(locale, { minimumFractionDigits: cifre, maximumFractionDigits: cifre }).format(Number((token / 1000).toFixed(cifre)))}k token`
}
