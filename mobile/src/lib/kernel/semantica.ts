import type * as TS from 'typescript'
import { caricaCompilatore, ESTENSIONI_SORGENTE, estensioneDi, genereDi } from '@/lib/kernel/simboli'
import type { TalosPremessaEsito } from '@/lib/tools/registry'
import type { TalosSorgente } from '@/lib/kernel/catalogo'

/**
 * ⭐⭐⭐ IL LIVELLO SEMANTICO — «questo nome si RISOLVE davvero?»
 *
 * ## Perché il livello sintattico non basta
 *
 * `catalogo.ts` risponde a una domanda stretta e a buon mercato: **questo nome è
 * dichiarato in questo file?** Basta per il caso che il banco misura — «usa la
 * funzione X che sta già in Y» — e costa un parse per file.
 *
 * Ma su un progetto vero non basta, e il caso che lo dimostra è a una riga:
 *
 * ```ts
 * // riesporta.ts
 * export { conSconto as sconto } from './prezzo'
 * ```
 *
 * Il nome `sconto` **esiste** — è `conSconto` rinominato in transito. Un
 * catalogo che segue solo le dichiarazioni testuali direbbe che si risolve
 * (perché `export {}` dichiara il nome) ma non saprebbe **a che cosa**. E su
 * `import { sconto } from './riesporta'` in un terzo file, la domanda «esiste
 * davvero qualcosa dietro quel nome?» il parser non la può nemmeno formulare.
 *
 * ⇒ Per questo serve il **checker**: `getAliasedSymbol()` segue l'intera catena
 * di alias fino al simbolo originale.
 *
 * ## ⛔ E il difetto che costa più caro, se si sbaglia
 *
 * Questo livello serve alla garanzia **G2**: il commit viene rifiutato se la
 * modifica introduce riferimenti che non esistono. G1 — «non tocchi ciò che non
 * c'è» — **non la implica**:
 *
 * ```js
 * // il bersaglio ESISTE, l'autorità sul bersaglio è valida
 * export function totale(items) {
 *     return applicaScontoVip(items)  // <-- questa NON esiste
 * }
 * ```
 *
 * ⛔ Provare che il bersaglio esiste non prova che i nomi introdotti esistano.
 * Sono due garanzie, e prometterne una avendo l'altra è la bugia più facile.
 *
 * ## ⛔ Il costo, dichiarato invece che nascosto
 *
 * Un `ts.Program` non è gratis. Questo livello **non** va chiamato per ogni
 * lettura: si chiama **una volta prima del commit**, sul candidato. Il livello
 * sintattico resta la risposta veloce per tutto il resto.
 */

/**
 * Le diagnostiche che significano «questo nome non si risolve».
 *
 * ⛔⛔ LA LISTA SI CHIEDE AL COMPILATORE, non si scrive a memoria. La prima
 * stesura ne aveva sei e ne mancava una che conta: un alias verso un export
 * inesistente — `export { scontoFedelta as sconto } from './prezzo'` dove
 * `scontoFedelta` non c'è — non emette `TS2304` ma **`TS2305`**. Il test lo ha
 * scoperto, e il compilatore ha detto quale.
 *
 * ⇒ Ogni codice qui sotto ha un test che lo produce. Aggiungerne uno «per
 * sicurezza» senza un caso che lo emetta è peggio che non averlo: fa credere
 * coperto un buco che nessuno ha visto.
 *
 * ⛔ E la lista **non è chiusa**: è il sottoinsieme che sappiamo riconoscere.
 * Un riferimento rotto in un modo che non è qui dentro passerebbe — ed è un
 * limite dichiarato, non una garanzia.
 */
export const CODICI_RIFERIMENTO_MANCANTE = Object.freeze(new Set([
    2304, // Cannot find name 'X'
    2305, // Module 'Y' has no exported member 'X'  ← trovato da un test, non a memoria
    2307, // Cannot find module 'X'
    2339, // Property 'X' does not exist on type 'Y'
    2551, // Property 'X' does not exist on type 'Y'. Did you mean 'Z'?
    2552, // Cannot find name 'X'. Did you mean 'Y'?
    2503, // Cannot find namespace 'X'
    2724, // 'Y' has no exported member named 'X'. Did you mean 'Z'?
]))

