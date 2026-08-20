/**
 * ⛔⛔ SIDEBAR-PIATTA-01 — venti righe uguali, tutte «1 h fa».
 *
 * ## Cosa ho visto, misurato il 2026-08-20
 *
 * Provando i modelli locali ho aperto venti chat di prova, e la barra laterale
 * è diventata un muro: «Dimmi le coordinate del telefono» ripetuto dodici
 * volte, e sotto ognuna «1 h fa», «1 h fa», «1 h fa». L'unica cosa che
 * distingueva due righe era un tempo relativo che a quella distanza è
 * identico — cioè nessun appiglio per scorrere.
 *
 * ## La convenzione, dalla ricerca del 2026-08-20
 *
 * È la stessa in tutti i prodotti di chat: **Oggi · Ieri · Precedenti 7 giorni
 * · Precedenti 30 giorni**, poi il nome del mese. E l'ordinamento è per ultimo
 * aggiornamento, non per creazione: una chat di sei mesi fa risale in cima nel
 * momento in cui le scrivi — che è già ciò che fa questa app.
 *
 * ## ⛔ «Oggi» è un GIORNO, non ventiquattro ore
 *
 * Una chat delle 23:50 di ieri, guardata alle 00:10, non diventa «oggi» perché
 * sono passati venti minuti: è **ieri**, e chi la cerca la cerca lì. Il confine
 * è la mezzanotte locale, non una sottrazione di millisecondi — ed è la
 * differenza che si nota solo di notte, cioè quando nessuno la prova.
 *
 * ⛔ Puro e senza I/O, e l'istante arriva da fuori: un modulo che leggesse
 * l'orologio da sé non si potrebbe provare al confine della mezzanotte, che è
 * l'unico punto in cui questo codice può sbagliare.
 */

export type TalosChatBucket =
    | 'today'
    | 'yesterday'
    | 'last7'
    | 'last30'
    | 'older'
    /** ⛔ Chi non ha una data: va in fondo, ma va. Sparire è peggio. */
    | 'undated'

export interface TalosChatDateGroup<T> {
    readonly bucket: TalosChatBucket
    /** `2026-05` per i gruppi mensili, altrimenti `null`. */
    readonly monthKey: string | null
    readonly items: readonly T[]
}

/** La mezzanotte locale del giorno a cui appartiene questo istante. */
function inizioDelGiorno(quando: Date): number {
    return new Date(quando.getFullYear(), quando.getMonth(), quando.getDate()).getTime()
}

const GIORNO = 86_400_000

export function talosChatDateBuckets<T>(
    items: readonly T[],
    quando: (item: T) => string | null | undefined,
    now: Date,
): readonly TalosChatDateGroup<T>[] {
    const oggi = inizioDelGiorno(now)

    /*
     * ⛔ Prima si ORDINA, poi si raggruppa, e in questo ordine.
     *
     * Raggruppare prima vorrebbe dire ordinare dentro ogni gruppo — cioè
     * ordinare N volte e dover ricordare di farlo su ognuno. Ordinando una
     * volta sola, l'ordine dentro i gruppi arriva da sé, e i gruppi escono già
     * dal più recente perché li incontriamo in quell'ordine.
     */
    const conData: { item: T, istante: number }[] = []
    const senzaData: T[] = []
    for (const item of items) {
        const grezzo = quando(item)
        const istante = grezzo ? Date.parse(grezzo) : Number.NaN
        if (Number.isNaN(istante)) senzaData.push(item)
        else conData.push({ item, istante })
    }
    conData.sort((a, b) => b.istante - a.istante)

    const gruppi: TalosChatDateGroup<T>[] = []
    // Si accumula nell'ultimo gruppo finché la chiave non cambia: le voci
    // arrivano già ordinate, quindi una chiave che cambia non torna mai.
    let ultimaChiave: string | null = null

    for (const { item, istante } of conData) {
        const giorno = inizioDelGiorno(new Date(istante))
        const distanza = Math.round((oggi - giorno) / GIORNO)

        let bucket: TalosChatBucket
        let monthKey: string | null = null
        if (distanza <= 0) bucket = 'today'
        else if (distanza === 1) bucket = 'yesterday'
        else if (distanza <= 7) bucket = 'last7'
        else if (distanza <= 30) bucket = 'last30'
        else {
            bucket = 'older'
            const data = new Date(istante)
            monthKey = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
        }

        const chiave = monthKey ?? bucket
        if (chiave !== ultimaChiave) {
            gruppi.push({ bucket, monthKey, items: [] })
            ultimaChiave = chiave
        }
        ;(gruppi[gruppi.length - 1]!.items as T[]).push(item)
    }

    if (senzaData.length) gruppi.push({ bucket: 'undated', monthKey: null, items: senzaData })
    return gruppi
}
