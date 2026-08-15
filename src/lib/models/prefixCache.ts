/**
 * L'IMPRONTA di un prefisso congelato: cosa lo rende ancora valido.
 *
 * ## Perché esiste, e perché è la parte pericolosa
 *
 * MISURATO sul Pad il 2026-08-07: per rispondere «ciao» mandiamo **8.410
 * token**, di cui ~8.250 sono i trentotto schemi dei tool. Costano **150
 * secondi** e sono identici in ogni conversazione. Congelarli su disco e
 * rileggerli toglie l'88% dell'attesa senza togliere un solo strumento al
 * modello — la parità resta totale.
 *
 * ⛔ Ma uno stato caricato sul modello sbagliato **non dà errore**. Dà risposte
 * sbagliate, e nessuno va a cercare la causa in un file di cache: si accusa il
 * modello, o il prompt, o il caso. È il modo peggiore di fallire, ed è il
 * motivo per cui questo file esiste prima di quello che lo usa.
 *
 * ## La difesa: l'impronta è il NOME
 *
 * Non si carica un file e poi si controlla se andava bene. Il nome del file
 * **è** l'impronta, quindi un'impronta diversa è un file che semplicemente non
 * esiste, e la strada sbagliata non è raggiungibile — non «è raggiungibile e
 * viene respinta». Le due cose si somigliano finché qualcuno non dimentica il
 * controllo.
 *
 * ## Cosa deve entrarci, e perché ciascuno
 *
 * La ricerca sul campo (llama.cpp, 2026) dice che il riuso della cache salta
 * **in silenzio** se il prefisso cambia anche di poco: la somiglianza torna
 * zero e si ricalcola tutto senza che nessuno lo dica. Quindi nell'impronta
 * entra tutto ciò che, cambiando, renderebbe i token diversi o la cache
 * incompatibile:
 *
 * - **il modello**: percorso, byte e data. Non l'hash del contenuto — sono 1,1
 *   GB da leggere, cioè si pagherebbe in lettura ciò che si voleva risparmiare
 *   in calcolo. Dimensione e data cambiano a ogni riscaricamento vero.
 * - **il contesto e il tipo di cache**: la KV è allocata su quelle misure. Un
 *   file salvato a `f16` non si può rileggere in un contesto `q8_0`.
 * - **la build del motore**: il formato dello stato è interno a llama.cpp e non
 *   promette compatibilità fra versioni.
 * - ⭐ **il testo esatto del prefisso**: è il campo che conta di più e il più
 *   facile da dimenticare. Basta un tool aggiunto, un tono diverso, una parola
 *   cambiata nelle istruzioni, e i token non sono più quelli.
 *
 * ## Cosa NON ci entra
 *
 * I thread e il microbatch: cambiano la velocità con cui la cache si riempie,
 * non il suo contenuto. Metterceli farebbe buttare un prefisso valido ogni
 * volta che il motore si ritara sul dispositivo — cioè spesso, e per niente.
 */

export interface TalosPrefixIdentity {
    /** Percorso del GGUF: distingue due copie dello stesso modello. */
    modelPath: string
    /** Byte del file. Cambia a ogni riscaricamento vero. */
    modelBytes: number
    /** Data di modifica, in millisecondi. */
    modelModifiedAt: number
    /** I token di contesto con cui la cache è stata allocata. */
    contextTokens: number
    /** `f16` o `q8_0` — quello OTTENUTO, mai quello chiesto. */
    kvCacheType: string
    /** La build del motore: il formato dello stato è interno a llama.cpp. */
    engineBuild: string
    /** ⭐ Il testo esatto che ha prodotto quei token. */
    prefixText: string
}

/**
 * Un'impronta stabile, in esadecimale.
 *
 * FNV-1a a 64 bit in due metà, non SHA-256: qui non serve resistenza agli
 * attacchi — il file lo scriviamo e lo leggiamo noi — serve che due prefissi
 * diversi diano nomi diversi, e che il conto sia immediato su una stringa da
 * decine di migliaia di caratteri. `crypto.subtle` è asincrono e costringerebbe
 * ad attendere là dove oggi non si attende.
 *
 * ⛔ I campi sono separati da un byte che nel testo non può comparire. Senza,
 * due impronte diverse potrebbero comporre la stessa stringa — un modello che
 * finisce per «a» con contesto «1» e uno che finisce per «a1» con contesto
 * vuoto — e sarebbe una collisione costruita da noi, non dal caso.
 */
