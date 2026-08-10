import {
    talosLeggiAzione,
    talosOsservazione,
    talosRigaDiStoria,
    type TalosAzione,
    type TalosElementoSchermo,
    type TalosMotivoScarto,
} from '@/lib/agent/passoDelloSchermo'

/**
 * ⭐⭐ IL CICLO: guarda, decide, tocca, racconta — e sa QUANDO SMETTERE.
 *
 * ## ⛔ I tetti non sono prudenza: sono la funzione
 *
 * Un agente che tocca lo schermo di un'altra persona senza un tetto non è un
 * agente, è un guasto che si ripete. Ce ne sono quattro, e ognuno esiste per un
 * modo diverso di non finire mai:
 *
 * | tetto              | il guasto che ferma                                   |
 * |--------------------|-------------------------------------------------------|
 * | passi              | il modello gira in tondo fra due schermate             |
 * | tempo              | ogni passo è lento, e venti passi lenti sono infiniti  |
 * | fallimenti di fila | tocca un elemento che non risponde, e insiste          |
 * | **la mano**        | la persona è tornata, e il telefono è suo              |
 *
 * ⛔ Il quarto non è un tetto: è un DIRITTO. Se una mano vera tocca lo schermo
 * si smette **subito**, senza finire il passo — misurato che un dito produce
 * byte sul pannello e i nostri tocchi iniettati zero (vedi `TalosDitoVero`).
 *
 * ## ⛔ E se il freno non è armato NON SI PARTE
 *
 * `frenoArmato = false` non vuol dire «nessuno ha toccato»: vuol dire «non lo
 * so». Partire senza saperlo significa che la persona può riprendere in mano il
 * telefono e trovarselo pilotato — quindi si rifiuta di cominciare, e si dice
 * perché.
 *
 * ## Perché tutto passa da porte iniettate
 *
 * Il ciclo non conosce né il ponte, né il modello, né la voce: li riceve. Così
 * ogni tetto si prova SENZA un telefono, che è l'unico modo di provarli tutti —
 * far scadere davvero due minuti in una suite non lo fa nessuno, e un tetto che
 * nessuno prova è un commento.
 */
export interface TalosLimitiDelPilota {
    /** Quanti passi al massimo. */
    passi: number
    /** Quanto può durare l'intera corsa. */
    millisecondi: number
    /** Quante azioni fallite di fila prima di arrendersi. */
    fallimentiDiFila: number
}

/**
 * I valori predefiniti.
 *
 * ⛔ `fallimentiDiFila: 2` è una DECISIONE dell'owner (2026-08-10: «retry 2 poi
 * stop»), non un numero pescato: al terzo tentativo uguale non sta succedendo
 * niente di nuovo, e insistere su uno schermo altrui è il modo di fare danni.
 */
export const TALOS_LIMITI_PREDEFINITI: Readonly<TalosLimitiDelPilota> = Object.freeze({
    passi: 20,
    millisecondi: 120_000,
    fallimentiDiFila: 2,
})

export type TalosFineCorsa =
    | { motivo: 'fine', testo?: string }
    | { motivo: 'mano-sullo-schermo', passo: number }
    | { motivo: 'freno-non-armato' }
    | { motivo: 'occhio-chiuso' }
    | { motivo: 'troppi-passi' }
    | { motivo: 'tempo-scaduto' }
    | { motivo: 'troppi-fallimenti', ultimo?: string }
    | { motivo: 'modello-non-capito', scarto: TalosMotivoScarto }

export interface TalosSguardo {
    elementi: readonly TalosElementoSchermo[]
    frenoArmato: boolean
    manoSulloSchermo: boolean
}

/** Le porte: il ponte, il modello, la voce, l'orologio. */
export interface TalosPortePilota {
    guarda(): Promise<TalosSguardo | null>
    agisci(azione: TalosAzione): Promise<{ fatto: boolean, motivo?: string }>
    /** Il modello. Riceve osservazione e storia, torna la sua riga cruda. */
    chiedi(input: { osservazione: string, storia: readonly string[] }): Promise<string>
    /** ⭐ Ciò che TALOS dice ad alta voce PRIMA di toccare. Owner: sempre. */
    racconta(frase: string): void
    adesso(): number
}

export interface TalosCorsaDelPilota {
    fine: TalosFineCorsa
    storia: readonly string[]
    passi: number
    millisecondi: number
}

/**
 * Guida fino alla fine, o fino al primo tetto che si tocca.
 *
 * ⛔ L'ordine dei controlli dentro il giro NON è casuale: prima la mano, poi il
 * tempo, poi i passi. La mano vince su tutto perché è l'unica condizione in cui
 * continuare sarebbe una prepotenza e non un errore.
 */
