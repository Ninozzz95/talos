/*
 * ⛔⛔ LE RICERCHE CHE CONTINUANO — F001b (audit 28-29/09/2026), decisione owner 01/10/2026 «Ricerca che continua»,
 *   con «riferimento esplicito» e «nella sessione, in memoria».
 *
 * Il difetto: `cerca` uccideva ripgrep a 20 secondi. Con qualcosa già trovato lo dichiarava; senza niente ripartiva con la
 * camminata in JavaScript — più lenta, ferma a 20.000 file — cioè 20 secondi persi e poi una ricerca peggiore.
 *
 * I concorrenti, letti nel codice il 01/10/2026: Claude Code 2.1.283 uccide ripgrep a 20 s (60 su WSL) e restituisce i
 * parziali o «Ripgrep search timed out… Try searching a more specific path or pattern»; Pi `bf8e4b9`, OpenCode `0f54984` e
 * Hermes `65ad529` non hanno un tempo massimo proprio; Codex `4226624` passa dalla shell. Nessuno ha una camminata JS, e
 * nessuno lascia continuare la ricerca dopo aver risposto: il modello o aspetta, o perde quello che ripgrep non ha finito.
 * ⇒ Qui la ricerca che supera il tempo della risposta resta viva nella SESSIONE: il modello riceve ciò che c'è già e un
 *   riferimento, e la riprende con `cerca {"continua": id}` quando vuole, con le stesse pagine.
 *
 * I limiti, scelti dall'owner: al massimo 2 ricerche in corso per sessione, 10 minuti ciascuna, 32 MB di uscita; ferme con
 * Stop o con l'eliminazione della sessione; il risultato resta leggibile 10 minuti dopo la fine. In memoria: un riavvio del
 * server le perde, e `cerca` lo dice invece di fingere che non siano mai esistite.
 */
export const RICERCHE_MASSIME_IN_CORSO = 2
export const DURATA_MASSIMA_RICERCA_MS = 10 * 60_000
export const BYTE_MASSIMI_RICERCA = 32 * 1024 * 1024
export const CONSERVA_DOPO_LA_FINE_MS = 10 * 60_000

/**
 * Il registro di UNA sessione. `voce` (registra) è ciò che il kernel sa della ricerca: `ferma(motivo)` per fermarla, e
 * `finita` (una promessa che si risolve quando il processo è uscito). Il registro non legge l'uscita: la tiene il kernel.
 */
export function creaRegistroRicerche({
    massimoInCorso = RICERCHE_MASSIME_IN_CORSO, durataMassimaMs = DURATA_MASSIMA_RICERCA_MS,
    byteMassimi = BYTE_MASSIMI_RICERCA, conservaDopoMs = CONSERVA_DOPO_LA_FINE_MS, ora = () => Date.now(),
} = {}) {
    const voci = new Map()
    let progressivo = 0
    const inCorso = () => [...voci.values()].filter((v) => v.stato === 'in-corso')
    return {
        byteMassimi,
        durataMassimaMs,
        massimoInCorso,
        conservaDopoMs,
        puoAvviare: () => inCorso().length < massimoInCorso,
        /** Registra una ricerca viva; torna il suo riferimento («r1», «r2»…, unico nella sessione). */
        registra(voce) {
            const id = `r${++progressivo}`
            const registrata = Object.assign(voce, { id, stato: 'in-corso', avviataAlle: voce.avviataAlle ?? ora(), finitaAlle: null, durataMassimaMs })
            voci.set(id, registrata)
            const tetto = setTimeout(() => { if (registrata.stato === 'in-corso') registrata.ferma('scaduta') }, durataMassimaMs)
            tetto.unref?.()
            Promise.resolve(registrata.finita).finally(() => {
                clearTimeout(tetto)
                if (registrata.stato === 'in-corso') registrata.stato = 'finita'
                registrata.finitaAlle = ora()
                const via = setTimeout(() => voci.delete(id), conservaDopoMs)
                via.unref?.()
            })
            return id
        },
        prendi: (id) => (typeof id === 'string' ? voci.get(id) ?? null : null),
        /** Stop della sessione, eliminazione, spegnimento: ogni ricerca ancora viva si ferma. */
        fermaTutte(motivo = 'fermata') {
            for (const v of inCorso()) v.ferma(motivo)
        },
    }
}