/**
 * L'impronta di una diagnostica, per confrontare PRIMA e DOPO.
 *
 * ⛔⛔ SENZA LA POSIZIONE, e non è una svista. Una modifica legittima sposta gli
 * offset di tutto ciò che viene dopo: mettendo la posizione nell'impronta, ogni
 * errore preesistente sembrerebbe nuovo, e il cancello rifiuterebbe qualunque
 * cosa in un progetto che ha anche un solo errore vecchio.
 *
 * ⇒ La posizione si tiene a parte, per mostrarla a chi legge — non per decidere.
 */
export interface TalosImprontaDiagnostica {
    codice: number
    file: string | null
    messaggio: string
}

export function improntaDi(ts: typeof TS, d: TS.Diagnostic): TalosImprontaDiagnostica {
    return {
        codice: d.code,
        file: d.file ? d.file.fileName : null,
        messaggio: ts.flattenDiagnosticMessageText(d.messageText, ' ').trim(),
    }
}

/**
 * ⛔ Il separatore è ESPLICITO, e per poco non lo era.
 *
 * Concatenando i campi senza separatore, `{codice: 23, file: '04.ts'}` e
 * `{codice: 2304, file: '.ts'}` producono la stessa chiave: due errori diversi
 * che si annullano nel confronto. Un carattere di controllo non può comparire
 * in un codice, in un percorso o in un messaggio, ed è la stessa scelta già
 * fatta altrove in questa casa per la chiave canonica di una chiamata.
 */
const SEPARATORE = String.fromCharCode(31)
const chiaveDi = (i: TalosImprontaDiagnostica) =>
    `${i.codice}${SEPARATORE}${i.file ?? ''}${SEPARATORE}${i.messaggio}`

/**
 * Le diagnostiche INTRODOTTE passando da un albero all'altro.
 *
 * ⛔ È un confronto a **multiset**, non a insieme: se il progetto aveva già due
 * errori identici e adesso ne ha tre, il terzo è nuovo. Con un insieme quel
 * terzo sparirebbe, ed è esattamente il caso di una funzione duplicata.
 */
export function introdotte(
    prima: readonly TalosImprontaDiagnostica[],
    dopo: readonly TalosImprontaDiagnostica[],
): TalosImprontaDiagnostica[] {
    const conto = new Map<string, number>()
    for (const d of prima) {
        const k = chiaveDi(d)
        conto.set(k, (conto.get(k) ?? 0) + 1)
    }
    const nuove: TalosImprontaDiagnostica[] = []
    for (const d of dopo) {
        const k = chiaveDi(d)
        const restano = conto.get(k) ?? 0
        if (restano > 0) conto.set(k, restano - 1)
        else nuove.push(d)
    }
    return nuove
}

/**
 * ⛔⛔⛔ LA LIBRERIA STANDARD, e senza di lei il cancello ACCUSA CODICE SANO.
 *
 * Trovato da un test, non da un ragionamento: sostituire una funzione con
 * `righe.length` veniva rifiutato per *«Property 'length' does not exist on type
 * '{}'»*. Non era la modifica a essere rotta — era il compilatore a non sapere
 * che cosa sia un array, perché nessuno gli aveva dato `lib.d.ts`.
 *
 * ⇒ Un cancello che accusa codice sano è **peggio di nessun cancello**: viene
 * spento al terzo falso allarme, e con lui se ne va anche la garanzia vera.
 *
 * Il costo, misurato: **25 KB compressi** per ES2022 e le sue basi (11 file),
 * contro 470 KB per tutte e 99 le librerie. Chi carica il compilatore carica
 * anche queste — è la stessa richiesta pigra.
 *
 * ⛔ Facoltativa nel tipo, e non è indulgenza: senza libreria il cancello
 * risponde comunque, ma sul solo sottoinsieme che non tocca i tipi predefiniti.
 * Chi la omette deve sapere che sta restringendo la garanzia, non spegnendola.
 */