export async function talosGuidaLoSchermo(
    porte: TalosPortePilota,
    limiti: TalosLimitiDelPilota = TALOS_LIMITI_PREDEFINITI,
): Promise<TalosCorsaDelPilota> {
    const partenza = porte.adesso()
    const storia: string[] = []
    let passi = 0
    let fallimenti = 0
    const chiudi = (fine: TalosFineCorsa): TalosCorsaDelPilota => ({
        fine,
        storia,
        passi,
        millisecondi: porte.adesso() - partenza,
    })

    for (;;) {
        const sguardo = await porte.guarda()
        if (sguardo === null) return chiudi({ motivo: 'occhio-chiuso' })
        // ⛔ La mano PRIMA di tutto, e a ogni giro: fra il passo scorso e questo
        // la persona può aver ripreso in mano il telefono.
        if (sguardo.manoSulloSchermo) {
            return chiudi({ motivo: 'mano-sullo-schermo', passo: passi })
        }
        // ⛔ E «non lo so» conta come un no: vedi il commento in testa.
        if (!sguardo.frenoArmato) return chiudi({ motivo: 'freno-non-armato' })
        if (porte.adesso() - partenza >= limiti.millisecondi) {
            return chiudi({ motivo: 'tempo-scaduto' })
        }
        if (passi >= limiti.passi) return chiudi({ motivo: 'troppi-passi' })

        const lettura = talosLeggiAzione(
            await porte.chiedi({
                osservazione: talosOsservazione(sguardo.elementi),
                storia,
            }),
            sguardo.elementi.map((e) => e.indice),
        )
        if (!lettura.ok) return chiudi({ motivo: 'modello-non-capito', scarto: lettura.motivo })

        const azione = lettura.azione
        passi += 1
        /*
         * ⭐ Si racconta PRIMA di toccare, non dopo.
         *
         * Owner 2026-08-10: «Sempre a voce quando guida». Il punto non è la
         * cortesia: raccontare dopo informa, raccontare prima dà a chi ascolta
         * il tempo di dire «no, aspetta» mentre il dito non è ancora arrivato.
         */
        porte.racconta(azione.perche?.trim() || talosRigaDiStoria(passi, azione))

        if (azione.azione === 'fine') {
            storia.push(talosRigaDiStoria(passi, azione))
            return chiudi({ motivo: 'fine', testo: azione.testo })
        }

        const esito = await porte.agisci(azione)
        storia.push(talosRigaDiStoria(passi, azione) + (esito.fatto ? '' : ` — non riuscita: ${esito.motivo ?? 'motivo sconosciuto'}`))
        if (esito.fatto) {
            fallimenti = 0
            continue
        }
        fallimenti += 1
        if (fallimenti >= limiti.fallimentiDiFila) {
            return chiudi({ motivo: 'troppi-fallimenti', ultimo: esito.motivo })
        }
    }
}

/**
 * Come si racconta la fine a una PERSONA, in italiano.
 *
 * ⛔ Sta qui e non in un componente perché la corsa può finire mentre TALOS non
 * è a schermo — sta pilotando un'altra app — e allora questa frase è l'unica
 * cosa che la persona sente. Un `motivo` tecnico letto ad alta voce non lo
 * capirebbe nessuno.
 */
export function talosFraseDiFine(fine: TalosFineCorsa): string {
    switch (fine.motivo) {
        case 'fine':
            return fine.testo?.trim() ? `Fatto: ${fine.testo.trim()}` : 'Fatto.'
        case 'mano-sullo-schermo':
            return 'Ti ho sentito toccare lo schermo, quindi mi fermo qui.'
        case 'freno-non-armato':
            return 'Non parto: non riesco ad accorgermi se tocchi lo schermo, e senza quello non guido il tuo telefono.'
        case 'occhio-chiuso':
            return 'Non riesco a vedere lo schermo: manca il permesso di lettura dello schermo.'
        case 'troppi-passi':
            return 'Ho fatto molti passaggi senza arrivarci: mi fermo invece di continuare a provare.'
        case 'tempo-scaduto':
            return 'Ci sto mettendo troppo: mi fermo invece di continuare a provare.'
        case 'troppi-fallimenti':
            return 'Ho provato due volte e non ha funzionato: mi fermo qui.'
        case 'modello-non-capito':
            return 'Non ho capito che cosa fare da qui: mi fermo invece di toccare a caso.'
    }
}
