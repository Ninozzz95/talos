import { z } from 'zod'
import {
    ANTHROPIC_VERSION,
    buildAnthropicRequest,
    talosAnthropicThinkingFallback,
} from '@/lib/chat/anthropicClient'
import {
    learnTalosThinkingMode,
    talosThinkingModeFor,
} from '@/lib/chat/anthropicThinkingMemory'
import { talosAttrezziAnthropicAGradi, talosToolsForAnthropic } from '@/lib/tools/registry'
import {
    talosConvieneAprireAGradi,
    talosPesoDegliAttrezzi,
    talosVaDifferito,
} from '@/lib/tools/aperturaProgressiva'
import { talosProfiloCompilato, talosRegistraProfilo } from '@/lib/tools/improntaDelProfilo'
import { createAnthropicToolCallAccumulator, parseAnthropicToolCalls } from '@/lib/tools/wire'
import { createTalosSseAccumulator, talosStreamText } from '@/lib/chat/providers/streamShared'
import type { TalosMobileProviderAdapter } from '@/lib/chat/providerContracts'
import {
    malformedProviderResponse,
    requireHttpSuccess,
    requireProviderApiKey,
} from '@/lib/chat/providerErrors'
import { talosNumericUsage } from '@/lib/chat/providers/usage'

/**
 * ⭐⭐⭐ Quanti schemi entrano nel prefisso — la decisione, in un posto solo.
 *
 * Sotto le soglie della documentazione (10 attrezzi, o 10k token di
 * definizioni) si spedisce la forma di sempre: con pochi attrezzi la ricerca
 * costerebbe più di quel che risparmia, e la documentazione lo dice
 * esplicitamente — *«standard tool calling è la scelta migliore quando hai meno
 * di 10 tool»*.
 *
 * ⛔ La soglia si **misura sugli schemi veri**, non si assume: è la stessa
 * regola per cui il peso degli schemi ha un test dedicato.
 */
/**
 * ⛔⛔ OGGI È SPENTO, e la riga da cambiare è UNA — questa.
 *
 * ## Cosa manca, esattamente
 *
 * La ricerca lato server funziona al primo giro: torcia accesa alle 00:20:38
 * con Claude Haiku 4.5, letta in `dumpsys`. Al giro DOPO il provider ha
 * risposto `PROVIDER_CHAT_FAILED`.
 *
 * La documentazione lo dice alla voce «continuing the conversation»: la
 * risposta va rimandata indietro **immutata, compresi i blocchi
 * `server_tool_use` e `tool_search_tool_result`**. La nostra storia si
 * ricostruisce con testo e `tool_use` soltanto — quei blocchi non esistono nel
 * nostro modello di messaggio, quindi al secondo giro spediamo una
 * conversazione malformata.
 *
 * ⇒ Finché non sappiamo conservarli, Anthropic riceve gli schemi interi come
 * ha sempre fatto. **Meglio un prefisso grande che una risposta che non
 * arriva** — ed è ciò che l'owner ha visto due volte stanotte.
 *
 * ## ⭐ QUANTO COSTA TENERLO SPENTO — misurato il 2026-08-17
 *
 * Sulla suite vera, con tutti gli attrezzi accesi (20 offerti: 10 di lettura,
 * 6 di scrittura, 4 in uscita), guardando ciò che entra nel CONTESTO del
 * modello e non ciò che viaggia sul filo:
 *
 *     spento (schemi interi)   17.132 byte   ~4.630 token   a OGNI messaggio
 *     acceso (a gradi)          1.984 byte     ~536 token   16 differiti su 20
 *     ⇒ risparmio                                    88%
 *
 * ⛔ E sul FILO l'apertura a gradi pesa 409 byte in PIÙ (17.541 contro 17.132):
 * manda comunque ogni schema e ci aggiunge `defer_loading` più la riga della
 * ricerca. Chi misura i byte spediti conclude che costa di più — vero, e
 * risponde alla domanda sbagliata. Il numero sta in
 * `tests/unit/tools/quantoCostaAnthropic.test.ts`, che lo ristampa a ogni corsa.
 *
 * ## ⛔ E la forma della cura, perché non si riscopra da capo
 *
 * Serve che un turno dell'assistente sappia portarsi dietro i blocchi del
 * fornitore **verbatim**. Oggi si ricostruisce come `[testo?, ...tool_use]` in
 * `buildAnthropicRequest`, e quei due tipi non esistono nel nostro modello.
 * Sono QUATTRO strati, e vanno fatti insieme o il valore muore all'ultimo:
 *
 *     1. l'adattatore li CATTURA dalla risposta
 *     2. il turno ha dove tenerli
 *     3. la persistenza li salva e li rilegge
 *     4. `buildAnthropicRequest` li rimette in fila, nell'ordine originale
 *
 * ⛔ Il quarto senza il terzo è il difetto peggiore: una chat salvata che al
 * riaperto spedisce una conversazione monca. Vedi «una chiamata orfana
 * avvelena la chat per sempre».
 *
 * ⛔ Il codice e i test dell'apertura a gradi NON si cancellano: sono giusti e
 * misurati (63 attrezzi → 4 nel prefisso, −96%). Quando la storia saprà
 * portarsi dietro quei due blocchi, qui si rimette `talosConvieneAprireAGradi`
 * e il resto è già al suo posto.
 */
