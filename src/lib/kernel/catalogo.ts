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
    /**
     * ⛔ Il testo ESATTO da cui ogni voce è nata.
     *
     * Serve a sapere che cosa è cambiato senza ri-analizzare, e si confronta
     * per uguaglianza di stringa — **niente digest**. Un digest introduce una
     * probabilità di collisione, e una collisione qui significa riusare le
     * dichiarazioni di un file che è cambiato: autorizzare una modifica su una
     * funzione che non c'è più. La probabilità è piccola, la conseguenza no, e
     * il confronto esatto costa pochi millisecondi su tutto il progetto.
     */
    testi: ReadonlyMap<string, string | null>
    /**
     * ⛔⛔⛔ L'ALTRO LIVELLO DI COPERTURA.
     *
     * `perFile` dice **se ho potuto leggere** ciascun file che ho elencato.
     * Questo dice **se ho elencato tutti i file che ci sono** — e sono due
     * domande diverse, che avevo confuso in una.
     *
     * Non è teorico: su un telefono lo spazio di lavoro ha un tetto, e una
     * cartella può fallire a metà lettura. Con l'elenco parziale un file che
     * esiste ma non è stato visto produce «ASSENTE: il file non esiste» — la
     * bugia peggiore che questo kernel possa dire, perché ha la forma esatta
     * della verità che sa produrre.
     */
    elenco: TalosElencoFile
}

/** `completo` = ho visto tutti i file dell'ambito. Altrimenti, perché no. */
export type TalosElencoFile = 'completo' | { troncato: string }

/** Un file letto ma illeggibile non è un file vuoto: dichiara IGNOTO. */
const ILLEGGIBILE: TalosCoperturaFile = 'sorgenteInvalida'

export async function costruisciCatalogo(
    sorgenti: readonly TalosSorgente[],
    opzioni?: {
    /**
     * Il catalogo di prima, se c'è: le voci dei file **identici** si riusano
     * invece di ri-analizzarle.
     *
     * ⭐ Misurato sul sorgente vero di TALOS: 452 file, 4,56 MB, **514 ms** per
     * una costruzione fredda — contro **0,0146 ms** per una risoluzione. Il
     * parse costa 35.000 volte il lookup, e il catalogo si ricostruisce a ogni
     * premessa: su un telefono sono secondi di attesa muta **prima** che alla
     * persona venga chiesto se autorizza.
     *
     * ⛔ Ometterlo resta corretto, sempre: è una cache, non una fonte. Se il
     * riuso divergesse anche una volta da una costruzione fredda, la velocità
     * sarebbe comprata con una bugia intermittente.
     */
        precedente?: TalosCatalogo
        /** ⛔ Chi elenca i file DICHIARA se l'elenco era completo. Il difetto
         * di prima era che nessuno lo chiedeva, quindi era sempre «sì». */
        elenco?: TalosElencoFile
    },
): Promise<TalosCatalogo> {
    const precedente = opzioni?.precedente
    const perFile = new Map<string, { copertura: TalosCoperturaFile, nomi: ReadonlySet<string> }>()
    const perNome = new Map<string, string[]>()
    const testi = new Map<string, string | null>()

    for (const { percorso, testo } of sorgenti) {
        /*
         * ⛔ Il riuso richiede DUE condizioni, e la seconda non è ridondante:
         * un file mai visto dà `undefined`, e `undefined === undefined` sarebbe
         * un falso riuso se `testo` potesse essere `undefined`. Chiedere anche
         * a `perFile` toglie la domanda invece di rispondere bene.
         */
        const gia = precedente?.perFile.get(percorso)
        if (gia && precedente!.testi.get(percorso) === testo) {
            perFile.set(percorso, gia)
            for (const nome of gia.nomi) {
                const dove = perNome.get(nome)
                if (dove) dove.push(percorso)
                else perNome.set(nome, [percorso])
            }
            testi.set(percorso, testo)
            continue
        }
        if (testo === null) {
            perFile.set(percorso, { copertura: ILLEGGIBILE, nomi: new Set() })
            testi.set(percorso, null)
            continue
        }
        const esito = await dichiaratiIn(testo, percorso)
        perFile.set(percorso, { copertura: esito.copertura, nomi: esito.nomi })
        testi.set(percorso, testo)
        for (const nome of esito.nomi) {
            const dove = perNome.get(nome)
            if (dove) dove.push(percorso)
            else perNome.set(nome, [percorso])
        }
    }
    return { perFile, perNome, testi, elenco: opzioni?.elenco ?? 'completo' }
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
    /*
     * ⛔⛔ PRIMA DI TUTTO IL RESTO: un elenco parziale toglie il potere di dire
     * «non c'è», e non quello di dire «c'è». Averlo visto è una prova che il
     * troncamento non tocca — quindi il controllo sta qui e i testimoni si
     * cercano lo stesso, poco sotto.
     */
    const parziale = catalogo.elenco === 'completo' ? null : catalogo.elenco.troncato
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
        if (parziale) return { stato: 'ignoto', perche: `the workspace listing is incomplete (${parziale}), so nothing can be ruled out in ${ambito}`, fatto }
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

    if (parziale) {
        return {
            stato: 'ignoto',
            perche: `every listed file in ${ambito} was read, but the listing itself is incomplete (${parziale})`,
            fatto,
        }
    }

    const copertura: TalosCopertura = 'completa'
    return { stato: 'assente', perche: `"${nome}" is not declared anywhere in ${ambito}`, copertura, fatto }
}

/** ⛔ Le estensioni che il catalogo sa leggere — chi elenca i file lo deve sapere. */
export { ESTENSIONI_SORGENTE }
