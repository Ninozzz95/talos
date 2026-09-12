import type { TalosTranslate } from '@/i18n/contracts'

/**
 * L'ULTIMO cancello fra un nome interno e gli occhi di una persona.
 *
 * ## Che cosa si è visto, e dove
 *
 * §40 del ledger del motore locale, 10/09/2026 sera, aprendo una chat
 * dell'owner sul suo Pad. A schermo, dentro la conversazione:
 *
 *     Errore di esecuzione   CHAT_EXECUTION_FAILED
 *     TALOS_LLAMA_NO_CHAT_TEMPLATE
 *     AZIONE SUCCESSIVA
 *     Controlla il modello selezionato e la connessione, poi riprova.
 *     local / /storage/emulated/0/.../talos-prova-gemma.gguf
 *
 * Due difetti distinti in cinque righe:
 *
 * 1. `TALOS_LLAMA_NO_CHAT_TEMPLATE` sta nello **slot della frase**, non in
 *    quello della diagnostica. È il nome che ci siamo dati fra noi, messo
 *    davanti a chi voleva solo una risposta.
 * 2. Il consiglio dice **«controlla la connessione»** a proposito di un modello
 *    **locale**, che gira senza rete. Un rimedio che non c'entra manda a cercare
 *    il guasto dove non c'è, e costa più del rifiuto.
 *
 * ## La regola, e da dove viene
 *
 * NN/g, *Error-Message Guidelines* (letto 12/09/2026,
 * https://www.nngroup.com/articles/error-message-guidelines/):
 *
 * - «Use human-readable language… Avoid technical jargon and use language
 *   familiar to your users instead.»
 * - «Hide or minimize obscure error codes or abbreviations; show them for
 *   technical diagnostic purposes only.»
 * - e il messaggio deve dire **che cosa è successo** *e* **offrire un rimedio**.
 *
 * ⛔ Nota di onestà sulla fonte: la stessa frase sui codici viene di solito
 * attribuita anche a Material Design 1 (*Patterns → Errors*,
 * https://m1.material.io/patterns/errors.html). La pagina servita il 12/09/2026
 * **non la contiene più** — quindi la citazione qui sopra è di NN/g, e non si
 * attribuisce a una fonte che oggi non la dice.
 *
 * ## Perché il cancello sta QUI e non nel produttore dell'errore
 *
 * Perché i produttori sono tanti e il lettore è uno. `TALOS_LLAMA_NO_CHAT_TEMPLATE`
 * sfugge perché `talosLocalEngineChatPlan` viene chiamata **senza involucro**
 * (`localAdapter.ts`, riga ~1594): il rifiuto risale nudo fino a
 * `chatExecutionFault`, che non riconoscendolo lo copia tale e quale nel campo
 * `message`. Curare quella singola chiamata avrebbe chiuso QUEL buco e lasciato
 * aperti tutti gli altri — e ogni `throw new Error('TALOS_…')` futuro ne
 * aprirebbe uno nuovo, in silenzio, esattamente come questo.
 *
 * ⇒ Il cancello è sulla porta d'uscita: qualunque cosa arrivi, se ha la FORMA di
 * un codice non esce come frase. Al peggio si legge una frase generica ma vera;
 * mai un nome di protocollo.
 *
 * Puro: nessuno store, nessun componente. La regola si prova senza montare
 * niente, e si prova anche al verso contrario — che una frase VERA passi intatta.
 */

/** Quel che il riquadro rosso ha in mano prima di essere scritto a schermo. */
export interface TalosChatFaultInput {
    /** Il livello, che decide il titolo e quindi anche la frase di ripiego. */
    readonly layer: 'validator' | 'policy' | 'provider' | 'network' | 'worker' | 'system'
    /** Il codice della busta: `PROVIDER_HTTP_401`, `CHAT_EXECUTION_FAILED`, … */
    readonly code: string
    /** Il campo che DOVREBBE contenere una frase, e a volte contiene un codice. */
    readonly message: string
    readonly nextAction: string | null
    /** Serve a non consigliare la rete a chi non la usa. */
    readonly provider: string | null
}

export interface TalosChatFaultText {
    /** La frase. Umana, sempre, in ogni ramo. */
    readonly message: string
    /** Che cosa fare adesso. `null` solo se davvero non c'è niente da dire. */
    readonly nextAction: string | null
    /**
     * Il token tecnico tolto dal corpo, da mostrare **in piccolo** accanto al
     * resto della diagnostica. Non si butta: è quello che rende riproducibile
     * un guasto, ed è esattamente l'uso che NN/g concede ai codici.
     */
    readonly diagnostic: string | null
}

