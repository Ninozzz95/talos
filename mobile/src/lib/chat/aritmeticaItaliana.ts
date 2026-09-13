/**
 * ⭐⭐⭐ «SETTE PER OTTO» — cosa legge un modello piccolo, e come glielo si scrive.
 *
 * ## Il fatto, misurato sul Pad l'11/09/2026
 *
 * `llama cli` compilato dal sottomodulo pinnato (stesso commit dell'app,
 * `b400-451b89b`), temperatura 0, sette modelli locali, la stessa domanda in
 * due forme:
 *
 * ```
 *                  «Quanto fa 7 x 8?»   «Quanto fa sette per otto?»
 *   gemma3 1B              56                    13
 *   granite 2B             56                     8
 *   Qwen2.5 3B             56                     7
 *   LFM2.5 2.6B            56                 0,875      ← esattamente 7 ÷ 8
 *   Llama-3.2 3B           56                   7,5
 *   gemma3 4B              56                    56
 *   Qwen3 4B               56                    56
 * ```
 *
 * Cinque modelli su sette SANNO la moltiplicazione e sbagliano la domanda.
 * LFM2.5 dice anche perché: legge «per» come *divided by*. E su gemma3 1B
 * nessuna delle due mezze cure basta — «7 per 8» dà 14, «sette × otto» dà 40:
 * servono insieme le cifre E l'operatore esplicito.
 *
 * ## ⭐ La cura viene dalla ricerca, non da un'idea
 *
 * [ITLC a SemEval-2026, arXiv 2603.02676](https://arxiv.org/html/2603.02676),
 * letto l'11/09/2026: il metodo che porta il ragionamento multilingue al 100% è
 * l'**English Pivot Normalization** — si porta in forma canonica SOLO la
 * parola-operatore, e il contenuto resta intatto. Senza quel passo il
 * multilingue perde tre punti, e l'italiano è citato fra i casi che si rompono.
 *
 * ⇒ Questo modulo fa quella cosa e soltanto quella: riscrive
 * `numero · operatore · numero` nella forma `7 x 8` — la x ASCII, l'unica
 * forma provata giusta su sette modelli su sette; il segno `×` non l'ho mai
 * visto funzionare — e non tocca nient'altro della frase.
 *
 * ## ⛔ Il perimetro stretto è metà del lavoro
 *
 * - «cinque **per cento**» è il 5 %, e «cento» è un numero: una regola ingenua
 *   lo trasformerebbe in `5 x 100`. «per» seguito da 100 o 1000 non si tocca.
 * - «controlla i file **uno per uno**» vuol dire *uno alla volta*: diventerebbe
 *   `1 x 1`. Si esclude.
 * - «il **Settecento**» è un secolo, non 700: i numeri si convertono SOLO
 *   quando sono operandi di un operatore, mai da soli.
 * - «per favore», «tre volte per settimana», «10 euro per persona» restano
 *   intatti: da un lato di «per» non c'è un numero.
 *
 * ⛔ Si cambia solo ciò che il MODELLO legge. Ciò che la persona ha scritto, e
 * ciò che resta salvato nella chat, non passa di qui.
 */

/*
 * I numerali italiani, dalle regole di formazione — Wikibooks «Italian/Lessons/
 * Lesson4», Dante Learning «Italian Cardinal Variants», Elon.io «Cardinal
 * Numbers 21–100», letti l'11/09/2026:
 *   - la decina perde la vocale finale davanti a «uno» e «otto»: ventuno, ventotto;
 *   - «tre» in coda prende l'accento: ventitré, centotré (si accetta anche senza,
 *     perché su una tastiera di telefono l'accento spesso non si scrive);
 *   - «cento» è invariabile: duecento, trecento;
 *   - «mille» diventa «mila» quando si moltiplica: duemila, diecimila.
 */
const UNITA: Readonly<Record<string, number>> = {
    zero: 0, uno: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9,
}
const DA_DIECI_A_DICIANNOVE: Readonly<Record<string, number>> = {
    dieci: 10, undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15,
    sedici: 16, diciassette: 17, diciotto: 18, diciannove: 19,
}
const DECINE: ReadonlyArray<readonly [string, number]> = [
    ['venti', 20], ['trenta', 30], ['quaranta', 40], ['cinquanta', 50],
    ['sessanta', 60], ['settanta', 70], ['ottanta', 80], ['novanta', 90],
]

function sottoCento(parola: string): number | null {
    if (Object.hasOwn(UNITA, parola)) return UNITA[parola]!
    if (Object.hasOwn(DA_DIECI_A_DICIANNOVE, parola)) return DA_DIECI_A_DICIANNOVE[parola]!
    for (const [decina, valore] of DECINE) {
        if (parola === decina) return valore
        // Intera («ventidue») o con la vocale caduta davanti a uno/otto («ventuno»).
        for (const radice of [decina, decina.slice(0, -1)]) {
            if (!parola.startsWith(radice)) continue
            const resto = parola.slice(radice.length)
            if (!Object.hasOwn(UNITA, resto)) continue
            const unita = UNITA[resto]!
            if (unita === 0) continue
            const elisa = radice.length < decina.length
            // L'elisione vale SOLO davanti a vocale: «ventuno» sì, «ventdue» no,
            // e nemmeno «ventiuno», che nessuno scrive.
            if (elisa !== (resto === 'uno' || resto === 'otto')) continue
            return valore + unita
        }
    }
    return null
}