/*
 * ⭐⭐⭐ PROVATO ACCESO il 2026-08-17, e RISPENTO — con un motivo NUOVO.
 *
 * La catena dei sette ponti è fatta e regge: i blocchi `server_tool_use` e
 * `tool_search_tool_result` adesso sopravvivono a tutto — l'adattatore li
 * cattura, i due contratti li dichiarano, il giro dell'agente li ACCUMULA (
 * nascono al primo giro e all'ultimo non ci sono più), il punto di controllo
 * li porta attraverso un consenso, i metadati li salvano per domani.
 *
 * ⛔⛔ MA NON BASTAVA, e il telefono lo ha detto in modo netto.
 *
 * Provato sul Pad, stessa domanda, unica variabile questo interruttore:
 *
 *     ACCESO   «TALOS non può accedere alle informazioni hardware del tuo
 *               dispositivo. Non posso leggerti la capacità della batteria»
 *
 *     SPENTO   «Il tuo telefono ha il 90% di batteria. È collegato a una presa
 *               ma non sta caricando… Il dispositivo è un OnePlus Pad 3 con
 *               Android 16»  — e la torcia si accende davvero
 *
 * ⇒ Con l'apertura a gradi accesa il modello NON TROVA gli strumenti differiti.
 * La ricerca lato server non glieli sta consegnando, e lui conclude in buona
 * fede di non avere quelle capacità — che è la bugia peggiore che questa app
 * possa dire, perché è dichiarata con sicurezza.
 *
 * ⛔ Il difetto non era UNO. La storia monca era reale ed è curata; sotto c'era
 * un secondo problema che nessuno poteva vedere finché il primo non era
 * risolto. È il motivo per cui questa riga NON si accende su un test verde:
 * i test provavano la forma dei messaggi, e la forma era giusta.
 *
 * ## ⇒ E POI SI E' CAPITO, con nove sonde dirette all'API
 *
 * `banco/sondaDifferiti.mjs`. Il cablaggio e' TUTTO GIUSTO — e il difetto e'
 * altrove, in un posto che nessuna riga di codice nostro puo' toccare.
 *
 * ### Cosa funziona, misurato
 *
 *     token in ingresso, stesso messaggio, sola variabile la forma
 *       2 attrezzi in vista, nessuna ricerca            597
 *       5 attrezzi, 2 differiti                         785
 *       5 attrezzi, NESSUN differito                    881
 *       18 attrezzi, 16 differiti                       792
 *
 * ⇒ `defer_loading` MORDE: i differiti spariscono dal prefisso, e scala —
 * passare da 2 a 16 differiti costa SETTE token. ⛔ E funziona anche senza
 * l'intestazione beta `advanced-tool-use-2025-11-20`: identici 785.
 *
 * E il modello VEDE la ricerca. Chiesto di elencare i suoi strumenti:
 *
 *     tool_search_tool_bm25
 *     time_now
 *
 * — con `device_battery` correttamente nascosto.
 *
 * ### ⛔⛔ Cosa NON funziona, ed e' il muro
 *
 *     domanda secca                     ⛔ non cerca   ["text"]
 *     ordine esplicito NEL MESSAGGIO    ✓ CERCA        ["text","server_tool_use",
 *                                                       "tool_search_tool_result","text"]
 *     ordine nel SYSTEM PROMPT          ⛔ non cerca   ["text"]
 *
 * ⇒ Claude Haiku 4.5 non usa la ricerca di sua iniziativa, e il system prompt
 * NON lo convince. Solo la persona, chiedendolo a parole sue, lo fa cercare.
 * Provato anche con Sonnet 5: non cerca, chiama `memory_search` — cioe'
 * preferisce uno strumento che vede a uno che dovrebbe trovare.
 *
 * ⇒ Accendere questa riga vuol dire che TALOS risponde «non posso farlo» a ogni
 * capacita' differita, tranne quando la persona indovina di dirgli «cerca fra i
 * tuoi strumenti». E' peggio di un prefisso grande: e' un'app che nega di saper
 * fare cose che sa fare.
 *
 * ## ⭐ E la strada che questo apre, che e' meglio dell'originale
 *
 * Il meccanismo di Anthropic toglie gli strumenti dal prefisso e si fida che il
 * modello li cerchi. Noi abbiamo gia' l'altra meta': `catalogoCompatto`, un
 * INDICE degli strumenti — 38.386 → 5.087 byte, −87% — che oggi serve gli altri
 * fornitori. Le due cose non sono alternative: l'indice dice al modello CHE
 * COSA esiste, `defer_loading` evita di pagarne gli schemi.
 *
 * ⇒ Indice compatto in vista + schemi differiti = il modello sa di poter
 * cercare perche' vede i nomi, e paga solo cio' che apre. Nessuno dei due
 * meccanismi, da solo, fa questo.
 *
 * ### ⭐⭐⭐ PROVATO, e funziona — con l'economia misurata
 *
 * Con l'indice dei nomi nel system prompt, il modello CERCA e poi chiama
 * davvero lo strumento differito:
 *
 *     ["server_tool_use","tool_search_tool_result","text","tool_use"]
 *                                                        └ device_battery
 *
 * Tre strategie, 16 strumenti del dispositivo, stesso modello:
 *
 *                                    senza strumento   con strumento
 *     A) tutti visibili (oggi)            1.798            1.793
 *     B) differiti, senza indice            761         ⛔ ROTTA: nega
 *     C) differiti + indice                 872            1.908
 *
 * ⇒ **C risparmia 926 token** su un messaggio che non usa strumenti, e ne costa
 * **115 in piu'** su uno che li usa. In una chat la gran parte dei messaggi e'
 * conversazione ⇒ C vince, e vince molto.
 *
 * ⛔ E il pareggio si sposta col numero di strumenti: piu' ne offriamo, piu' A
 * peggiora e C resta fermo. Oggi sono 20; il piano ne prevede molti di piu'.
 *
 * ⛔⛔ Una misura sola stava per farmi buttare l'idea. Guardando solo il caso
 * «con strumento» — 1.908 contro 1.793 — la conclusione era «costa di piu', non
 * serve». Era vera su meta' dei messaggi e falsa sull'altra meta', che e' la
 * piu' numerosa. ⇒ Un'economia non si misura sul caso peggiore da solo.
 *
 * ### ⇒ Cosa serve per accenderla, in ordine
 *
 *   1. l'indice: `catalogoCompatto` lo produce gia' (−87%), oggi per gli altri
 *      fornitori. Va messo nel system prompt anche per Anthropic;
 *   2. `defer_loading` sugli schemi, che e' gia' scritto e provato qui;
 *   3. la catena dei sette ponti, gia' fatta.
 *
 * ⛔ Sono numeri di UNA prompt, UN modello, 16 strumenti. La forma e' netta, il
 * numero esatto no.
 */