export interface TalosLibreriaStandard {
    /** Il nome che il compilatore chiederà, es. `lib.es2022.full.d.ts`. */
    predefinita: string
    /** I file per nome: `lib.es5.d.ts` → il suo contenuto. */
    file: ReadonlyMap<string, string>
}

/**
 * Un host che vive INTERAMENTE in memoria: nessun `node:fs`.
 *
 * È ciò che permette a questo livello di girare su un telefono. Verificato: il
 * compilatore fa analisi semantica completa con un host virtuale, emette
 * `TS2304` su un riferimento inventato e **segue gli alias fra file**.
 */
export function hostInMemoria(
    ts: typeof TS,
    file: ReadonlyMap<string, string>,
    libreria?: TalosLibreriaStandard,
): TS.CompilerHost {
    const trova = (f: string) => file.get(f) ?? libreria?.file.get(f)
    return {
        fileExists: (f) => trova(f) !== undefined,
        readFile: (f) => trova(f),
        getSourceFile: (f, target) => {
            const testo = trova(f)
            return testo === undefined
                ? undefined
                : ts.createSourceFile(f, testo, target, true, genereDi(ts, f))
        },
        getDefaultLibFileName: () => libreria?.predefinita ?? '/lib.d.ts',
        /*
         * ⛔ Il compilatore chiede le librerie per nome NUDO: senza una
         * posizione vuota, i riferimenti `/// <reference lib="..." />` dentro i
         * file di libreria non si risolvono, e si torna al falso positivo.
         */
        getDefaultLibLocation: () => '',
        writeFile: () => {},
        getCurrentDirectory: () => '/',
        getCanonicalFileName: (f) => f,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
    }
}

/**
 * ⛔⛔⛔ LE SOPPRESSIONI — zittire un errore non è risolverlo.
 *
 * Il guard confronta le diagnostiche prima e dopo. Ma una diagnostica può
 * sparire in due modi opposti:
 *
 *   correggendo il riferimento     ← quello che vogliamo
 *   mettendoci sopra `@ts-ignore`  ← quello che NON deve passare
 *
 * Nel secondo caso il conteggio non aumenta — anzi resta uguale — e un guard che
 * guarda solo quello dice di sì. **Riprodotto con un test rosso** prima di
 * scrivere questa funzione.
 *
 * ⇒ Una soppressione INTRODOTTA è essa stessa una mutazione semantica, e va
 * contata come tale. Quelle che c'erano già non bloccano niente: sono debito
 * preesistente, come gli errori preesistenti.
 */
const SOPPRESSIONI = /@ts-(ignore|expect-error|nocheck)\b/g

export function contaSoppressioni(sorgenti: readonly TalosSorgente[]): Map<string, number> {
    const per = new Map<string, number>()
    for (const { percorso, testo } of sorgenti) {
        if (testo === null) continue
        const quante = testo.match(SOPPRESSIONI)?.length ?? 0
        if (quante > 0) per.set(percorso, quante)
    }
    return per
}

/** Le soppressioni AGGIUNTE passando da un albero all'altro. */
export function soppressioniIntrodotte(
    prima: readonly TalosSorgente[],
    dopo: readonly TalosSorgente[],
): Array<{ percorso: string, quante: number }> {
    const eranO = contaSoppressioni(prima)
    const fuori: Array<{ percorso: string, quante: number }> = []
    for (const [percorso, adesso] of contaSoppressioni(dopo)) {
        const differenza = adesso - (eranO.get(percorso) ?? 0)
        if (differenza > 0) fuori.push({ percorso, quante: differenza })
    }
    return fuori
}

