/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M3: la frase di ogni esito del controllo remoto, scelta dal telefono (contratto: il PC manda
 * codici, il telefono parla). Le frasi stanno in `computer.errors.*` (inglese e italiano). «Annulla» della persona non è un errore.
 */
const FRASI: Readonly<Record<string, string>> = Object.freeze({
    PAIR_REJECTED: 'computer.errors.rejected',
    PAIR_EXPIRED: 'computer.errors.expired',
    PAIR_TOKEN_INVALID: 'computer.errors.tokenInvalid',
    PAIR_LOCKED: 'computer.errors.locked',
    CODE_MISMATCH: 'computer.errors.codeMismatch',
    REVOKED: 'computer.errors.revoked',
    NOT_PAIRED: 'computer.errors.notPaired',
    CONNECT_FAILED: 'computer.errors.unreachable',
    DISCONNECTED: 'computer.errors.disconnected',
    BAD_MESSAGE: 'computer.errors.badCode',
    SCANNER_UNAVAILABLE: 'computer.errors.scannerUnavailable',
    // revisione del blocco 10, F-R1: il lucchetto dei consensi del PC (503), da riprovare fra poco
    REMOTE_STORE_BUSY: 'computer.errors.busy',
})

/** La chiave i18n della frase, `null` per «Annulla» (nessun messaggio), la generica per un codice che il telefono non conosce. */
export function fraseErroreRemoto(code: string): string | null {
    if (code === 'CANCELLED') return null
    return FRASI[code] ?? 'computer.errors.generic'
}