const APERTURA_A_GRADI_ANTHROPIC = false

/**
 * ⭐⭐⭐ I BLOCCHI CHE VANNO RIMANDATI INDIETRO IMMUTATI.
 *
 * La ricerca degli attrezzi lato server produce due tipi che nascono dentro
 * Anthropic e che la documentazione chiede di replicare **unmodified** alla
 * voce «continuing the conversation». Non replicarli e' il difetto per cui
 * l'apertura a gradi e' spenta: al secondo giro la conversazione parte monca.
 *
 * ## ⛔ Un elenco CHIUSO, non «tutto quello che non riconosco»
 *
 * Verrebbe comodo conservare ogni blocco che non e' `text` ne' `tool_use`.
 * Sarebbe sbagliato in due modi:
 *
 *   - i blocchi `thinking` FIRMATI finirebbero qui dentro, e rimandarli senza
 *     la loro firma e' un 400 documentato — quello che ci ha gia' fatto fallire
 *     il secondo giro di ogni conversazione con gli strumenti;
 *   - un tipo nuovo inventato domani da Anthropic verrebbe rispedito senza che
 *     nessuno abbia deciso che si puo'.
 *
 * ⇒ Si conserva cio' che si e' capito, e si lascia cadere il resto. Un elenco
 * chiuso invecchia in modo VISIBILE: quando servira' un terzo tipo, mancherA'
 * e lo si vedra' — mentre un elenco aperto sbaglia in silenzio.
 */
