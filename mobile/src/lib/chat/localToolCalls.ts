/**
 * Le chiamate di un modello locale, portate alla forma che tutti gli altri
 * usano.
 *
 * Owner 2026-08-03: «i locali devono avere le stesse possibilità dei key». La
 * conseguenza pratica è che l'esecutore a valle non deve avere un ramo per la
 * provenienza — e per non averlo, la normalizzazione va fatta una volta, qui.
 */

import {
    talosArgomentiDiUnModelloPiccolo,
    talosSenzaRaffica,
} from '@/lib/chat/argomentiDiUnModelloPiccolo'

export interface TalosLocalToolCall {
    readonly name: string
    readonly arguments: string
    readonly id: string
}

/**
 * Un identificativo per chi non lo emette.
 *
 * Misurato sul tablet il 2026-08-03 con qwen2.5-3b: la chiamata torna corretta
 * — nome giusto, argomenti giusti — e con `id` **vuoto**, perché il formato
 * Hermes che Qwen usa non ne prevede uno. Non è un difetto del modello: è un
 * campo che esiste nel protocollo OpenAI e non in quello.
 *
 * Conta perché il risultato di un tool viene riappaiato alla richiesta
 * ATTRAVERSO quell'identificativo. Due chiamate nello stesso turno con id
 * vuoto sono due risultati che non si sa a chi appartengono, e il modello
 * riceverebbe la risposta sbagliata alla domanda sbagliata — un guasto che non
 * somiglia affatto a un guasto.
 *
 * L'indice basta e non serve altro: l'accoppiamento vive dentro un solo turno,
 * quindi non c'è niente da rendere unico oltre quel turno. Un numero casuale
 * qui renderebbe soltanto irriproducibile un test.
 */
export function talosNormaliseLocalToolCalls(
    calls: ReadonlyArray<{ name: string, arguments: string, id?: string }> | undefined,
): readonly TalosLocalToolCall[] {
    if (!calls?.length) return []
    return calls.map((call, index) => ({
        name: call.name,
        arguments: call.arguments,
        id: call.id && call.id.length > 0 ? call.id : `local_${index}`,
    }))
}

/** Cosa si è recuperato, e con quale testo resta la risposta. */
export interface TalosChiamateNude {
    readonly calls: ReadonlyArray<{ name: string, arguments: string }>
    /** La prosa senza i blocchi promossi a chiamata. */
    readonly text: string
}

/**
 * A few small GGUF templates emit the compact tool-details protocol as a
 * naked line instead of JSON. Keep the grammar deliberately closed: names are
 * identifiers separated by commas, never arbitrary prose.
 */
const PLAIN_TOOL_DETAILS = /^[ \t]*tool_details[ \t]*:[ \t]*([A-Za-z0-9_]+(?:[ \t]*,[ \t]*[A-Za-z0-9_]+)*)[ \t]*$/i

function nomiDaRigaToolDetails(riga: string): string[] | null {
    const trovato = PLAIN_TOOL_DETAILS.exec(riga)
    if (!trovato) return null
    return trovato[1]!.split(',').map((nome) => nome.trim())
}

/** Used by the streaming separator and the final renderer to hide this syntax. */
export function talosIsPlainToolDetailsLine(testo: string): boolean {
    return PLAIN_TOOL_DETAILS.test(testo)
}

/**
 * ⭐⭐ LA CHIAMATA SCRITTA A PAROLE — quella che nessuno raccoglieva.
 *
 * ## Il difetto, riprodotto TRE volte sul Pad il 2026-08-09
 *
 * Motore locale Qwen3-1.7B, chat nuova, «accendi la torcia». TALOS risponde in
 * chat, testuale:
 *
 * ```
 * {"name": "device_torch", "arguments": {"on": true}}
 * ```
 *
 * Nessuna scheda di consenso, nessuna esecuzione, torcia spenta. Con Claude
 * Sonnet 5 la stessa identica frase fa comparire la scheda in **8 secondi**.
 *
 * ## Perché il recupero che c'era già non bastava
 *
 * Nel motore nativo esiste una seconda lettura, e cerca l'**innesco** dichiarato
 * dal template — per Qwen è `<tool_call>`. Qui il modello il tag non l'ha
 * scritto affatto: ha emesso l'oggetto nudo. Senza innesco quel recupero non
 * parte, e nemmeno il registro rumoroso che gli sta accanto — quindi il difetto
 * non lasciava nessuna traccia se non una risposta assurda in chat.
 *
 * La causa a monte è la grammatica **pigra**: finché l'innesco non compare,
 * niente vincola l'uscita, e un modello da 1,7 miliardi di parametri il tag lo
 * salta. Vincolare sempre costerebbe a ogni turno anche quando nessuno chiama
 * un tool; leggere meglio costa una scansione di una risposta già finita.
 *
 * ## ⛔ Perché promuovere del testo ad AZIONE non apre una porta
 *
 * Perché questo testo è l'uscita del MODELLO, che è esattamente il posto da cui
 * le chiamate arrivano per definizione — non è un messaggio della persona né
 * contenuto letto dal web. E perché la promozione non salta niente: la chiamata
 * recuperata entra nello stesso cancello delle altre, quindi passa dai permessi,
 * dalla scheda di consenso e dal piano. Una chiamata recuperata non ESEGUE:
 * diventa una domanda.
 *
 * Il filtro che conta è il **nome**: si accettano solo gli strumenti offerti in
 * QUESTA richiesta. Un oggetto JSON che nomina qualcosa che non abbiamo messo
 * sul tavolo resta prosa, e resta visibile.
 */