export function talosPrefixFingerprint(identity: TalosPrefixIdentity): string {
    const campi = [
        identity.modelPath,
        String(identity.modelBytes),
        String(identity.modelModifiedAt),
        String(identity.contextTokens),
        identity.kvCacheType,
        identity.engineBuild,
        identity.prefixText,
    ].join('\0')

    // Due accumulatori con semi diversi: 64 bit di nome invece di 32, allo
    // stesso costo di una passata sola.
    let a = 0x811c9dc5
    let b = 0x01000193
    for (let i = 0; i < campi.length; i += 1) {
        const c = campi.charCodeAt(i)
        a = Math.imul(a ^ c, 0x01000193) >>> 0
        b = Math.imul(b ^ (c + i), 0x85ebca6b) >>> 0
    }
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

/** Il nome del file, che È l'impronta. Un'impronta diversa è un file assente. */
export function talosPrefixCacheFileName(identity: TalosPrefixIdentity): string {
    return `${talosPrefixFingerprint(identity)}.prefix`
}

/**
 * Quanto occuperebbe su disco, in byte.
 *
 * MISURATO sul Pad: 15 token → 1.721.260 byte, cioè **114.750 byte per token**
 * — che è esattamente `strati × testeKV × dimTesta × 2 × 2` per Qwen3-1.7B, più
 * l'intestazione. Serve saperlo PRIMA di scrivere: a 8.410 token sono quasi un
 * gigabyte, e riempire il disco di qualcuno per fargli risparmiare due minuti
 * è un baratto che non si fa senza dirlo.
 */
export function talosPrefixCacheBytes(kvBytesPerToken: number, tokens: number): number {
    return kvBytesPerToken * tokens
}

/**
 * Se vale la pena congelare questo prefisso.
 *
 * Tre no, e sono tutti misurati o aritmetici:
 *
 * 1. **Prefisso corto**: sotto qualche centinaio di token il calcolo costa meno
 *    della scrittura. Congelare tutto sarebbe scrivere centinaia di megabyte
 *    per risparmiare decimi di secondo.
 * 2. **Spazio insufficiente**: si tiene un margine, perché un disco pieno non
 *    rompe solo noi — rompe il telefono di chi ci ha creduto.
 * 3. **Più grande del suo guadagno**: se il file supera un tetto assoluto, il
 *    tempo di rileggerlo si avvicina a quello di ricalcolarlo, e in cambio si
 *    occupa spazio per sempre.
 */
export interface TalosPrefixFreezeVerdict {
    freeze: boolean
    /** Perché no, per il doctor e per il registro. Vuoto quando sì. */
    reason: '' | 'too-short' | 'no-space' | 'too-large'
    bytes: number
}

/** Sotto questa soglia il calcolo costa meno della scrittura. */
export const TALOS_PREFIX_MIN_TOKENS = 512
/** Oltre questo, rileggere si avvicina a ricalcolare. */
export const TALOS_PREFIX_MAX_BYTES = 2_000_000_000
/** Il margine da lasciare libero sul dispositivo, sempre. */
export const TALOS_PREFIX_FREE_SPACE_MARGIN = 2_000_000_000

/**
 * ⛔ LO SFRATTO, che è la metà mancante del congelamento.
 *
 * Un prefisso congelato pesa quasi un gigabyte, e ne nasce uno per ogni
 * combinazione di modello, contesto, tipo di cache e interruttore del
 * ragionamento. Senza sfratto, usare TALOS riempie il telefono **in silenzio**:
 * il difetto peggiore di tutti, quello che non dà nessun segnale finché non è
 * tardi, e che chi lo subisce attribuisce a qualcos'altro.
 *
 * ## Perché per ULTIMO USO e non per età
 *
 * Il più antico è spesso quello che si usa ogni giorno — il modello preferito,
 * con le impostazioni di sempre — mentre quello nato ieri da una prova non lo
 * riaprirà nessuno. Sfrattare per età toglierebbe esattamente il file che serve
 * e terrebbe quello che non serve. Per questo `loadState` aggiorna la data a
 * ogni rilettura riuscita: la domanda giusta è «il meno utile», non «il più
 * vecchio».
 *
 * ## Due tetti, perché due cose diverse possono andare storte
 *
 * Il **numero** protegge dal caso normale: un utente con due modelli e
 * l'interruttore del ragionamento arriva a quattro file, e va bene. Lo **spazio**
 * protegge dal caso che il numero non vede: un modello grande i cui prefissi
 * pesano tre gigabyte l'uno, dove perfino due file sono troppi.
 */
export interface TalosPrefixCacheEntry {
    path: string
    bytes: number
    /** Ultimo USO, non creazione: `loadState` la aggiorna a ogni rilettura. */
    modifiedAt: number
}

/** Quanti prefissi si tengono: due modelli × ragionamento acceso e spento. */
export const TALOS_PREFIX_KEEP = 4
/** E comunque non più di questo, per un modello i cui prefissi sono enormi. */
export const TALOS_PREFIX_TOTAL_BYTES = 4_000_000_000

export function talosPrefixesToEvict(
    entries: readonly TalosPrefixCacheEntry[],
    keep = TALOS_PREFIX_KEEP,
    totalBytes = TALOS_PREFIX_TOTAL_BYTES,
): string[] {
    // Dal più recentemente usato al meno. `path` come spareggio: due file con
    // la stessa data devono dare sempre lo stesso ordine, o due esecuzioni
    // identiche sfratterebbero file diversi.
    const ordinati = [...entries].sort((a, b) => (
        b.modifiedAt - a.modifiedAt || a.path.localeCompare(b.path)
    ))
    const sfratta: string[] = []
    let occupato = 0
    for (let indice = 0; indice < ordinati.length; indice += 1) {
        const voce = ordinati[indice]!
        // ⛔ Il tetto di spazio si applica anche al PRIMO: se un solo prefisso
        // supera da solo il totale ammesso, tenerlo sarebbe tenere il difetto.
        const troppiFile = indice >= keep
        const troppoSpazio = occupato + voce.bytes > totalBytes
        if (troppiFile || troppoSpazio) {
            sfratta.push(voce.path)
            continue
        }
        occupato += voce.bytes
    }
    return sfratta
}

export function talosShouldFreezePrefix(input: {
    tokens: number
    kvBytesPerToken: number
    freeBytes: number
}): TalosPrefixFreezeVerdict {
    const bytes = talosPrefixCacheBytes(input.kvBytesPerToken, input.tokens)
    if (input.tokens < TALOS_PREFIX_MIN_TOKENS) {
        return { freeze: false, reason: 'too-short', bytes }
    }
    if (bytes > TALOS_PREFIX_MAX_BYTES) {
        return { freeze: false, reason: 'too-large', bytes }
    }
    if (bytes + TALOS_PREFIX_FREE_SPACE_MARGIN > input.freeBytes) {
        return { freeze: false, reason: 'no-space', bytes }
    }
    return { freeze: true, reason: '', bytes }
}