/**
 * Ha la forma di un nome interno?
 *
 * Non «è nel nostro elenco»: **ha la forma**. Un elenco chiuso riconosce solo i
 * codici che qualcuno si è ricordato di aggiungere, e il codice che fa danno è
 * sempre quello che nessuno ha aggiunto.
 *
 * Il segno distintivo di un identificatore è che è UNA parola sola con dentro un
 * trattino basso: nessuna frase italiana o inglese è fatta così. Copre
 * `TALOS_LLAMA_NO_CHAT_TEMPLATE`, `PROVIDER_HTTP_401`,
 * `TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID:loop_too_large` e anche i codici
 * minuscoli che usano i provider (`invalid_api_key`, `context_length_exceeded`).
 *
 * ⛔ AL CONTRARIO, e conta più del resto: una frase vera deve passare INTATTA.
 * Per questo si pretende l'assenza di spazi — «Il modello non risponde» ha un
 * trattino basso in nessun punto e degli spazi dappertutto, e non viene toccata.
 */
export function talosSembraUnCodice(value: string): boolean {
    const testo = value.trim()
    if (testo === '' || /\s/.test(testo)) return false
    if (!testo.includes('_')) return false
    return /^[A-Za-z][A-Za-z0-9_:.-]*$/.test(testo)
}

/**
 * I codici che il percorso della chat può davvero produrre, censiti.
 *
 * Ognuno ha una frase che dice **che cosa è successo** e, dove il rimedio è
 * diverso da quello di ripiego, anche **che cosa fare**. Dove una frase esisteva
 * già si riusa quella: due modi di dire la stessa cosa sono due cose diverse per
 * chi legge, anche quando per noi sono la stessa.
 *
 * Il censimento per esteso sta nella consegna del lotto; qui c'è solo ciò che
 * cambia il comportamento.
 */
const FRASI: Readonly<Record<string, { readonly messaggio: string, readonly azione?: string }>> = {
    // ── Motore locale — il caso di §40 e i suoi fratelli ────────────────────
    TALOS_LLAMA_NO_CHAT_TEMPLATE: { messaggio: 'chat.faultNoChatTemplate', azione: 'chat.faultNoChatTemplateNext' },
    TALOS_LLAMA_PLAN_FAILED: { messaggio: 'chat.faultNoChatTemplate', azione: 'chat.faultNoChatTemplateNext' },
    TALOS_LLAMA_CONTEXT_REQUIRED: { messaggio: 'models.localPromptTooLong' },
    TALOS_LOCAL_PROMPT_TOO_LONG: { messaggio: 'models.localPromptTooLong' },
    TALOS_LLAMA_GENERATION_FAILED: { messaggio: 'models.localModelGenerationFailed' },
    TALOS_LOCAL_GENERATION_FAILED: { messaggio: 'models.localModelGenerationFailed' },
    TALOS_LLAMA_OPEN_FAILED: { messaggio: 'models.localModelOpenUnknown' },
    TALOS_LLAMA_PATH_REQUIRED: { messaggio: 'models.localModelOpenPath' },
    TALOS_LLAMA_MODEL_MISSING: { messaggio: 'models.localModelOpenPath' },
    TALOS_LOCAL_MODEL_OPEN_PATH: { messaggio: 'models.localModelOpenPath' },
    TALOS_LOCAL_MODEL_OPEN_LOAD: { messaggio: 'models.localModelOpenLoad' },
    TALOS_LOCAL_MODEL_OPEN_CANCELLED: { messaggio: 'models.localModelOpenCancelled' },
    TALOS_LOCAL_MODEL_OPEN_CONTEXT: { messaggio: 'models.localModelOpenContext' },
    TALOS_LOCAL_MODEL_OPEN_SAMPLER: { messaggio: 'models.localModelOpenSampler' },
    TALOS_LOCAL_MODEL_OPEN_UNKNOWN: { messaggio: 'models.localModelOpenUnknown' },
    TALOS_LOCAL_MODELS_UNREADABLE: { messaggio: 'models.localModelOpenPath' },

    // ── Provider a chiave ───────────────────────────────────────────────────
    TALOS_PROVIDER_HTTP_FAILED: { messaggio: 'chat.faultProviderRefused' },
    TALOS_CHAT_PROVIDER_KEY_REQUIRED: { messaggio: 'chat.faultProviderKeyMissing', azione: 'chat.updateProviderCredential' },
    TALOS_CHAT_PROVIDER_CATALOG_REQUIRED: { messaggio: 'chat.faultProviderCatalogMissing', azione: 'chat.refreshProviderCatalog' },
    TALOS_CHAT_PROVIDER_MODEL_MISMATCH: { messaggio: 'chat.faultModelMismatch', azione: 'chat.faultPickModelAgain' },
    TALOS_CHAT_MODEL_REQUIRED: { messaggio: 'chat.faultModelMissing', azione: 'chat.faultPickModelAgain' },
    TALOS_CHAT_IMAGE_INPUT_UNSUPPORTED: { messaggio: 'chat.faultImageUnsupported', azione: 'chat.faultPickModelAgain' },

    // ── Deposito locale e permessi ──────────────────────────────────────────
    TALOS_CHAT_DB_UNAVAILABLE: { messaggio: 'chat.storageHiccup', azione: 'chat.storageHiccupNext' },
    TALOS_CHAT_REPOSITORY_UNAVAILABLE: { messaggio: 'chat.storageHiccup', azione: 'chat.storageHiccupNext' },
    TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID: { messaggio: 'chat.authorizationLapsed', azione: 'chat.resendAfterAuthorizationLapsed' },
}

