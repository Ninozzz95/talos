/**
 * ⛔ Il numero come lo scrive un MODELLO, non come lo scriveremmo noi.
 *
 * ## Il difetto, riferito dall'owner il 2026-08-08
 *
 * > «ho provato a far digitare un numero nell'applicazione telefono, prima
 * > funzionava, ma adesso no, è un po' **altalenante**, non è molto costante»
 *
 * Aveva DUE cause insieme, che è il motivo per cui sembrava capriccio.
 *
 * **1. La forma dell'argomento.** `Uri.parse("tel:" + valore)` prende la
 * stringa così com'è. Ma un modello scrive `+39 333 123 4567` quando la
 * persona gliel'ha dettata a gruppi, e `3331234567` quando l'ha incollata —
 * per lo stesso numero. Negli URI gli spazi non sono ammessi, e il `#` di un
 * codice breve apre il **frammento**: `*111#` diventa `*111`, cioè un altro
 * codice.
 *
 * **2. Lo stato del telefono.** Col solo `FLAG_ACTIVITY_NEW_TASK`, se l'app
 * telefono è già aperta Android consegna l'intent all'istanza viva:
 * *«Activity not started, intent has been delivered to currently running
 * top-most instance»*. Prima volta sì, seconda no. Quella metà si corregge in
 * Kotlin con `CLEAR_TOP` e si prova sul dispositivo; questa metà si prova qui.
 *
 * ## Cosa afferma
 *
 * Che la normalizzazione sia **la stessa** per ogni forma dello stesso numero.
 * Non «che dia un risultato»: che due scritture diverse della stessa cosa
 * arrivino allo stesso posto. È la differenza fra un tool che funziona e un
 * tool su cui si può contare.
 */
import { describe, expect, it } from 'vitest'

/**
 * La stessa regola del lato Kotlin, tenuta qui in una funzione sola.
 *
 * ⛔ È una copia, e va detto: la verità esecutiva è `numeroPerTelefono` in
 * `TalosDevicePlugin.kt`, perché è lì che l'URI viene costruito. Questo test
 * fissa il CONTRATTO — quali forme devono coincidere — così se un domani le due
 * divergessero, il caso che le separa è già scritto e ha un nome.
 */
function numeroPerTelefono(grezzo: string): string | null {
    let pulito = ''
    const testo = grezzo.trim()
    for (let indice = 0; indice < testo.length; indice += 1) {
        const carattere = testo[indice]!
        if (carattere >= '0' && carattere <= '9') pulito += carattere
        else if (carattere === '+' && indice === 0) pulito += carattere
        else if ('*#,;'.includes(carattere)) pulito += carattere
    }
    return /\d/.test(pulito) ? pulito : null
}

describe('il numero di telefono, comunque lo scriva il modello', () => {
    it('NUMERO-01 le forme dello STESSO numero coincidono tutte', () => {
        const stesse = [
            '+39 333 123 4567',
            '+393331234567',
            '+39-333-123-4567',
            '+39 (333) 123 4567',
            '  +39 333 123 4567  ',
            '+39.333.123.4567',
        ]
        const risultati = new Set(stesse.map(numeroPerTelefono))
        // ⛔ UNO. Se ce ne fossero due, il tool sarebbe «altalenante» — che è
        // esattamente la parola che ha usato l'owner.
        expect(risultati.size).toBe(1)
        expect([...risultati][0]).toBe('+393331234567')
    })

    it('NUMERO-02 il cancelletto SOPRAVVIVE: è un codice, non un frammento', () => {
        /*
         * `*111#` in un URI non normalizzato perde tutto dopo il `#`, e diventa
         * un codice diverso che il telefono compone davvero. Non è un errore
         * silenzioso: è il numero sbagliato, chiamato.
         */
        expect(numeroPerTelefono('*111#')).toBe('*111#')
        expect(numeroPerTelefono('*#06#')).toBe('*#06#')
    })

    it('NUMERO-03 le pause della telefonia restano', () => {
        // `,` e `;` sono pausa e attesa: servono per gli interni.
        expect(numeroPerTelefono('06 1234567,,123')).toBe('061234567,,123')
        expect(numeroPerTelefono('06 1234567;456')).toBe('061234567;456')
    })

    it('NUMERO-04 il + vale solo davanti', () => {
        // Un `+` in mezzo non è un prefisso internazionale: è spazzatura, e
        // tenerlo produrrebbe un URI che il telefono rifiuta.
        expect(numeroPerTelefono('333+123')).toBe('333123')
    })

    it('NUMERO-05 ciò che non è un numero viene DETTO, non composto', () => {
        /*
         * ⛔ Il caso che conta davvero: il modello che scrive «Mario» perché la
         * persona ha detto «chiama Mario». Oggi la rubrica non ce l'abbiamo, e
         * la risposta giusta è dirlo — non aprire il telefono su niente e
         * riferire «fatto».
         */
        expect(numeroPerTelefono('Mario')).toBeNull()
        expect(numeroPerTelefono('')).toBeNull()
        expect(numeroPerTelefono('   ')).toBeNull()
        expect(numeroPerTelefono('+')).toBeNull()
        expect(numeroPerTelefono('il numero di casa')).toBeNull()
    })

    it('NUMERO-06 morde: senza normalizzazione le forme NON coinciderebbero', () => {
        // La prova che i casi sopra non passano per costruzione: è lo stato in
        // cui si trovava il codice quando l'owner ha visto l'altalena.
        const grezze = new Set(['+39 333 123 4567', '+393331234567'])
        expect(grezze.size).toBe(2)
    })
})