export function talosRecuperaChiamateNude(
    testo: string,
    offerti: ReadonlySet<string>,
): TalosChiamateNude {
    if (!testo || offerti.size === 0) return { calls: [], text: testo }

    const calls: Array<{ name: string, arguments: string }> = []
    const testoSenzaRighe = testo.split('\n').map((riga) => {
        const nomi = nomiDaRigaToolDetails(riga)
        if (!nomi || !offerti.has('tool_details') || nomi.some((nome) => !offerti.has(nome))) {
            return riga
        }
        calls.push({
            name: 'tool_details',
            arguments: JSON.stringify({ names: nomi }),
        })
        return ''
    }).join('\n')
    let resto = ''
    let indice = 0

    while (indice < testoSenzaRighe.length) {
        const apre = testoSenzaRighe.indexOf('{', indice)
        if (apre === -1) { resto += testoSenzaRighe.slice(indice); break }
        const chiude = fineOggetto(testoSenzaRighe, apre)
        if (chiude === -1) { resto += testoSenzaRighe.slice(indice); break }

        const candidato = testoSenzaRighe.slice(apre, chiude + 1)
        const chiamata = comeChiamata(candidato, offerti)
        if (chiamata) {
            resto += testoSenzaRighe.slice(indice, apre)
            calls.push(chiamata)
        }
        else {
            resto += testoSenzaRighe.slice(indice, chiude + 1)
        }
        indice = chiude + 1
    }

    if (!calls.length) return { calls: [], text: testo }
    /*
     * ⛔ LA RAFFICA SI RIDUCE QUI, prima che diventi lavoro.
     *
     * Owner 2026-08-11, `Llama-3.2-3B` su un semplice «Ciao»: quattro
     * `tool_details` di fila, 14 secondi. Un modello che chiede quattro volte
     * lo stesso strumento non sta facendo quattro cose: sta ricominciando.
     */
    return { calls: talosSenzaRaffica(calls), text: resto.trim() }
}

/**
 * L'indice della graffa che chiude quella aperta in `da`, o -1.
 *
 * ⛔ Le stringhe si attraversano senza contare le graffe che stanno dentro: un
 * argomento di testo con una `}` — il titolo di una nota, il corpo di un
 * messaggio — troncherebbe l'oggetto a metà e farebbe fallire l'analisi proprio
 * sulle chiamate più interessanti.
 */
function fineOggetto(testo: string, da: number): number {
    let profondita = 0
    let dentroStringa = false
    let scappato = false
    for (let i = da; i < testo.length; i += 1) {
        const c = testo[i]
        if (dentroStringa) {
            if (scappato) scappato = false
            else if (c === '\\') scappato = true
            else if (c === '"') dentroStringa = false
            continue
        }
        if (c === '"') dentroStringa = true
        else if (c === '{') profondita += 1
        else if (c === '}') {
            profondita -= 1
            if (profondita === 0) return i
        }
    }
    return -1
}

/**
 * Il candidato è una chiamata? Solo se ha la forma esatta e un nome che
 * abbiamo offerto.
 *
 * `parameters` accanto ad `arguments` non è indulgenza: è la parola che usano
 * diversi template locali per la stessa cosa, e il cancello che protegge resta
 * il nome, non la chiave.
 */
function comeChiamata(
    grezzo: string,
    offerti: ReadonlySet<string>,
): { name: string, arguments: string } | null {
    let oggetto: unknown
    try { oggetto = JSON.parse(grezzo) }
    catch { return null }
    if (!oggetto || typeof oggetto !== 'object' || Array.isArray(oggetto)) return null

    const campi = oggetto as Record<string, unknown>
    const chiavi = Object.keys(campi)
    // Tre chiavi al massimo: `name`, gli argomenti, ed eventualmente un `id`.
    // Un oggetto più ricco è dati, non una chiamata.
    if (chiavi.length > 3) return null

    const nome = campi.name
    if (typeof nome !== 'string' || !offerti.has(nome)) return null

    const argomenti = 'arguments' in campi ? campi.arguments : campi.parameters
    if (argomenti === undefined || argomenti === null) {
        return { name: nome, arguments: '{}' }
    }
    if (typeof argomenti === 'string') {
        /*
         * ⛔ Non basta «è analizzabile»: un modello piccolo scrive spesso
         * quasi-JSON — apici singoli, `True`, e un elenco chiuso dentro una
         * stringa. Il caso misurato sul Pad l'11 agosto con Llama-3.2-3B:
         * `"names": "['library_list', 'time_now']"`. Il lettore che raddrizza
         * quelle tre storpiature, e solo quelle, sta in
         * `argomentiDiUnModelloPiccolo.ts`.
         */
        const raddrizzati = talosArgomentiDiUnModelloPiccolo(argomenti)
        return raddrizzati === null ? null : { name: nome, arguments: raddrizzati }
    }
    if (typeof argomenti !== 'object' || Array.isArray(argomenti)) return null
    // Anche l'oggetto passa dal raddrizzatore: le stringhe-elenco stanno lì
    // dentro tanto quanto in una stringa di argomenti.
    return {
        name: nome,
        arguments: talosArgomentiDiUnModelloPiccolo(JSON.stringify(argomenti))
            ?? JSON.stringify(argomenti),
    }
}