export const TALOS_BLOCCHI_DA_CONSERVARE: readonly string[] = Object.freeze([
    'server_tool_use',
    'tool_search_tool_result',
])

export function talosBlocchiDaConservare(contenuto: unknown): readonly unknown[] {
    if (!Array.isArray(contenuto)) return []
    return contenuto.filter((blocco) => {
        if (typeof blocco !== 'object' || blocco === null) return false
        const tipo = (blocco as { type?: unknown }).type
        return typeof tipo === 'string' && TALOS_BLOCCHI_DA_CONSERVARE.includes(tipo)
    })
}

function listaPerIlFilo(
    tools: NonNullable<Parameters<typeof talosToolsForAnthropic>[0]>,
): { lista: unknown[], nome: string } {
    if (!APERTURA_A_GRADI_ANTHROPIC) {
        return { lista: talosToolsForAnthropic(tools), nome: 'anthropic/interi' }
    }
    const peso = talosPesoDegliAttrezzi(
        tools,
        (tool) => (talosToolsForAnthropic([tool])[0] as { input_schema?: unknown }).input_schema,
    )
    return talosConvieneAprireAGradi(tools, peso)
        ? { lista: talosAttrezziAnthropicAGradi(tools, talosVaDifferito), nome: 'anthropic/a-gradi' }
        : { lista: talosToolsForAnthropic(tools), nome: 'anthropic/sotto-soglia' }
}