/** Una frase di ripiego che sia comunque VERA, scelta dal livello. */
const RIPIEGO: Readonly<Record<TalosChatFaultInput['layer'], string>> = {
    validator: 'chat.faultGenericValidator',
    policy: 'chat.faultGenericPolicy',
    provider: 'chat.faultGenericProvider',
    network: 'chat.faultGenericNetwork',
    worker: 'chat.faultGenericWorker',
    system: 'chat.faultGenericSystem',
}

/**
 * Un modello che gira su questo telefono NON ha una connessione da controllare.
 *
 * §40, secondo difetto. Il consiglio di ripiego di `chat.ts` nomina la rete
 * perché quasi tutti i modelli passano da lì; per il motore locale è falso, e un
 * consiglio falso è peggio di nessun consiglio.
 *
 * Si riconosce confrontando la frase con la traduzione che l'ha prodotta, non
 * cercando la parola «connessione» dentro il testo: una ricerca per parola
 * cambierebbe significato a ogni ritocco della frase, e in una lingua sì e in
 * una no.
 */
function azionePerIlLocale(
    azione: string | null,
    provider: string | null,
    translate: TalosTranslate,
): string | null {
    if (provider !== 'local' || azione === null) return azione
    // Seen on the Pad (12/09/2026): a local model that would not open still
    // said «check the provider's status» — there is no provider to check.
    return azione === translate('chat.checkModelConnection') || azione === translate('chat.checkProviderHealth')
        ? translate('chat.checkLocalModel')
        : azione
}

/**
 * La coppia frase + diagnostica, pronta per lo schermo.
 *
 * Tre casi, in quest'ordine:
 *
 * 1. Il corpo è già una frase → passa intatto. È il ramo più frequente e il più
 *    importante: la cura non deve riscrivere quello che funzionava.
 * 2. Il corpo è un codice che conosciamo → la sua frase, e il suo rimedio se ne
 *    ha uno più preciso di quello generico.
 * 3. Il corpo è un codice che non conosciamo → la frase generica del livello.
 *    Vaga, ma vera; e il codice resta leggibile in piccolo, che è la sola cosa
 *    di cui ha bisogno chi deve riprodurre il guasto.
 */
export function talosChatFaultText(
    fault: TalosChatFaultInput,
    translate: TalosTranslate,
): TalosChatFaultText {
    const corpo = fault.message.trim()
    const azione = azionePerIlLocale(fault.nextAction, fault.provider, translate)

    if (!talosSembraUnCodice(corpo)) {
        return { message: corpo, nextAction: azione, diagnostic: null }
    }

    // `CODICE:dettaglio` — il dettaglio resta nella diagnostica, la frase la
    // sceglie il codice. Cercare la stringa intera nell'elenco non troverebbe
    // mai niente, perché i dettagli sono infiniti.
    const radice = corpo.split(':', 1)[0]
    const conosciuto = FRASI[corpo] ?? FRASI[radice]

    if (conosciuto) {
        return {
            message: translate(conosciuto.messaggio),
            nextAction: conosciuto.azione ? translate(conosciuto.azione) : azione,
            diagnostic: corpo,
        }
    }

    return {
        message: translate(RIPIEGO[fault.layer]),
        nextAction: azione,
        diagnostic: corpo,
    }
}
