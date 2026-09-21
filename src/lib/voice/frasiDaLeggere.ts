/**
 * ⭐⭐ LEGGERE MENTRE LA RISPOSTA SI SCRIVE, non dopo.
 *
 * Owner 2026-08-10: «il TTS deve partire di pari passo con il rendering della
 * risposta».
 *
 * ## Il problema, in una riga
 *
 * Il testo arriva a pezzi — a volte una parola, a volte mezza. Mandarne ognuno
 * al motore vocale produce una voce che singhiozza; aspettare la fine produce
 * il difetto che l'owner ha visto, cioè una voce che parte quando la risposta è
 * già stata letta con gli occhi.
 *
 * ⇒ Si legge per FRASI COMPLETE: appena una frase è finita, si può dire, e la
 * successiva si prepara mentre quella suona.
 *
 * ## ⛔ «Completa» vuol dire chiusa, non «c'è un punto»
 *
 * Un punto non basta: `dott.`, `3.14`, `ecc.` sono punti in mezzo a una frase,
 * e tagliare lì fa dire «dott» con la voce che scende, poi riparte. Si taglia
 * su un segno di fine seguito da uno SPAZIO e da una lettera maiuscola o da
 * fine testo — che è la forma che una frase vera ha quasi sempre.
 *
 * ⛔ E l'ULTIMO pezzo non si dice finché il flusso non è finito: mentre arriva,
 * l'ultima frase è quasi sempre monca.
 */

import { isTalosAgentToolId } from '@/lib/tools/toolControls'

/** Quanto testo si accetta di tenere in coda senza mai dirlo. */
const CODA_MASSIMA = 4_000

/**
 * ⛔ LE ABBREVIAZIONI, e perché una lista qui NON viola «niente scritto a mano».
 *
 * La regola del progetto dice: se è un fatto sul modello o sul dispositivo, si
 * MISURA. Questo non lo è — è una convenzione della lingua italiana e inglese,
 * e non c'è niente da misurare su un telefono che possa dire se «dott.» chiude
 * una frase. Si dichiara, e si dichiara che è una lista.
 *
 * MISURATO da un test un minuto dopo aver scritto la regola: «Il dott. Rossi
 * arriva» veniva tagliato dopo «dott.», perché dopo il punto c'è uno spazio e
 * una maiuscola — la forma esatta di una fine frase. La voce avrebbe detto
 * «Il dott» calando il tono, e poi ripreso.
 */
const ABBREVIAZIONI: ReadonlySet<string> = new Set([
    'dott', 'dr', 'sig', 'sig.ra', 'prof', 'ing', 'avv', 'arch', 'geom',
    'ecc', 'es', 'pag', 'cfr', 'nr', 'num', 'tel', 'via', 'v', 'sec',
    'mr', 'mrs', 'ms', 'st', 'vs', 'etc', 'eg', 'ie', 'approx', 'fig',
])

/** L'ultima parola prima del punto, in minuscolo e senza segni. */
function parolaPrimaDi(testo: string, punto: number): string {
    let i = punto - 1
    while (i >= 0 && /[\p{L}]/u.test(testo[i]!)) i--
    return testo.slice(i + 1, punto).toLowerCase()
}

export interface TalosFrasiPronte {
    /** Le frasi complete, da dire in quest'ordine. */
    pronte: string[]
    /** Ciò che resta e non è ancora una frase: si terrà per il giro dopo. */
    resto: string
}

/**
 * Divide il testo arrivato finora in frasi dicibili più un resto.
 *
 * @param testo il testo accumulato dall'inizio della risposta
 * @param giaDette quanti caratteri sono già stati mandati al motore
 * @param finito vero quando il flusso è chiuso: allora anche il resto si dice
 */
export function talosFrasiDaLeggere(
    testo: string,
    giaDette: number,
    finito: boolean,
): TalosFrasiPronte {
    const nuovo = testo.slice(giaDette)
    if (!nuovo) return { pronte: [], resto: '' }

    const pronte: string[] = []
    let inizio = 0
    for (let i = 0; i < nuovo.length; i++) {
        const c = nuovo[i]!
        if (c !== '.' && c !== '!' && c !== '?' && c !== '\n') continue
        // ⛔ Il taglio vale solo se dopo c'è uno stacco: uno spazio e una
        // maiuscola, oppure la fine di ciò che è arrivato. «3.14» e «dott.»
        // non sono fini di frase.
        // ⛔ Un punto dopo un'abbreviazione non chiude niente, anche se dopo
        // c'è una maiuscola: «dott. Rossi» è una frase sola.
        if (c === '.' && ABBREVIAZIONI.has(parolaPrimaDi(nuovo, i))) continue
        const dopo = nuovo.slice(i + 1)
        const stacco = c === '\n'
            || /^\s+["'«(]?[A-ZÀÈÉÌÒÙ0-9]/.test(dopo)
            || (finito && dopo.trim() === '')
        if (!stacco) continue
        const frase = nuovo.slice(inizio, i + 1).trim()
        if (frase) pronte.push(frase)
        inizio = i + 1
    }

    let resto = nuovo.slice(inizio)
    if (finito) {
        const ultima = resto.trim()
        if (ultima) pronte.push(ultima)
        resto = ''
    }
    /*
     * ⛔ Una risposta senza punteggiatura — un elenco, del codice, una lingua
     * che non usa il punto — non deve restare muta per sempre. Oltre il tetto
     * si dice quello che c'è: meglio una frase tagliata male che il silenzio.
     */
    if (!finito && resto.length > CODA_MASSIMA) {
        pronte.push(resto.trim())
        resto = ''
    }
    /*
     * ⛔⛔ UN NOME INTERNO NON SI PRONUNCIA.
     *
     * MISURATO sul Pad l'11 agosto, sonda sul ponte nativo
     * (`Capacitor.nativePromise` → `["TalosSpeech","speak",{text}]`), durante
     * una corsa del pilota. Catturato in ordine:
     *
     *     "device_screen_drive"                 ⛔
     *     "Ok, vado alla schermata iniziale"    ✅
     *
     * La lettura segue il testo in STREAMING, e in quell'istante lo stream del
     * provider portava il nome del tool nel canale di testo — succede mentre la
     * chiamata parte. A voce «device underscore screen underscore drive» non lo
     * capisce nessuno: è la stessa famiglia di `nessunNomeInterno`, stavolta
     * all'orecchio invece che all'occhio.
     *
     * ⛔ Il criterio è STRETTO di proposito: si tace solo ciò che combacia con
     * un id del catalogo. Un filtro generico su tutto ciò che ha un trattino
     * basso mangerebbe nomi di file, righe di codice e parole vere che la
     * persona ha chiesto di sentire.
     */
    return { pronte: pronte.filter((frase) => !soloUnNomeDiTool(frase)), resto }
}

/**
 * La frase è SOLO l'identificativo di uno strumento?
 *
 * ⛔ «Solo»: se il nome sta dentro una frase vera — «ho usato device_torch per
 * accenderla» — la frase si dice comunque. Togliere una parola in mezzo
 * lascerebbe un buco che si sente, e quel che conta è non leggere ad alta voce
 * una riga che è soltanto un identificativo.
 */
function soloUnNomeDiTool(frase: string): boolean {
    const nudo = frase.trim().replace(/^["'«(]+|["'»).,;:!?]+$/g, '')
    return nudo.length > 0 && isTalosAgentToolId(nudo)
}
