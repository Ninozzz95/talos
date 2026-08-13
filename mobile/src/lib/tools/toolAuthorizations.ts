import {
    decideTalosToolPermission,
    type TalosToolAction,
    type TalosToolPermissions,
} from '@/lib/tools/permissionTypes'
import {
    isTalosAgentToolId,
    type TalosAgentToolId,
} from '@/lib/tools/toolControls'

const SHA256 = /^[0-9a-f]{64}$/

export interface TalosToolAuthorizationGrantV1 {
    readonly schema_version: 1
    readonly tool: TalosAgentToolId
    readonly actions: readonly TalosToolAction[]
    readonly scope: 'device'
    readonly granted_at: string
}

export interface TalosToolAuthorizationGrantsV1 {
    readonly schema_version: 1
    readonly revision: number
    readonly grants: Readonly<Partial<Record<TalosAgentToolId, TalosToolAuthorizationGrantV1>>>
}

export type TalosToolAuthorizationDecision =
    | 'pending'
    | 'allow_once'
    /**
     * ⛔ «Per questa richiesta» — vale finche' dura il messaggio che l'ha
     * generato, e non un istante di piu'.
     *
     * ## Perche' esiste
     *
     * MISURATO sul Pad il 2026-08-07: `deepseek-v4-flash` parallelizza le
     * letture leggere ma **serializza sempre scrittura e rete**. Con un modello
     * cosi' il piano non compare mai — la soglia vuole due passi pesanti
     * insieme, e due pesanti insieme non arrivano — e la persona riceve quattro
     * schede in fila per una richiesta sola.
     *
     * Il piano dichiarato costerebbe un giro di rete a OGNI messaggio. Questa
     * costa zero e funziona qualunque sia il raggruppamento del modello.
     *
     * ## ⛔ Perche' qui dentro NON aggiunge nessun potere
     *
     * In questo contratto si comporta **identica a `allow_once`**: consente la
     * chiamata che l'ha chiesta e non scrive nessuna concessione permanente.
     * Tutto l'allargamento vive nel piano IN MEMORIA, che muore col turno.
     *
     * E' una scelta di sicurezza, non di comodita': se un giorno un difetto
     * portasse questa strada fuori strada, al peggio si comporterebbe come
     * «una volta» — mai come «sempre».
     */
    | 'allow_turn'
    | 'always_allow'
    | 'deny'

export interface TalosToolAuthorizationRequestV1 {
    readonly schema_version: 1
    readonly id: string
    readonly checkpoint_id: string
    readonly session_id: string
    readonly send_id: string
    readonly model_profile_id: string | null
    readonly call_id: string
    readonly tool: string
    /** Only actions unresolved by the baseline policy. */
    readonly actions: readonly TalosToolAction[]
    /** Validated canonical tool input; persisted only in encrypted activity. */
    readonly input: unknown
    readonly input_digest: string
    readonly allow_persistent: boolean
    readonly decision: TalosToolAuthorizationDecision
    readonly created_at: string
    readonly decided_at: string | null
}

export type TalosToolAuthorizationResolution =
    | {
        readonly status: 'allowed'
        readonly source: 'baseline' | 'persistent' | 'allow_once' | 'allow_turn' | 'always_allow'
        readonly actions: readonly TalosToolAction[]
    }
    | {
        readonly status: 'ask'
        readonly actions: readonly TalosToolAction[]
        readonly allow_persistent: boolean
    }
    | {
        readonly status: 'denied'
        readonly actions: readonly TalosToolAction[]
        readonly source: 'policy' | 'user'
    }

export const TALOS_EMPTY_TOOL_AUTHORIZATIONS: TalosToolAuthorizationGrantsV1
    = Object.freeze({
        schema_version: 1,
        revision: 0,
        grants: Object.freeze({}),
    })

