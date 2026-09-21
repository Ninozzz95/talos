/*
 * Il porto del motore di ricerca (L3) è diviso fra DUE sessioni che lavorano
 * sulla stessa cartella `src/research/`. Alcuni dei file di questa metà
 * importano, per nome concordato, file dell'altra metà — `run.mjs`,
 * `verification.mjs`, `collector.mjs` e compagnia.
 *
 * ⛔ Un test che esplode con `ERR_MODULE_NOT_FOUND` perché l'altra metà non è
 * ancora atterrata non sta misurando niente: sta rosso per una ragione che non
 * riguarda il codice che dovrebbe provare. Ma neanche si può ingoiare
 * l'errore in silenzio — è così che un file «portato» resta senza prove e
 * nessuno se ne accorge.
 *
 * ⇒ Qui si salta SOLO se il modulo mancante è uno dei nomi che l'altra metà
 * possiede, e il motivo finisce scritto nell'esito del test. Se a mancare è un
 * file MIO, l'errore rilancia: un mio refuso deve restare rosso.
 *
 * (È la stessa forma della lezione «il catch GIUSTO nasconde il bug SBAGLIATO»,
 * 10/09/2026: un catch che degrada in silenzio dichiara quale guasto copre e
 * rilancia tutto il resto.)
 */

/**
 * I file di `src/research/` che porta l'ALTRA sessione, con i nomi concordati
 * nel disegno §6.2. Solo per questi si accetta di saltare.
 */
export const FILE_DELL_ALTRA_META = Object.freeze([
    'run.mjs',
    'plan.mjs',
    'verification.mjs',
    'opposing.mjs',
    'open-cards.mjs',
    'recheck.mjs',
    'recheck-history.mjs',
    'recheck-document.mjs',
    'collector.mjs',
    'synthesis.mjs',
])

/**
 * Carica un modulo del porto, oppure dice perché non si può ancora.
 *
 * @param {string} percorso Specificatore relativo a QUESTO file, es. `'../../src/research/outline.mjs'`.
 * @returns {Promise<{ modulo: Record<string, any> | null, motivo: string | false }>}
 *   `motivo` è `false` quando il modulo c'è — la forma che `node:test` vuole per «non saltare».
 */
export async function caricaOppureSalta(percorso) {
    try {
        return { modulo: await import(new URL(percorso, import.meta.url).href), motivo: false }
    } catch (errore) {
        if (errore?.code !== 'ERR_MODULE_NOT_FOUND') throw errore

        const messaggio = String(errore.message ?? '')
        const mancante = FILE_DELL_ALTRA_META.find((nome) => messaggio.includes(nome))
        // ⛔ Non è un file dell'altra metà: allora è un mio refuso, e resta rosso.
        if (!mancante) throw errore

        return {
            modulo: null,
            motivo: `src/research/${mancante} lo porta l'altra sessione di L3 e non è ancora sul disco`,
        }
    }
}