/**
 * ⭐⭐ IL PROTOCOLLO NON ARRIVA MAI ALLO SCHERMO.
 *
 * RIPRODOTTO sul Pad l'11 agosto con `unsloth/Qwen3-1.7B-GGUF` Q4_K_M, chat
 * nuova, domanda di aritmetica in italiano — nessuno strumento serviva. Al
 * posto della risposta, in chat:
 *
 *     <tools> </tools> <tools> </tools>
 *     <tools> <tool_details> <tool_name>library_list</tool_name>
 *     <tool_description>List, browse, count or filter every local Library
 *     file…</tool_description> <tool_input>{}</tool_input> </tool_details>
 *     … </tool_results>
 *
 * ⛔ Quel testo NON è nostro: non esiste in tutto il sorgente. Ma le
 * descrizioni dentro sì — sono le nostre, alla lettera. Il modello sta
 * **ricopiando il catalogo** invece di usarlo: la stessa cosa che faceva il
 * 360M col protocollo di identità, e la ragione per cui il prompt locale ha un
 * tetto di 600 caratteri. Solo che qui il testo ripetuto sono i tool, che sono
 * decine di volte più lunghi.
 *
 * ## ⛔ Perché la rete sta a VALLE e non solo a monte
 *
 * La causa a monte è del modello e cambia con ogni modello: un 1,7B ricopia,
 * un 4B forse no, il prossimo farà un'altra cosa ancora. Una rete a valle
 * invece vale per tutti e non si può dimenticare. È la stessa scelta già fatta
 * per il nome interno dello strumento nella voce: la causa si cura dove si
 * può, il sintomo si ferma sempre.
 *
 * ## ⛔ E si tolgono solo i NOSTRI tag, non «tutto ciò che sembra XML»
 *
 * Una risposta può contenere HTML per ragioni legittime — qualcuno che chiede
 * come si scrive un tag, un pezzo di codice. Si toglie l'elenco chiuso qui
 * sotto, che è il vocabolario del protocollo dei tool e nient'altro.
 */
const TAG_DEL_PROTOCOLLO = [
    'tools', 'tool_details', 'tool_name', 'tool_description',
    'tool_input', 'tool_results', 'tool_result', 'tool_call',
] as const

/**
 * Il testo senza il protocollo degli strumenti.
 *
 * ⛔ Si toglie il BLOCCO quando è chiuso, e il singolo tag quando non lo è: una
 * generazione tagliata a metà lascia un'apertura orfana, ed è esattamente il
 * caso in cui la persona vedrebbe la roba peggiore.
 */
export function talosSenzaProtocolloDeiTool(testo: string): string {
    /*
     * ⛔ Il taglio degli spazi vale ANCHE per il testo già pulito, e non è
     * pignoleria: il separatore dello stream toglie i blocchi e lascia l'a capo
     * che li precedeva, quindi la risposta arriva qui come «\nC = 2 kg.». Una
     * bolla che comincia a capo sembra rotta, e il caso l'ha trovato un test
     * («expected '\nC = 2 kg.' to be 'C = 2 kg.'») proprio perché l'uscita
     * anticipata saltava la ripulitura.
     */
    let fuori = testo
    if (fuori.includes('<')) {
        for (const tag of TAG_DEL_PROTOCOLLO) {
            fuori = fuori
                .replace(new RegExp(`<${tag}(?:\\s[^>]*)?>[^]*?</${tag}>`, 'gi'), '')
                .replace(new RegExp(`</?${tag}(?:\\s[^>]*)?>`, 'gi'), '')
        }
    }
    fuori = fuori.replace(/(^|\n)[ \t]*tool_details[ \t]*:[ \t]*[A-Za-z0-9_]+(?:[ \t]*,[ \t]*[A-Za-z0-9_]+)*[ \t]*(?=\n|$)/gi, '$1')
    // ⛔ Le righe vuote lasciate dietro sono parte del difetto: una risposta che
    // comincia con tre a capo sembra rotta anche quando non lo è più.
    return fuori.replace(/\n{3,}/g, '\n\n').trim()
}