function attrezziDaSpedire(tools: NonNullable<Parameters<typeof talosToolsForAnthropic>[0]>): unknown[] {
    const { lista, nome } = listaPerIlFilo(tools)
    /*
     * ⭐⭐ L'IMPRONTA DEL PROFILO, calcolata QUI perché è qui che nasce il
     * prefisso — Fase 1.1.
     *
     * La cache dei prompt combacia per prefisso esatto e gli attrezzi stanno
     * davanti a tutto: attrezzi → sistema → messaggi. Se questa lista cambia
     * fra due messaggi della stessa conversazione, muore l'INTERA cache, non la
     * parte cambiata — e finora sarebbe successo in silenzio, arrivando come un
     * numero di token più alto senza nessuno che sappia perché.
     *
     * ⛔ In TALOS la causa probabile non è l'apertura a gradi (i differiti
     * stanno già nel prefisso come abbozzi: la lista non cresce a conversazione
     * aperta). È un PERMESSO cambiato: concedere o togliere un potere cambia
     * quali attrezzi vengono offerti, quindi il prefisso, quindi la cache.
     *
     * Costa un `JSON.stringify` di una lista che stiamo comunque per
     * serializzare per spedirla.
     */
    const esito = talosRegistraProfilo(talosProfiloCompilato(nome, lista, tools))
    if (!esito.sopravvive) {
        // ⛔ `warn` e non `info`: `console.info` non arriva in logcat, ed è già
        // costato un giro di diagnosi a vuoto in questo progetto.
        console.warn(`talos: il prefisso è cambiato, cache dei prompt persa — ${esito.perche}`)
    }
    return lista
}

/**
 * The provider's own words out of an error body, and nothing else.
 *
 * Only used to ask "did you name the other thinking shape" — never shown to the
 * user, who gets the mapped message the error layer already produces.
 */
function anthropicErrorText(data: unknown): string {
    if (data && typeof data === 'object') {
        const error = (data as { error?: { message?: unknown } }).error
        if (error && typeof error.message === 'string') return error.message
    }
    return typeof data === 'string' ? data : ''
}

const modelSchema = z.object({
    id: z.string().min(1),
    display_name: z.string().min(1),
    type: z.string().optional(),
    created_at: z.string().optional(),
    /**
     * Quanti token di RISPOSTA questo modello regge — dichiarato da lui.
     *
     * Era il dato che mancava perché ogni risposta di Claude venisse tagliata a
     * 4096 token: il client aveva quel numero scritto a mano come ripiego, e
     * poiché nessuno gli passava mai un valore, il ripiego era diventato la
     * regola per tutti. Sui modelli attuali il tetto vero sta a 128.000, cioè
     * trentadue volte tanto — una risposta lunga si interrompeva a metà frase e
     * sembrava un difetto del modello.
     *
     * Facoltativo perché non tutti i gateway compatibili lo dichiarano;
     * `passthrough` lo lasciava già passare inosservato, che è precisamente il
     * modo in cui un dato utile resta inutilizzato.
     */
    max_tokens: z.number().int().positive().optional(),
    /** La finestra di contesto, dallo stesso posto e per lo stesso motivo. */
    max_input_tokens: z.number().int().positive().optional(),
}).passthrough()

const listSchema = z.object({
    data: z.array(modelSchema),
    has_more: z.boolean().optional().default(false),
    last_id: z.string().nullable().optional(),
}).passthrough()

