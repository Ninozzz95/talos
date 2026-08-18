import type { TalosCopertura, TalosPremessaEsito } from '@/lib/tools/registry'
import { ESTENSIONI_SORGENTE, dichiaratiIn, type TalosCoperturaFile } from '@/lib/kernel/simboli'

/**
 * ⭐⭐⭐ IL CATALOGO DEI SIMBOLI — e il suo mestiere vero è **sapere quando non sa**.
 *
 * Owner 2026-08-18: «il kernel deve occuparsi anche di coding… anche nella app
 * mobile andrà la nuova sezione codice».
 *
 * ## Perché la copertura è la parte che conta
 *
 * Per un contatto la copertura è implicita: la rubrica o si legge tutta o non si
 * legge. Per il codice no, e la differenza è tutta qui:
 *
 * ```
 * «scontoFedelta non c'è in src/prezzo.mjs»   dimostrabile
 * «scontoFedelta non c'è nel progetto»        quasi mai dimostrabile
 * ```
 *
 * Un file che non si lascia leggere, un'estensione che non sappiamo trattare, un
 * elenco troncato: ognuno rompe la seconda affermazione e lascia intatta la
 * prima. ⛔ Un solo file non coperto dentro l'ambito trasforma la risposta in
 * `ignoto` — perché quel file è un posto dove il simbolo potrebbe essere.
 *
 * ## ⛔ La copertura è del PREDICATO PER QUELL'AMBITO, non del catalogo
 *
 * Si può sapere con certezza che un nome manca in `src/prezzo.mjs` anche se metà
 * del progetto non si è potuta leggere. Legare la copertura al catalogo intero
 * renderebbe `assente` irraggiungibile in qualunque progetto vero.
 */

/** Un file del progetto, come lo consegna chi lo legge dal telefono. */
export interface TalosSorgente {
    /** Percorso relativo alla radice, con `/` — mai backslash. */
    percorso: string
    /** `null` quando il file esiste ma non si è potuto leggere. */
    testo: string | null
}

export interface TalosCatalogo {
    /** Per ogni percorso: che cosa dichiara, e con che copertura. */
    perFile: ReadonlyMap<string, { copertura: TalosCoperturaFile, nomi: ReadonlySet<string> }>
    /** Per ogni nome: in quali file è dichiarato. */
    perNome: ReadonlyMap<string, readonly string[]>
}

/** Un file letto ma illeggibile non è un file vuoto: dichiara IGNOTO. */
const ILLEGGIBILE: TalosCoperturaFile = 'sorgenteInvalida'

export async function costruisciCatalogo(sorgenti: readonly TalosSorgente[]): Promise<TalosCatalogo> {
    const perFile = new Map<string, { copertura: TalosCoperturaFile, nomi: ReadonlySet<string> }>()
    const perNome = new Map<string, string[]>()

    for (const { percorso, testo } of sorgenti) {
        if (testo === null) {
            perFile.set(percorso, { copertura: ILLEGGIBILE, nomi: new Set() })
            continue
        }
        const esito = await dichiaratiIn(testo, percorso)
        perFile.set(percorso, { copertura: esito.copertura, nomi: esito.nomi })
        for (const nome of esito.nomi) {
            const dove = perNome.get(nome)
            if (dove) dove.push(percorso)
            else perNome.set(nome, [percorso])
        }
    }
    return { perFile, perNome }
}

/** L'ambito è un FILE (ha un'estensione) o una CARTELLA? */
export function ambitoEUnFile(ambito: string) {
    return !ambito.endsWith('/') && /\.[a-z0-9]+$/i.test(ambito)
}

function dentroAmbito(percorso: string, ambito: string) {
    if (ambitoEUnFile(ambito)) return percorso === ambito
    const cartella = ambito.endsWith('/') ? ambito : `${ambito}/`
    return percorso.startsWith(cartella)
}

/**
 * ⭐ La domanda: «questo nome è dichiarato dentro questo ambito?»
 *
 * Torna un `TalosPremessaEsito`, cioè **la stessa forma** che usano i contatti e
 * le app: è ciò che rende questo un kernel solo e non tre.
 */
export function risolviSimbolo(
    catalogo: TalosCatalogo,
    nome: string,
    ambito: string,
): TalosPremessaEsito {
    const fatto = { famiglia: 'symbol-declared', nome, ambito }
    const file = [...catalogo.perFile.keys()].filter((p) => dentroAmbito(p, ambito))

    if (file.length === 0) {
        /*
         * ⛔⛔ L'AMBITO VUOTO NON È UN CASO SOLO — e la distinzione è arrivata dal
         * corpus, non da un ragionamento: creare un simbolo in un file che ancora
         * non esiste è normale, e con un unico `ignoto` il cancello sospenderebbe
         * il lavoro legittimo al primo task vero.
         *
         *   un FILE che non c'è ...... dichiara zero simboli, e li abbiamo
         *                              guardati tutti e zero ⇒ ASSENTE, certo
         *   una CARTELLA che non c'è .. un refuso nell'ambito è indistinguibile
         *                              da un albero non ancora scritto ⇒ IGNOTO
         */
        if (ambitoEUnFile(ambito)) {
            return { stato: 'assente', perche: `"${nome}" is not declared in ${ambito} (the file does not exist)`, copertura: 'completa', fatto }
        }
        return { stato: 'ignoto', perche: `nothing is known about ${ambito}`, fatto }
    }

    const testimoni = (catalogo.perNome.get(nome) ?? []).filter((p) => dentroAmbito(p, ambito))
    if (testimoni.length > 0) return { stato: 'presente', fatto: { ...fatto, ambito: testimoni[0]! } }

    /*
     * ⛔⛔ QUI SI DECIDE. Nessun testimone non basta per dire ASSENTE: bisogna
     * aver guardato **tutto** l'ambito con copertura completa. Ogni file non
     * coperto è un posto dove il simbolo potrebbe essere, e uno solo trasforma
     * la risposta in IGNOTO.
     */
    const scoperti = file.filter((f) => catalogo.perFile.get(f)!.copertura !== 'completa')
    if (scoperti.length > 0) {
        const perche = catalogo.perFile.get(scoperti[0]!)!.copertura
        return {
            stato: 'ignoto',
            perche: `${scoperti.length} file(s) in ${ambito} could not be read (${perche}), starting with ${scoperti[0]}`,
            fatto,
        }
    }

    const copertura: TalosCopertura = 'completa'
    return { stato: 'assente', perche: `"${nome}" is not declared anywhere in ${ambito}`, copertura, fatto }
}

/** ⛔ Le estensioni che il catalogo sa leggere — chi elenca i file lo deve sapere. */
export { ESTENSIONI_SORGENTE }
