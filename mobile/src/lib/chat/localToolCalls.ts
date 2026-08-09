/**
 * Le chiamate di un modello locale, portate alla forma che tutti gli altri
 * usano.
 *
 * Owner 2026-08-03: «i locali devono avere le stesse possibilità dei key». La
 * conseguenza pratica è che l'esecutore a valle non deve avere un ramo per la
 * provenienza — e per non averlo, la normalizzazione va fatta una volta, qui.
 */

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
    let resto = ''
    let indice = 0

    while (indice < testo.length) {
        const apre = testo.indexOf('{', indice)
        if (apre === -1) { resto += testo.slice(indice); break }
        const chiude = fineOggetto(testo, apre)
        if (chiude === -1) { resto += testo.slice(indice); break }

        const candidato = testo.slice(apre, chiude + 1)
        const chiamata = comeChiamata(candidato, offerti)
        if (chiamata) {
            resto += testo.slice(indice, apre)
            calls.push(chiamata)
        }
        else {
            resto += testo.slice(indice, chiude + 1)
        }
        indice = chiude + 1
    }

    if (!calls.length) return { calls: [], text: testo }
    return { calls, text: resto.trim() }
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
        // Già una stringa JSON: si accetta solo se è davvero analizzabile,
        // altrimenti a valle arriverebbe una chiamata che nessuno può eseguire.
        try {
            const dentro: unknown = JSON.parse(argomenti)
            if (!dentro || typeof dentro !== 'object' || Array.isArray(dentro)) return null
            return { name: nome, arguments: argomenti }
        }
        catch { return null }
    }
    if (typeof argomenti !== 'object' || Array.isArray(argomenti)) return null
    return { name: nome, arguments: JSON.stringify(argomenti) }
}