function recordOf(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function validTimestamp(value: unknown): value is string {
    return typeof value === 'string'
        && value.length <= 64
        && Number.isFinite(Date.parse(value))
}

function normalizeActions(value: unknown): TalosToolAction[] | null {
    if (!Array.isArray(value) || value.length === 0) return null
    const actions: TalosToolAction[] = []
    for (const action of value) {
        if (action !== 'read' && action !== 'write' && action !== 'outbound') return null
        if (!actions.includes(action)) actions.push(action)
    }
    return actions
}

function freezeGrant(
    tool: TalosAgentToolId,
    actions: readonly TalosToolAction[],
    grantedAt: string,
): TalosToolAuthorizationGrantV1 {
    return Object.freeze({
        schema_version: 1,
        tool,
        actions: Object.freeze([...actions]),
        scope: 'device',
        granted_at: grantedAt,
    })
}

function freezeGrants(
    revision: number,
    grants: Partial<Record<TalosAgentToolId, TalosToolAuthorizationGrantV1>>,
): TalosToolAuthorizationGrantsV1 {
    return Object.freeze({
        schema_version: 1,
        revision,
        grants: Object.freeze({ ...grants }),
    })
}

/**
 * Missing state is an empty grant set. A corrupt entry is dropped rather than
 * broadening access; a corrupt envelope is discarded completely.
 */
export function parseTalosToolAuthorizationGrants(
    value: unknown,
): TalosToolAuthorizationGrantsV1 {
    const record = recordOf(value)
    if (!record || record.schema_version !== 1) return TALOS_EMPTY_TOOL_AUTHORIZATIONS
    if (!Number.isSafeInteger(record.revision) || (record.revision as number) < 0) {
        return TALOS_EMPTY_TOOL_AUTHORIZATIONS
    }
    const rawGrants = recordOf(record.grants)
    if (!rawGrants) return freezeGrants(record.revision as number, {})

    const grants: Partial<Record<TalosAgentToolId, TalosToolAuthorizationGrantV1>> = {}
    for (const [key, raw] of Object.entries(rawGrants)) {
        if (!isTalosAgentToolId(key)) continue
        const grant = recordOf(raw)
        if (
            !grant
            || grant.schema_version !== 1
            || grant.tool !== key
            || grant.scope !== 'device'
            || !validTimestamp(grant.granted_at)
        ) {
            continue
        }
        const actions = normalizeActions(grant.actions)
        if (!actions) continue
        grants[key] = freezeGrant(key, actions, grant.granted_at)
    }
    return freezeGrants(record.revision as number, grants)
}

function requireRevision(
    current: TalosToolAuthorizationGrantsV1,
    expectedRevision: number,
): void {
    if (current.revision !== expectedRevision) {
        throw new Error('TALOS_TOOL_AUTHORIZATION_REVISION_CONFLICT')
    }
}

export function applyTalosToolAuthorizationGrant(
    value: TalosToolAuthorizationGrantsV1,
    tool: TalosAgentToolId,
    actionsValue: readonly TalosToolAction[],
    expectedRevision: number,
    grantedAt: string,
): TalosToolAuthorizationGrantsV1 {
    const current = parseTalosToolAuthorizationGrants(value)
    requireRevision(current, expectedRevision)
    if (!isTalosAgentToolId(tool)) throw new Error('TALOS_TOOL_AUTHORIZATION_TOOL_INVALID')
    const actions = normalizeActions(actionsValue)
    if (!actions) throw new Error('TALOS_TOOL_AUTHORIZATION_ACTIONS_INVALID')
    if (!validTimestamp(grantedAt)) throw new Error('TALOS_TOOL_AUTHORIZATION_TIME_INVALID')
    if (current.revision >= Number.MAX_SAFE_INTEGER) {
        throw new Error('TALOS_TOOL_AUTHORIZATION_REVISION_INVALID')
    }
    return freezeGrants(current.revision + 1, {
        ...current.grants,
        [tool]: freezeGrant(tool, actions, grantedAt),
    })
}

export function revokeTalosToolAuthorizationGrant(
    value: TalosToolAuthorizationGrantsV1,
    tool: TalosAgentToolId,
    expectedRevision: number,
): TalosToolAuthorizationGrantsV1 {
    const current = parseTalosToolAuthorizationGrants(value)
    requireRevision(current, expectedRevision)
    if (!isTalosAgentToolId(tool)) throw new Error('TALOS_TOOL_AUTHORIZATION_TOOL_INVALID')
    if (!current.grants[tool]) return current
    if (current.revision >= Number.MAX_SAFE_INTEGER) {
        throw new Error('TALOS_TOOL_AUTHORIZATION_REVISION_INVALID')
    }
    const grants = { ...current.grants }
    delete grants[tool]
    return freezeGrants(current.revision + 1, grants)
}

/**
 * La richiesta decisa **copre** ciò che va chiesto adesso?
 *
 * ## ⛔ Il difetto che questa funzione sostituisce
 *
 * Prima il confronto era `sameActions`: stessa lunghezza, stessi elementi
 * **nella stessa posizione**. Due cose lo rompevano, ed entrambe sono normali.
 *
 * 1. **L'ordine.** Chi legge la scheda vede due bollini, non una sequenza.
 *    `['write','read']` e `['read','write']` sono lo stesso permesso per lui, e
 *    chi costruisce l'elenco sta in un altro file.
 * 2. ⛔ **La lunghezza.** Con «Leggi le tue cose» su *consenti sempre* — la
 *    configurazione dell'owner — un tool che scrive E legge chiede una sola
 *    azione, la scrittura. Ma la richiesta memorizzata ne porta due. Uguaglianza
 *    fallita, richiesta scartata, e l'esecutore ricade sul «chiedi»: nella chat
 *    quella porta risponde `false`, quindi un rifiuto **silenzioso**.
 *
 * RIPRODOTTO sul Pad il 2026-08-08 con Claude Sonnet 5: si tocca **Consenti**,
 * il plugin nativo non viene chiamato nemmeno una volta, lo sfondo non cambia e
 * il modello dice «ho annullato». Un «sì» che diventa «no» è peggio di un
 * rifiuto: attribuisce alla persona una decisione che non ha preso.
 *
 * ## La regola giusta, e perché è sicura in un verso solo
 *
 * Vale se la richiesta decisa contiene **almeno** ciò che si sta chiedendo.
 * Concedere di meno di quanto la scheda nominava è sicuro: la persona ha visto
 * di più e ha detto sì. Il contrario no — una scheda che parlava solo di
 * scrittura non può autorizzare anche una lettura, e infatti resta un
 * disallineamento.
 */
function coversActions(
    granted: readonly TalosToolAction[],
    asked: readonly TalosToolAction[],
): boolean {
    return asked.every((action) => granted.includes(action))
}

function exactRequest(
    request: TalosToolAuthorizationRequestV1 | undefined,
    tool: string,
    callId: string,
    inputDigest: string,
    actions: readonly TalosToolAction[],
): request is TalosToolAuthorizationRequestV1 {
    return talosPercheRichiestaScartata(request, tool, callId, inputDigest, actions) === null
}

/**
 * ⭐⭐ PERCHÉ una richiesta già decisa non è valsa — con una parola sola.
 *
 * ## Cosa è costato non averla
 *
 * MISURATO sul Pad il 2026-08-09, Claude Sonnet 5, «apri la calcolatrice». La
 * scheda compare, si tocca **Consenti**, e il modello riceve lo stesso
 * «lo strumento è ancora in attesa della tua autorizzazione» — che poi ripete
 * alla persona: *«dovresti vedere un prompt sul telefono»*. Ma il prompt era
 * appena stato risposto, e non ne comparirà nessun altro.
 *
 * Riprodotto in **dodici secondi**, deterministico. E impossibile da
 * diagnosticare dall'esterno, perché il confronto ha **quattro** condizioni —
 * strumento, identificativo della chiamata, impronta degli argomenti, azioni
 * coperte — e il codice ne restituiva una sola risposta: «no».
 *
 * ⇒ È la stessa lezione di [[ripiego-col-motivo]]: un rifiuto senza la sua
 * causa manda a cercare nel posto sbagliato. Qui mandava a cercare una scheda
 * che non esisteva.
 *
 * ## ⛔ Perché una PAROLA e non un messaggio
 *
 * Perché questo esito finisce in tre posti che non parlano la stessa lingua: il
 * registro tecnico, la riga di verifica, e il testo che il MODELLO legge.
 * Una parola breve e stabile si incolla in tutti e tre senza tradurla, e non
 * porta con sé né l'impronta né gli argomenti — che sono dati della persona e
 * non hanno niente da fare in un messaggio verso il modello.
 *
 * `null` vuol dire che la richiesta vale.
 */
export function talosPercheRichiestaScartata(
    request: TalosToolAuthorizationRequestV1 | undefined,
    tool: string,
    callId: string,
    inputDigest: string,
    actions: readonly TalosToolAction[],
): 'assente' | 'contratto' | 'strumento' | 'chiamata' | 'argomenti' | 'azioni' | null {
    if (!request) return 'assente'
    if (request.schema_version !== 1) return 'contratto'
    if (request.tool !== tool) return 'strumento'
    if (request.call_id !== callId) return 'chiamata'
    if (request.input_digest !== inputDigest || !SHA256.test(request.input_digest)) return 'argomenti'
    if (!coversActions(request.actions, actions)) return 'azioni'
    return null
}

export function resolveTalosToolAuthorization(input: {
    tool: string
    requiredActions: readonly TalosToolAction[]
    permissions: Partial<TalosToolPermissions> | undefined
    grants: TalosToolAuthorizationGrantsV1
    callId: string
    inputDigest: string
    request?: TalosToolAuthorizationRequestV1
    /** Dedicated high-impact tools ignore saved grants and ask every time. */
    forceConfirmation?: boolean
    /**
     * Il tool dichiara nel catalogo di sicurezza che il «sempre» è concesso,
     * malgrado il rischio e malgrado `forceConfirmation`.
     *
     * ⛔ Non è un modo per aggirare la regola: è il posto dove la regola
     * ammette un'eccezione **scritta**, decisa da una persona e leggibile nel
     * catalogo, invece che dedotta da un numero di rischio.
     */
    sempreConsentibile?: boolean
}): TalosToolAuthorizationResolution {
    const required = normalizeActions(input.requiredActions)
    if (!required) return { status: 'denied', actions: [], source: 'policy' }

    const denied = required.filter(
        (action) => decideTalosToolPermission(action, input.permissions) === 'deny',
    )
    if (denied.length > 0) {
        return { status: 'denied', actions: denied, source: 'policy' }
    }

    const asked = input.forceConfirmation
        ? required
        : required.filter(
            (action) => decideTalosToolPermission(action, input.permissions) === 'ask',
        )
    const request = input.request
    const requestMatches = exactRequest(
        request,
        input.tool,
        input.callId,
        input.inputDigest,
        asked,
    )
    if (requestMatches && request.decision === 'deny') {
        return { status: 'denied', actions: asked, source: 'user' }
    }
    if (
        requestMatches
        && (request.decision === 'allow_once'
            || request.decision === 'allow_turn'
            || request.decision === 'always_allow')
    ) {
        // `allow_turn` passa dalla porta di `allow_once`: nessuna concessione
        // permanente, nessun potere in piu' in questo contratto.
        if (request.decision === 'allow_once' || request.decision === 'allow_turn') {
            return {
                status: 'allowed',
                source: request.decision,
                actions: asked,
            }
        }
        // “Always” is a pointer to the revocable Settings grant, not a second
        // immortal grant hidden inside a checkpoint. Removing the Settings
        // grant must take effect even while a continuation is queued.
        const persistent = isTalosAgentToolId(input.tool)
            ? parseTalosToolAuthorizationGrants(input.grants).grants[input.tool]
            : undefined
        if (
            request.allow_persistent
            && persistent
            && asked.every((action) => persistent.actions.includes(action))
        ) {
            return {
                status: 'allowed',
                source: request.decision,
                actions: asked,
            }
        }
    }

    /*
     * ⛔⛔ IL QUARTO CANCELLO — e senza questo gli altri tre non servono.
     *
     * MISURATO sul Pad il 2026-08-13: dopo aver toccato «Consenti sempre», la
     * richiesta successiva **richiedeva il consenso da capo**. Il bottone c'era
     * e funzionava — la concessione veniva scritta — ma da qui non veniva MAI
     * riletta, perché `forceConfirmation` spegneva la consultazione del grant
     * prima ancora di guardarlo.
     *
     * ⇒ Un «sempre» che si può dare e non vale mai è peggio di un «sempre» che
     * non c'è: la persona crede di aver deciso, e la decisione non esiste.
     */
    const rispettaIlSempre = !input.forceConfirmation || input.sempreConsentibile === true
    if (rispettaIlSempre && asked.length > 0) {
        const grant = isTalosAgentToolId(input.tool)
            ? parseTalosToolAuthorizationGrants(input.grants).grants[input.tool]
            : undefined
        if (grant && asked.every((action) => grant.actions.includes(action))) {
            return { status: 'allowed', source: 'persistent', actions: asked }
        }
    }
    if (asked.length > 0) {
        return {
            status: 'ask',
            actions: asked,
            /*
             * ⛔⛔ IL TERZO CANCELLO — owner 2026-08-13, e non si discute:
             *
             * > «voglio che metti quel maledetto pulsante consenti sempre e ci
             * > deve essere anche per il controllo dispositivo. Non voglio
             * > nessuna eccezione. Sarà l'utente a consentirlo.»
             *
             * `sempreConsentibile` era dichiarato nel catalogo di sicurezza e
             * l'esecutore lo leggeva già. Ma il bottone spariva lo stesso,
             * perché DA QUI usciva `allow_persistent: false` — e usciva prima,
             * per una ragione che con quel tool non c'entrava: `device_screen_drive`
             * ha `confirmation: 'always'`, e `forceConfirmation` da solo
             * spegneva il «sempre» senza mai chiedersi se qualcuno l'avesse
             * autorizzato per iscritto.
             *
             * Tre cancelli in fila sulla stessa domanda, e ognuno ne conosceva
             * una parte: uno leggeva l'eccezione, uno la ignorava passando un
             * argomento solo, e questo non sapeva nemmeno che esistesse. ⇒ Una
             * regola scritta in un posto e applicata in tre non è una regola:
             * è tre regole che sembrano una.
             *
             * ⛔ `forceConfirmation` NON diventa inutile: continua a valere per
             * ogni tool che non ha l'eccezione scritta nel catalogo. Qui cade
             * solo dove qualcuno l'ha dichiarata, cioè dove la decisione è
             * stata presa e messa per iscritto invece che dedotta dal rischio.
             */
            allow_persistent: input.forceConfirmation !== true
                || input.sempreConsentibile === true,
        }
    }
    return { status: 'allowed', source: 'baseline', actions: [] }
}

function hasUnpairedSurrogate(value: string): boolean {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index)
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(index + 1)
            if (!(next >= 0xdc00 && next <= 0xdfff)) return true
            index += 1
        } else if (code >= 0xdc00 && code <= 0xdfff) {
            return true
        }
    }
    return false
}