function sottoMille(parola: string): number | null {
    const diretto = sottoCento(parola)
    if (diretto !== null) return diretto
    const i = parola.indexOf('cent')
    if (i < 0) return null
    let moltiplicatore = 1
    if (i > 0) {
        const prima = parola.slice(0, i)
        if (!Object.hasOwn(UNITA, prima)) return null
        moltiplicatore = UNITA[prima]!
        // «unocento» non esiste: il cento si dice senza l'uno davanti.
        if (moltiplicatore < 2) return null
    }
    const coda = parola.slice(i)
    // «cento…» oppure «cent…» con la «o» caduta davanti a uno/otto/ottanta.
    for (const radice of ['cento', 'cent']) {
        if (!coda.startsWith(radice)) continue
        const resto = coda.slice(radice.length)
        if (resto === '') return radice === 'cento' ? moltiplicatore * 100 : null
        const r = sottoCento(resto)
        if (r === null) continue
        // La «o» cade solo davanti a vocale: «centotto» sì, «centdue» no.
        if (radice === 'cent' && !/^[uo]/.test(resto)) continue
        return moltiplicatore * 100 + r
    }
    return null
}

/**
 * Un numerale italiano scritto in lettere, o in cifre, fino a 9.999. `null` se
 * la parola non è un numero.
 *
 * ⛔ Il tetto è voluto: questo serve alle domande di aritmetica che una persona
 * scrive a un telefono, non a leggere un bilancio. Un convertitore completo
 * sarebbe più codice da sbagliare per casi che nessuno ha misurato.
 */
export function numeroDaParola(testo: string): number | null {
    const parola = testo.trim().toLowerCase().replace(/[éè]/g, 'e')
    if (/^\d{1,4}$/.test(parola)) return Number(parola)
    if (!/^[a-z]+$/.test(parola)) return null
    const piccolo = sottoMille(parola)
    if (piccolo !== null) return piccolo
    // Le migliaia: «mille…» oppure «<n>mila…».
    let migliaia: number | null = null
    let resto = ''
    if (parola.startsWith('mille')) {
        migliaia = 1
        resto = parola.slice('mille'.length)
    } else {
        const i = parola.indexOf('mila')
        if (i > 0) {
            migliaia = sottoMille(parola.slice(0, i))
            resto = parola.slice(i + 'mila'.length)
            // «unomila» non esiste: si dice «mille».
            if (migliaia !== null && migliaia < 2) migliaia = null
        }
    }
    if (migliaia === null || migliaia > 9) return null
    if (resto === '') return migliaia * 1000
    const r = sottoMille(resto)
    return r === null ? null : migliaia * 1000 + r
}

const SIMBOLO: Readonly<Record<string, string>> = {
    'per': 'x', 'moltiplicato per': 'x', 'x': 'x', '×': 'x', '*': 'x',
    'più': '+', 'piu': '+', 'meno': '-', 'diviso': '/', 'diviso per': '/',
}

/*
 * Un numerale è una sequenza di cifre o di lettere: se è davvero un numero lo
 * decide `numeroDaParola`, non l'espressione. Se non lo è, il pezzo si lascia
 * com'era — ed è così che «10 euro per persona» resta intatto.
 *
 * ⛔ Gli operatori fatti di LETTERE vogliono uno spazio ai due lati
 * (`\s+`): «settexotto» non è una domanda. I simboli no (`\s*`): «7*8» sì.
 */
const NUMERALE = String.raw`(\d{1,4}|[A-Za-zÀ-ÿ]+)`
const ESPRESSIONE = new RegExp(
    String.raw`(?<![\p{L}\d])${NUMERALE}`
    + String.raw`(?:\s+(moltiplicato\s+per|diviso\s+per|per|più|piu|meno|diviso|x)\s+|\s*([×*])\s*)`
    + String.raw`${NUMERALE}(?![\p{L}\d])`,
    'giu',
)

/**
 * La stessa frase, con `numero · operatore · numero` riscritto come `7 x 8`.
 *
 * Idempotente: `7 x 8` resta `7 x 8`. Tutto ciò che non è un'operazione fra
 * due numeri — compresi «per cento», «uno per uno» e i numeri da soli — torna
 * identico, carattere per carattere.
 */
export function normalizzaAritmetica(testo: string): string {
    return testo.replace(
        ESPRESSIONE,
        (intero: string, sinistra: string, parolaOp: string | undefined, simboloOp: string | undefined, destra: string) => {
            const op = (parolaOp ?? simboloOp ?? '').toLowerCase().replace(/\s+/g, ' ')
            const a = numeroDaParola(sinistra)
            const b = numeroDaParola(destra)
            if (a === null || b === null) return intero
            if (op === 'per') {
                // «cinque per cento», «tre per mille», «10 per 100»: percentuali.
                if (b === 100 || b === 1000) return intero
                // «uno per uno», scritto in lettere: vuol dire uno alla volta.
                if (a === 1 && b === 1 && !/^\d/.test(sinistra)) return intero
            }
            return `${a} ${SIMBOLO[op] ?? op} ${b}`
        },
    )
}
