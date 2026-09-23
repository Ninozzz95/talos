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
 * - **il tipo di cache**: un file salvato a `f16` non si può rileggere in un
 *   contesto `q8_0`.
 *
 *   ⛔ NON il numero di token di contesto — e fino all'11/09/2026 c'era, ed
 *   era il motivo per cui un invio ripagava tutto il prefill (§35 del ledger:
 *   «5 riusati su 2.941», perché la politica del contesto era salita da 4096 a
 *   7168 e il nome del file era cambiato). Letto alla fonte, sottomodulo
 *   pinnato `src/llama-context.cpp` `state_seq_load_file`: si controllano
 *   magic, versione e che i token ci **stiano** (`n_token_count >
 *   n_token_capacity` → 0); la capienza non deve combaciare, deve bastare.
 *   Upstream lo conferma (discussione ggml-org/llama.cpp #15569, letta
 *   l'11/09/2026): i parametri che devono combaciare sono n_embd, n_layer,
 *   n_head_kv, type_k/type_v, rope_freq_base, n_vocab — `n_ctx` non c'è. Un
 *   prefisso troppo lungo per il contesto nuovo viene rifiutato dal motore
 *   stesso, e si torna al prefill intero: nessun rischio silenzioso.
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
    /** Perché no. Vuoto quando sì. Chi lo LEGGE è `talosPrefixOutcomeOf`. */
    reason: '' | 'too-short' | 'no-space' | 'too-large'
    bytes: number
}

/**
 * ⭐⭐⭐ L'ESITO che arriva fino a chi guarda lo schermo.
 *
 * ## Perché è nato, e qual era il difetto
 *
 * Il `reason` qui sopra portava il commento «per il doctor e per il registro»
 * dal giorno in cui è stato scritto, e un `grep verdetto.reason` su tutto
 * `src/` (2026-09-10) trovava **zero lettori**: veniva calcolato e buttato
 * nello stesso respiro. Nello stesso giorno, sul Pad, `LFM2.5-2.6B-Q4_0`
 * metteva **31 s** alla prima parola riusando **0 token su 2.847**, contro i
 * **3,1 s** e **2.933 su 3.257** di gemma3 — e non c'era **nessun posto** dove
 * accorgersi che l'inizio della richiesta, per LFM2, non veniva mai preparato.
 * Un motivo calcolato e mai letto è la stessa forma di
 * `funzione-con-i-test-e-nessun-chiamante`, stavolta sui dati.
 *
 * ## ⛔ RICERCA PRIMA (regola zero), fonti lette il 2026-09-10
 *
 *   - particula.tech, «Full Prompt Re-Processing: llama.cpp Cache Fixes That
 *     Work» (https://particula.tech/blog/prompt-reprocessing-swa-hybrid-models-kv-cache):
 *     quando llama-server non può riusare la cache emette
 *     *«forcing full prompt re-processing due to lack of cache data (likely due
 *     to SWA or hybrid/recurrent memory)»* — ma a livello **TRACE**, mentre la
 *     verbosità predefinita è `info`: **su un avvio normale quella riga non è
 *     mai stampata**. È l'articolo stesso a dire che è per questo che la gente
 *     conclude di non essere toccata dal problema.
 *   - ggml-org/llama.cpp, issue #21831 (https://github.com/ggml-org/llama.cpp/issues/21831):
 *     sulle memorie ibride/ricorrenti (e con SWA) il rifiuto è strutturale e il
 *     prompt si rimacina intero **a ogni turno, per sempre**, senza errori e
 *     senza corrompere l'uscita.
 *   - lmstudio-ai/lmstudio-bug-tracker, issue #2086
 *     (https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/2086): LM
 *     Studio non ha **nessuna** interfaccia su questa cache, nemmeno per il
 *     tetto di RAM. ollama/ollama, issue #2023
 *     (https://github.com/ollama/ollama/issues/2023): Ollama l'ha tenuta
 *     **spenta** senza spiegarlo a chi usa l'app.
 *   ⇒ Nessuno dei tre lo dice alla persona. Dirlo è il nostro one-up, e questo
 *     tipo è il canale.
 *
 * ## ⛔ Come si dice, senza allarmare
 *
 *   - NN/g, «Error-Message Guidelines»
 *     (https://www.nngroup.com/articles/error-message-guidelines/) e
 *     uxtigers.com, «Error Message Usability»
 *     (https://www.uxtigers.com/post/heuristic-9-error-messages): lingua
 *     comune, mai codici, il problema detto con precisione; i codici oscuri si
 *     mostrano **solo** per diagnosi, e il tono resta informativo invece che
 *     d'allarme.
 *   ⇒ Qui i codici restano **codici interni**: a schermo ci vanno le frasi di
 *     `it.ts`/`en.ts`, e la riga vive dietro «Mostra dettagli tecnici» —
 *     esattamente il «solo per diagnosi» della linea guida. Nessuna delle
 *     undici frasi chiede alla persona di fare qualcosa: **non c'è niente da
 *     fare**, e prometterlo sarebbe peggio del silenzio.
 *
 * ## ⛔ Undici stati, non «riuscito / non riuscito»
 *
 * Una coppia sì/no rifarebbe il difetto: *un guasto sarebbe indistinguibile da
 * una scelta*. `too-short` è una decisione nostra e giusta; `unknown-shape` è
 * il muro di LFM2; `save-failed` è un guasto. Confonderli vorrebbe dire non
 * sapere, di nuovo, quale dei tre si sta guardando.
 */
export type TalosPrefixOutcome =
    /** ✅ C'era, ed è stato riletto in questo turno. */
    | 'reused'
    /** Il file c'è, ma in questo turno il motore non l'ha riusato. */
    | 'not-reused'
    /** Si sta scrivendo ORA: servirà dal messaggio dopo, e la frase lo dice. */
    | 'preparing'
    /** L'ultimo salvataggio non ha prodotto byte: il motore non l'ha scritto. */
    | 'engine-refused'
    /** L'ultimo salvataggio si è interrotto. Era il `catch` vuoto. */
    | 'save-failed'
    /** Il modello non dichiara la propria forma: è il caso di LFM2. */
    | 'unknown-shape'
    | 'too-short'
    | 'no-space'
    | 'too-large'
    /** Non si è potuto nemmeno costruire il testo o l'identità del prefisso. */
    | 'unavailable'
    /** Il controllo stesso è fallito. Mai silenzio, nemmeno qui. */
    | 'check-failed'

/**
 * Dal verdetto all'esito, e senza una via muta.
 *
 * ⛔ Il `case ''` NON si fida del vuoto: guarda `freeze`. Un `reason` vuoto con
 * `freeze:false` non può nascere da `talosShouldFreezePrefix` — ma se un giorno
 * nascesse, dire «in preparazione» a una cosa che nessuno prepara sarebbe
 * precisamente la bugia che questo file esiste per togliere.
 *
 * ⛔ E il `default` con `never` è il cancello: aggiungere un `reason` senza
 * dargli una frase a schermo non compila.
 */
export function talosPrefixOutcomeOf(verdict: TalosPrefixFreezeVerdict): TalosPrefixOutcome {
    switch (verdict.reason) {
        case 'too-short':
        case 'no-space':
        case 'too-large':
            return verdict.reason
        case '':
            return verdict.freeze ? 'preparing' : 'check-failed'
        default: {
            const mai: never = verdict.reason
            return mai
        }
    }
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
