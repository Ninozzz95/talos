/**
 * ⛔ L'anteprima della dettatura col motore locale (ledger `LEDGER-DETTATURA-ANTEPRIMA-FUORI-2026-10-18.md`).
 *
 * Owner 18/10/2026 notte, dal telefono: «il testo quando parlo si vede … ma si blocca a metà quando premi invio però si vede tutto
 * formattato bene». Le parole vive del riconoscitore di sistema arrivano IN RITARDO (misurato il 13/10: la prima ~3 s dopo l'inizio,
 * le altre «a frase già finita»), e il testo giusto di Parakeet si vedeva solo alla conferma. Owner: «Parakeet aggiorna l'anteprima
 * alle pause».
 *
 * La regola: a ogni pausa Parakeet rilegge tutto ciò che ha sentito (`riletto`). Da lì l'anteprima è il suo testo, più le parole che il
 * sistema manda DOPO quella rilettura. Il sistema però è in ritardo, quindi le sue prime parole «nuove» sono spesso la coda della
 * frase che Parakeet ha già scritto: quella parte si riconosce (parole uguali a meno di maiuscole e punteggiatura) e non si ripete.
 */
export function talosAnteprimaDettatura({ riletto, sistemaAllaRilettura, sistema }: {
    /** L'ultima rilettura di Parakeet, o `null` se non ce n'è ancora una. */
    riletto: string | null
    /** Il testo del sistema nell'istante della rilettura. */
    sistemaAllaRilettura: string
    /** Il testo del sistema adesso. */
    sistema: string
}): string {
    if (!riletto) return sistema
    const base = parole(sistemaAllaRilettura)
    const ora = parole(sistema)
    // ⛔ ANT-DET-06 (Pad, 18/10/2026): il sistema può aprire un tratto nuovo senza annunciare la chiusura del primo, e allora il suo
    // testo non comincia più con quello della rilettura. Non è una riscrittura da ignorare (l'anteprima restava ferma 7 s): le sue
    // parole valgono come nuove, e si tolgono quelle che Parakeet ha già scritto.
    const continua = ora.length >= base.length && base.every((p, i) => chiave(p) === chiave(ora[i]!))
    const nuove = continua ? ora.slice(base.length) : ora
    const sovrapposte = giaScritte(parole(riletto).map(chiave), nuove.map(chiave))
    const resto = nuove.slice(sovrapposte)
    return resto.length ? `${riletto} ${resto.join(' ')}` : riletto
}

function parole(testo: string): string[] {
    return testo.trim().split(/\s+/u).filter(Boolean)
}

/** Una parola per il confronto: minuscola, senza punteggiatura (apostrofi compresi), forma Unicode unica. */
function chiave(parola: string): string {
    return parola.normalize('NFC').toLocaleLowerCase().replace(/[\p{P}\p{S}]/gu, '')
}

/**
 * Quante parole all'inizio di `nuove` sono già scritte, di seguito, da qualche parte nel testo di Parakeet (la corsa più lunga).
 * ⛔ ANT-DET-05 (Pad, 18/10/2026): il sistema in ritardo può mandare un pezzo che sta DENTRO il testo («mi hai dato» di «…che mi hai
 * dato oggi.»), non solo alla fine. Una parola davvero nuova che coincide per caso costa poco: alla pausa dopo Parakeet riscrive tutto.
 */
function giaScritte(coda: readonly string[], nuove: readonly string[]): number {
    for (let k = Math.min(coda.length, nuove.length); k > 0; k -= 1) {
        for (let da = 0; da + k <= coda.length; da += 1) {
            let uguali = true
            for (let i = 0; i < k; i += 1) {
                if (coda[da + i] !== nuove[i]) { uguali = false; break }
            }
            if (uguali) return k
        }
    }
    return 0
}