const completionSchema = z.object({
    model: z.string().optional(),
    stop_reason: z.string().nullable().optional(),
    content: z.array(z.object({
        type: z.string(),
        text: z.string().optional(),
    }).passthrough()),
    /**
     * Telemetry, and read as such.
     *
     * This asked for numbers, and it was the only adapter that did — the
     * OpenAI-compatible one already accepts anything, and the consumer
     * (`promptCache.ts`) types it `Record<string, unknown>`. Anthropic's usage
     * block legitimately carries nulls (`cache_creation_input_tokens`), nested
     * objects (`cache_creation`, `server_tool_use`) and strings
     * (`service_tier`), so any of those threw the WHOLE answer away as
     * malformed — an answer that had been generated and paid for, rejected
     * over an accounting field nobody was reading.
     *
     * Found 2026-08-03: a deep research with Sonnet 5 as author stopped on
     * TALOS_PROVIDER_RESPONSE_MALFORMED at the synthesis. Chat was fine because
     * chat STREAMS and builds its own usage; only this non-streaming path
     * parses the provider's.
     */
    usage: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

function requestTimeouts(timeout: number | undefined): { connectTimeout: number; readTimeout: number } | Record<string, never> {
    return Number.isInteger(timeout) && timeout! > 0
        ? { connectTimeout: timeout!, readTimeout: timeout! }
        : {}
}

export const anthropicAdapter: TalosMobileProviderAdapter = {
    provider: 'anthropic',
    requiresSecret: true,
    // The API address is Anthropic own and fixed; there is nothing to point
    // this at.
    requiresEndpoint: false,
    async listModels(credential, transport) {
        const apiKey = requireProviderApiKey('anthropic', 'list_models', credential)
        const models = []
        let afterId: string | null = null
        for (let page = 0; page < 100; page += 1) {
            const query = new URLSearchParams({ limit: '1000' })
            if (afterId) query.set('after_id', afterId)
            const response = await transport.request({
                method: 'GET',
                url: `https://api.anthropic.com/v1/models?${query.toString()}`,
                headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
                ...requestTimeouts(credential.timeoutMs),
            })
            requireHttpSuccess({ provider: 'anthropic', operation: 'list_models', status: response.status, data: response.data })
            const parsed = listSchema.safeParse(response.data)
            if (!parsed.success) throw malformedProviderResponse('anthropic', 'list_models', { received: response.data, issues: parsed.error.issues })
            models.push(...parsed.data.data.map((model) => ({
                id: model.id,
                provider: 'anthropic' as const,
                displayName: model.display_name,
                chatCompatibility: 'supported' as const,
                // N1.5: every current Claude model is vision-capable (the /v1/models
                // list carries no modality field, so declare it). Without image
                // here the vision gate wrongly blocks attaching images to Claude.
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
                supportedParameters: ['thinking'],
                createdAt: model.created_at ?? null,
                // Nello stesso campo che Gemini popola già dal suo
                // `outputTokenLimit`: un tetto di risposta è la stessa cosa per
                // ogni fornitore, e tenerlo in un campo per provider sarebbe il
                // modo di riscoprire questo difetto una volta per fornitore.
                maxOutputTokens: model.max_tokens ?? null,
            })))
            if (!parsed.data.has_more) return { provider: 'anthropic', models }
            if (!parsed.data.last_id || parsed.data.last_id === afterId) throw malformedProviderResponse('anthropic', 'list_models', { received: response.data, note: 'pagination cursor missing or unchanged' })
            afterId = parsed.data.last_id
        }
        throw malformedProviderResponse('anthropic', 'list_models', { note: 'model list never terminated within the page budget' })
    },
    async complete(input, credential, transport) {
        const apiKey = requireProviderApiKey('anthropic', 'complete', credential)
        /**
         * Ask in the shape this model is known to take, and learn if wrong.
         *
         * There is no single thinking shape that works across the range —
         * `enabled` is a 400 on the newest models, `adaptive` on the oldest —
         * and a distributed app cannot carry the list. So the provider's own
         * 400 is the source of truth, read once per model and remembered.
         */
        const send = async (thinkingMode: 'enabled' | 'adaptive') => {
            const request = buildAnthropicRequest(apiKey, {
                model: input.model.id,
                turns: input.turns,
                system: input.system,
                effort: input.effort,
                thinking: input.thinking,
                thinkingMode,
                // Il tetto che il modello dichiara, non uno scelto da noi.
                maxTokens: input.model.maxOutputTokens ?? undefined,
                ...(input.tools?.length ? { tools: attrezziDaSpedire(input.tools) } : {}),
            })
            return transport.request({
                method: 'POST',
                url: request.url,
                headers: request.headers,
                data: request.body,
                ...requestTimeouts(credential.timeoutMs),
            })
        }

        let response = await send(talosThinkingModeFor(input.model.id))
        if (response.status === 400) {
            const other = talosAnthropicThinkingFallback(anthropicErrorText(response.data))
            if (other !== null) {
                learnTalosThinkingMode(input.model.id, other)
                response = await send(other)
            }
        }
        requireHttpSuccess({ provider: 'anthropic', operation: 'complete', status: response.status, data: response.data })
        const parsed = completionSchema.safeParse(response.data)
        if (!parsed.success) throw malformedProviderResponse('anthropic', 'complete', { received: response.data, issues: parsed.error.issues })
        const text = parsed.data.content
            .filter((part) => part.type === 'text')
            .map((part) => part.text ?? '')
            .join('')
        const toolCalls = parseAnthropicToolCalls(parsed.data.content)
        const blocchiDelFornitore = talosBlocchiDaConservare(parsed.data.content)
        // A turn that only requests tools carries no text — refusing it as
        // malformed would break the loop before it began.
        //
        // ⛔ E dopo un RISULTATO di tool il silenzio è legittimo: Claude parla
        // insieme alla chiamata, quindi al giro finale non ha più niente da
        // dire. Vedi il commento lungo sul ramo in streaming, che è dove il
        // difetto è stato misurato.
        if (!text && toolCalls.length === 0 && input.turns[input.turns.length - 1]?.role !== 'tool') throw malformedProviderResponse('anthropic', 'complete', { received: response.data, note: 'no text and no tool calls' })
        return {
            text,
            model: parsed.data.model ?? input.model.id,
            finishReason: parsed.data.stop_reason ?? null,
            usage: talosNumericUsage(parsed.data.usage),
            ...(toolCalls.length ? { toolCalls } : {}),
            ...(blocchiDelFornitore.length ? { providerBlocks: blocchiDelFornitore } : {}),
        }
    },
    // F2-T4: native fetch SSE. Anthropic permits browser-origin calls only with
    // the explicit opt-in header below; any pre-first-byte failure throws so the
    // router falls back to the buffered CapacitorHttp path.
    async streamComplete(input, credential, handlers) {
        const apiKey = requireProviderApiKey('anthropic', 'complete', credential)
        /**
         * The streaming path learns the same lesson as the buffered one.
         *
         * This is the path a chat actually uses, so leaving it out would have
         * left the fix invisible: the owner would still meet the 400 on every
         * message and only the retry logic he never sees would be correct.
         */
        const attempt = async (thinkingMode: 'enabled' | 'adaptive') => {
        const request = buildAnthropicRequest(apiKey, {
            model: input.model.id,
            turns: input.turns,
            system: input.system,
            effort: input.effort,
            thinking: input.thinking,
            thinkingMode,
            // Il tetto che il modello dichiara, non uno scelto da noi.
            maxTokens: input.model.maxOutputTokens ?? undefined,
            ...(input.tools?.length ? { tools: attrezziDaSpedire(input.tools) } : {}),
        })
        const toolCalls = createAnthropicToolCallAccumulator()
        /**
         * Token accounting off the stream, which is the only path a chat uses.
         *
         * Owner's diagnostics 2026-07-27 came back with `cache: null` on every
         * round of every send. That did NOT mean caching was off — it meant the
         * instrument was blind: only the buffered path ever reported `usage`,
         * and nothing in a real conversation goes through it. An unreadable
         * measurement is worse than none, because it reads as a negative result.
         *
         * Anthropic sends the input side (including the two cache counters) on
         * `message_start` and the output side on `message_delta`, so both are
         * harvested from the events already being parsed here.
         */
        const usage: Record<string, number> = {}
        const harvest = (event: { type?: string; message?: { usage?: unknown }; usage?: unknown }): void => {
            const reported = event.type === 'message_start' ? event.message?.usage : event.usage
            if (!reported || typeof reported !== 'object') return
            for (const [key, value] of Object.entries(reported as Record<string, unknown>)) {
                if (typeof value === 'number' && Number.isFinite(value)) usage[key] = value
            }
        }
        const stream = await talosStreamText({
            url: request.url,
            headers: { ...request.headers, 'anthropic-dangerous-direct-browser-access': 'true' },
            body: { ...request.body, stream: true },
            signal: handlers.signal,
            accumulator: createTalosSseAccumulator(),
            extract: (payload) => {
                const event = JSON.parse(payload) as {
                    type?: string
                    delta?: { type?: string; text?: string }
                    message?: { usage?: unknown }
                    usage?: unknown
                }
                toolCalls.push(event)
                harvest(event)
                return event.type === 'content_block_delta' && event.delta?.type === 'text_delta'
                    ? event.delta.text ?? ''
                    : ''
            },
            // Defect #5: extended thinking arrives as `thinking_delta` blocks
            // in the same SSE stream. Same channel, different block type.
            extractReasoning: (payload) => {
                const event = JSON.parse(payload) as { type?: string; delta?: { type?: string; thinking?: string } }
                return event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta'
                    ? event.delta.thinking ?? ''
                    : ''
            },
            onChunk: handlers.onChunk,
            onReasoning: handlers.onReasoning,
        })
            return { stream, toolCalls, usage }
        }

        let result
        try {
            result = await attempt(talosThinkingModeFor(input.model.id))
        } catch (error) {
            // Only when the provider named the other shape, and only before any
            // text has been shown: retrying after the user has watched half an
            // answer arrive would replay it from the top.
            const other = talosAnthropicThinkingFallback(
                error instanceof Error ? error.message : String(error),
            )
            if (other === null) throw error
            learnTalosThinkingMode(input.model.id, other)
            result = await attempt(other)
        }
        const { stream, toolCalls, usage: streamedUsage } = result
        const calls = toolCalls.calls()
        /*
         * ⛔⛔⛔ DOPO UN RISULTATO DI TOOL, IL SILENZIO È LEGITTIMO — e trattarlo
         * come guasto ha rotto ogni conversazione con Claude.
         *
         * ## Misurato sul Pad il 2026-08-14
         *
         * «spegni la torcia» → la torcia si spegneva davvero (08:26:23 in
         * `dumpsys`), compariva «Torcia spenta.», e **subito dopo**
         * `PROVIDER_CHAT_FAILED`. Ogni volta, su ogni chat, con ogni modello
         * Anthropic.
         *
         * La causa è una differenza fra provider che avevo già visto e non
         * avevo collegato: **Claude parla INSIEME alla chiamata**, Gemini tace.
         * Quindi al giro finale — quello che il ciclo fa dopo aver consegnato
         * il risultato — Claude non ha più niente da dire e chiude senza testo
         * e senza chiamate. Noi lo dichiaravamo malformato.
         *
         * ⇒ È la stessa differenza che produceva il testo doppio: una risposta
         * vuota **non è un guasto se il modello ha già parlato**.
         *
         * ## ⛔ E la guardia NON si toglie
         *
         * Serve, e serve dove è nata: al PRIMO giro una risposta senza testo e
         * senza chiamate è davvero un guasto — il modello non ha detto niente e
         * non ha chiesto niente, e senza questa riga la persona vedrebbe una
         * bolla vuota. Si restringe al caso in cui non stiamo rispondendo a un
         * tool, che è esattamente il caso che voleva prendere.
         */
        const dopoUnTool = input.turns[input.turns.length - 1]?.role === 'tool'
        if (!stream.text && calls.length === 0 && !dopoUnTool) throw malformedProviderResponse('anthropic', 'complete', { received: { text: stream.text, calls: calls.length }, note: 'stream ended with no text and no tool calls' })
        return {
            text: stream.text,
            model: input.model.id,
            // What the cache actually did this round, from the wire.
            usage: Object.keys(streamedUsage).length > 0 ? streamedUsage : null,
            reasoning: stream.reasoning || undefined,
            ...(calls.length ? { toolCalls: calls, finishReason: 'tool_use' } : {}),
        }
    },
}
