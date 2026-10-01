/*
 * OEM36 (ledger Codex `Downloads/handoff-talos-2026-09-27/LEDGER-OEM36-2026-09-30.md`; owner 30/09 sera: sì a
 * iconv-lite@0.7.3, pin in `OEM36-upstream-pin.json`, integrity sha512-IKXpvIzj…). I programmi Windows scrivono spesso nella
 * code page OEM (cp850 in Italia) e i byte conservati non sono UTF-8: qui chi chiama può chiedere ESPLICITAMENTE di
 * interpretarli con una codifica di un elenco chiuso. Mai una codifica indovinata dalla lingua della macchina o da `chcp`:
 * la lingua del sistema non prova la codifica di ogni programma né dei suoi due flussi.
 * ⇒ `TextDecoder` di Node non copre cp437/850/852 (ledger, fonti O01/O02); iconv-lite sì, e si carica SOLO quando si
 *   chiede una codifica diversa da UTF-8: il percorso normale non la tocca.
 * ⇒ Decodifica con `stripBOM:false` e controllo di andata e ritorno: una mappatura che non torna identica (byte non
 *   definito in quella code page) restituisce null, mai testo inventato. Un NUL è binario: null.
 */
import { ProcessOutputStoreError } from './process-output-contract.mjs'

export const PROCESS_OUTPUT_ENCODINGS = Object.freeze(['utf-8', 'cp437', 'cp850', 'cp852', 'cp866', 'windows-1251', 'windows-1252'])

let iconv = null
async function caricaIconv() {
    if (iconv) return iconv
    try { iconv = (await import('iconv-lite')).default }
    catch (cause) {
        throw Object.assign(new ProcessOutputStoreError('The code page decoder is not available in this installation.', 'OUTPUT_DECODER_UNAVAILABLE'), { cause })
    }
    return iconv
}

/** I byte di una code page a byte singolo come testo, oppure null se contengono NUL o non tornano identici. */
export async function decodeSingleByteProcessOutput(bytes, encoding) {
    if (!PROCESS_OUTPUT_ENCODINGS.includes(encoding) || encoding === 'utf-8') {
        throw new ProcessOutputStoreError('Invalid process output page request', 'OUTPUT_INVALID_INPUT')
    }
    const dati = Buffer.from(bytes)
    if (dati.includes(0)) return null
    const libreria = await caricaIconv()
    const testo = libreria.decode(dati, encoding, { stripBOM: false })
    // Nessuna di queste code page ha un carattere che valga U+FFFD: se compare, un byte non era definito. L'andata e
    // ritorno da sola non basta — in windows-1251 il byte 0x98 torna identico (misurato il 30/09/2026).
    if (testo.includes('\uFFFD')) return null
    const ritorno = libreria.encode(testo, encoding, { addBOM: false })
    return Buffer.compare(ritorno, dati) === 0 ? testo : null
}