/** Le diagnostiche di riferimento non risolto di un albero di sorgenti. */
export async function riferimentiNonRisolti(
    sorgenti: readonly TalosSorgente[],
    libreria?: TalosLibreriaStandard,
): Promise<TalosImprontaDiagnostica[]> {
    const ts = await caricaCompilatore()
    const file = new Map<string, string>()
    for (const { percorso, testo } of sorgenti) {
        if (testo === null) continue
        if (!ESTENSIONI_SORGENTE.includes(estensioneDi(percorso))) continue
        file.set(percorso, testo)
    }
    if (file.size === 0) return []

    const program = ts.createProgram(
        [...file.keys()],
        { noEmit: true, skipLibCheck: true, allowJs: true, checkJs: false },
        hostInMemoria(ts, file, libreria),
    )

    const fuori: TalosImprontaDiagnostica[] = []
    for (const nome of file.keys()) {
        const sorgente = program.getSourceFile(nome)
        if (!sorgente) continue
        for (const d of program.getSemanticDiagnostics(sorgente)) {
            if (CODICI_RIFERIMENTO_MANCANTE.has(d.code)) fuori.push(improntaDi(ts, d))
        }
    }
    return fuori
}

/**
 * ⭐⭐⭐ IL CANCELLO SEMANTICO: la modifica introduce riferimenti che non esistono?
 *
 * ⛔ **Differenziale**, non assoluto. Pretendere che il progetto compili pulito
 * prima e dopo escluderebbe quasi ogni codebase vera: hanno errori preesistenti,
 * file generati mancanti, target di piattaforma non disponibili. Si guarda
 * **cosa la modifica AGGIUNGE**.
 *
 * ⇒ Torna un `TalosPremessaEsito`, cioè la stessa forma dei contatti e delle
 * app: è ciò che rende questo un kernel solo e non tre.
 */
export async function cancelloSemantico(
    prima: readonly TalosSorgente[],
    dopo: readonly TalosSorgente[],
    libreria?: TalosLibreriaStandard,
): Promise<TalosPremessaEsito> {
    const fatto = { famiglia: 'introduced-references', nome: 'modifica candidata' }
    let baseline: TalosImprontaDiagnostica[]
    let candidato: TalosImprontaDiagnostica[]
    try {
        baseline = await riferimentiNonRisolti(prima, libreria)
        candidato = await riferimentiNonRisolti(dopo, libreria)
    }
    catch (errore) {
        /*
         * ⛔ Un compilatore che esplode è `ignoto`, non `assente` e non un via
         * libera: non sapere se la modifica introduca riferimenti rotti non
         * significa che non ne introduca.
         */
        return {
            stato: 'ignoto',
            perche: `the semantic guard could not run (${errore instanceof Error ? errore.message.slice(0, 80) : 'errore'})`,
            fatto,
        }
    }

    /*
     * ⛔⛔ LE SOPPRESSIONI PRIMA DELLE DIAGNOSTICHE, e l'ordine conta: una
     * soppressione introdotta rende il confronto delle diagnostiche cieco
     * proprio dove serviva vedere. Contarle dopo significherebbe farsi dire
     * «nessun errore nuovo» da un albero in cui l'errore è stato nascosto.
     */
    const zittite = soppressioniIntrodotte(prima, dopo)
    if (zittite.length > 0) {
        return {
            stato: 'assente',
            perche: `the change adds ${zittite.reduce((s, z) => s + z.quante, 0)} new compiler-error suppression(s) (@ts-ignore / @ts-expect-error) in ${zittite.map((z) => z.percorso).join(', ')}. Silencing an error is not fixing it.`,
            copertura: 'completa',
            fatto,
        }
    }

    const nuove = introdotte(baseline, candidato)
    if (nuove.length === 0) return { stato: 'presente', fatto }

    return {
        stato: 'assente',
        perche: `the change introduces ${nuove.length} unresolved reference(s): ${
            nuove.slice(0, 3).map((d) => d.messaggio).join('; ')
        }`,
        /*
         * ⛔ `completa` perché il confronto è fatto sullo STESSO insieme di file
         * con lo STESSO compilatore: ciò che è nuovo è nuovo per costruzione.
         * Non dice che il progetto sia corretto — dice che la modifica non ha
         * aggiunto riferimenti rotti fra quelli che sappiamo vedere.
         */
        copertura: 'completa',
        fatto,
    }
}