function invalidInput(): never {
    throw new Error('TALOS_TOOL_AUTHORIZATION_INPUT_INVALID')
}

/**
 * RFC 8785 JCS subset for already schema-validated JSON tool input.
 *
 * JavaScript's `<`/default sort compares UTF-16 code units, matching JCS.
 */
export function canonicalizeTalosToolAuthorizationInput(value: unknown): string {
    const visiting = new Set<object>()

    const serialize = (node: unknown): string => {
        if (node === null || typeof node === 'boolean') return JSON.stringify(node)
        if (typeof node === 'string') {
            if (hasUnpairedSurrogate(node)) return invalidInput()
            return JSON.stringify(node)
        }
        if (typeof node === 'number') {
            if (!Number.isFinite(node)) return invalidInput()
            return JSON.stringify(node)
        }
        if (typeof node !== 'object') return invalidInput()
        if (visiting.has(node)) return invalidInput()
        visiting.add(node)
        try {
            if (Array.isArray(node)) {
                return `[${node.map((entry) => serialize(entry)).join(',')}]`
            }
            const prototype = Object.getPrototypeOf(node)
            if (prototype !== Object.prototype && prototype !== null) return invalidInput()
            const record = node as Record<string, unknown>
            const fields = Object.keys(record).sort().map((key) => {
                if (hasUnpairedSurrogate(key)) return invalidInput()
                return `${JSON.stringify(key)}:${serialize(record[key])}`
            })
            return `{${fields.join(',')}}`
        } finally {
            visiting.delete(node)
        }
    }

    return serialize(value)
}

export async function digestTalosToolAuthorizationInput(value: unknown): Promise<string> {
    const canonical = canonicalizeTalosToolAuthorizationInput(value)
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(canonical),
    )
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
        .join('')
}
