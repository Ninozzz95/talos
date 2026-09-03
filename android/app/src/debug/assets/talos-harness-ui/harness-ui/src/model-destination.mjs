/**
 * Dove vive un modello, e come gli si parla — SOLO per le sessioni Codice
 * (il kernel `talosHarness.mjs`, non la chat).
 *
 * ## Perché esiste
 *
 * Owner, 03/9: «se non riesco ad aggiungere più provider oltre a OpenRouter e
 * soprattutto usare i modelli locali, l'applicazione è spacciata». Verificato
 * nel sorgente vero, non a memoria: il kernel ha UNA sola chiamata cablata —
 * `https://openrouter.ai/api/v1/chat/completions`, riga 392 di
 * `talosHarness.mjs`. Una stringa, non un'architettura.
 *
 * ⛔⛔⛔ Porta il DISEGNO della lane desktop (`AVM-harness-desktop/harness-ui/
 * src/model-destination.mjs`, commit `116ec2de`, stesso giorno) — la
 * convenzione dei due punti è stata CONCORDATA fra le due lane, non
 * reinventata qui. Ma i valori (indirizzi, dove si leggono le chiavi) sono
 * quelli che la CHAT mobile usa già, non quelli del desktop: owner, 3/9,
 * dopo aver trovato questo file a un primo tentativo di ricopiare il
 * desktop senza controllare — «guarda come fa la chat, per evitare di
 * duplicare codice» — `providerRegistry.ts`/`openAiCompatibleAdapter.ts`
 * hanno GIÀ gli indirizzi giusti per OpenAI/DeepSeek/OpenRouter, e
 * `secureKeyStore.ts`/`providerEndpointStore.ts` hanno già il posto dove le
 * credenziali sono salvate — riusati qui, non riderivati.
 *
 * ## Il fatto che rende la cura piccola
 *
 * Quasi tutti parlano GIÀ lo stesso protocollo: `POST {base}/chat/completions`
 * con `Authorization: Bearer`, stesso corpo. Vale per OpenAI, DeepSeek,
 * OpenRouter — e per Ollama tramite la sua rotta di compatibilità OpenAI
 * (`/v1/chat/completions`; la chat mobile parla invece con la rotta nativa
 * `/api/chat` in `ollamaAdapter.ts`, perché costruisce da sé il corpo della
 * richiesta — qui invece il corpo arriva GIÀ nella forma OpenAI dal kernel,
 * quindi la rotta di compatibilità è quella giusta, non quella nativa: stessa
 * ragione per cui il desktop ha fatto la stessa scelta).
 * ⇒ Per questi basta cambiare indirizzo e intestazioni. Nessuna traduzione
 * del corpo, nessun adattatore nuovo.
 *
 * ⛔ Anthropic e Gemini NO: vogliono una forma di richiesta diversa
 * (`/v1/messages` con `x-api-key`; `:generateContent` con la chiave in
 * query, e ruoli/contenuti strutturati altrimenti — la chat mobile li
 * traduce in `anthropicAdapter.ts`/`geminiAdapter.ts`, un adattatore per
 * intero, non una riscrittura di URL). Qui vengono RIFIUTATI con un
 * messaggio che dice perché e cosa manca — mai instradati su un URL che
 * risponderebbe 404 lasciando credere a una chiave sbagliata.
 *
 * ⛔⛔⛔ Locale NO — e per un motivo DIVERSO dagli altri due, non "manca la
 * traduzione": il motore locale su mobile non ha un indirizzo di rete per
 * costruzione. `localAdapter.ts` lo dichiara esplicito nel proprio commento
 * di testa — «there is no key, no endpoint... nothing here can reach
 * anything, which is the property the app promises about local models» — è
 * un plugin nativo (Capacitor), raggiungibile SOLO dal processo della
 * WebView. Il kernel Codice gira in un processo Node separato (il server
 * standalone sul telefono, via `TalosPonteAdb`), che non può richiamare un
 * plugin Capacitor. Riscrivere l'URL come per gli altri provider non
 * risolverebbe niente: qui non c'è un URL da riscrivere, serve un ponte fra
 * due processi che oggi non esiste. Fuori scope qui — owner, 3/9: "colleghiamo
 * i 5 [provider di rete], poi pensiamo ai locali" — deliberatamente rifiutato
 * con un messaggio onesto, non implementato a metà e non nascosto.
 *
 * ## La convenzione sul nome, e perché i DUE PUNTI
 *
 * Gli id OpenRouter sono già `autore/modello` (`deepseek/deepseek-v4-flash`),
 * quindi lo slash è occupato e non può separare la fonte. Si usa il carattere
 * `:` come prefisso — `openai:gpt-5.6-luna`, `ollama:llama3.2` — e
 * **nessun prefisso significa OpenRouter**, così tutto ciò che esiste oggi
 * continua a funzionare identico, senza migrare una sola sessione salvata.
 * Concordato con avm-03 (lane desktop) prima di scriverlo qui.
 */

export class ModelDestinationError extends Error {
    constructor(message, code = 'MODEL_DESTINATION_INVALID') {
        super(message)
        this.name = 'ModelDestinationError'
        this.code = code
    }
}

/**
 * Le fonti riconosciute nel prefisso. ⛔ Tutto il resto è un id OpenRouter —
 * `local`/`anthropic`/`gemini` sono riconosciute qui (mai scambiate per un
 * id OpenRouter letterale) ma rifiutate più sotto, con un motivo onesto.
 */
export const FONTI_MODELLO = Object.freeze(['local', 'ollama', 'openai', 'deepseek', 'openrouter', 'anthropic', 'gemini'])

/**
 * Spacca `fonte:modello`. ⛔ Solo sul PRIMO due punti, e solo se ciò che sta
 * davanti è una fonte conosciuta: un id che contenesse un `:` per altri
 * motivi non deve essere dirottato su un provider inesistente.
 */
export function separaFonteModello(modello) {
    if (typeof modello !== 'string' || modello.trim() === '') {
        throw new ModelDestinationError('model id is missing', 'MODEL_DESTINATION_INVALID')
    }
    const taglio = modello.indexOf(':')
    if (taglio > 0) {
        const fonte = modello.slice(0, taglio)
        if (FONTI_MODELLO.includes(fonte)) return { fonte, modelloRemoto: modello.slice(taglio + 1) }
    }
    return { fonte: 'openrouter', modelloRemoto: modello }
}

/** Chi parla `POST {base}/chat/completions` con Bearer: il corpo non si tocca. */
const COMPATIBILI_OPENAI = Object.freeze(['openrouter', 'openai', 'deepseek', 'ollama'])

/**
 * Stessi indirizzi che `openAiCompatibleAdapter.ts` usa per la chat — non
 * riderivati.
 */
const BASE_FISSA = Object.freeze({
    openai: 'https://api.openai.com/v1',
    deepseek: 'https://api.deepseek.com',
    openrouter: 'https://openrouter.ai/api/v1',
})

/**
 * Chi NON è ancora instradabile, e perché — tre motivi diversi, mai
 * confusi in un messaggio unico: anthropic/gemini vogliono una traduzione
 * di protocollo non ancora scritta, locale vuole un ponte fra due processi
 * non ancora costruito. ⛔ Il messaggio dice la cosa vera — la credenziale
 * può essere ottima, manca la parte nostra — perché un errore che sembra
 * colpa della chiave manda a rigenerarne una buona per niente.
 */
const DA_TRADURRE = Object.freeze({
    anthropic: 'Anthropic usa /v1/messages con un formato di richiesta diverso: la traduzione non è ancora scritta per le sessioni Codice.',
    gemini: 'Gemini usa :generateContent con un formato di richiesta diverso: la traduzione non è ancora scritta per le sessioni Codice.',
    local: 'Il motore locale non è ancora raggiungibile dalle sessioni Codice: serve un ponte fra il server e il plugin nativo, non ancora costruito.',
})

/**
 * @param {string} modello id, con o senza prefisso di fonte
 * @param {object} deps
 * @param {(fonte: string) => string|null} deps.leggiChiave dalla credenziale salvata
 * @param {(fonte: string) => {endpoint?: string|null}} deps.leggiRuntime indirizzo configurato (solo ollama)
 * @returns {{fonte: string, url: string, headers: Record<string,string>, modelloRemoto: string}}
 */
export function risolviDestinazioneModello(modello, { leggiChiave, leggiRuntime } = {}) {
    if (typeof leggiChiave !== 'function' || typeof leggiRuntime !== 'function') {
        throw new ModelDestinationError('destination dependencies are invalid', 'MODEL_DESTINATION_MISCONFIGURED')
    }
    const { fonte, modelloRemoto } = separaFonteModello(modello)

    if (DA_TRADURRE[fonte]) throw new ModelDestinationError(DA_TRADURRE[fonte], 'MODEL_PROVIDER_NOT_SUPPORTED_YET')
    if (!COMPATIBILI_OPENAI.includes(fonte)) throw new ModelDestinationError(`Fonte del modello non riconosciuta: ${fonte}`, 'MODEL_DESTINATION_INVALID')

    const runtime = leggiRuntime(fonte) || {}
    const base = typeof runtime.endpoint === 'string' && runtime.endpoint.trim() !== '' ? runtime.endpoint.replace(/\/+$/u, '') : null
    const chiave = leggiChiave(fonte)

    if (fonte === 'ollama') {
        // ⛔ Ollama gira in casa e non ha account: pretendere una chiave lo escluderebbe per una regola che non lo riguarda.
        if (!base) throw new ModelDestinationError('Manca l\'indirizzo del server Ollama: impostalo in Impostazioni → Modelli → Provider.', 'PROVIDER_RUNTIME_INVALID')
        const headers = { 'Content-Type': 'application/json' }
        if (chiave) headers.Authorization = `Bearer ${chiave}`
        // ⛔ Ollama espone il protocollo OpenAI sotto /v1, il suo indirizzo base no (stessa nota di ollamaAdapter.ts sul lato chat).
        return { fonte, modelloRemoto, url: `${base}/v1/chat/completions`, headers }
    }

    // openai / deepseek / openrouter: indirizzo FISSO, stesso di providerRegistry.ts/openAiCompatibleAdapter.ts lato chat — non configurabile, non riletto da leggiRuntime.
    const baseFisso = BASE_FISSA[fonte]
    if (typeof chiave !== 'string' || chiave.trim() === '') {
        throw new ModelDestinationError(`Manca la chiave per ${fonte}: inseriscila in Impostazioni → Modelli → Provider.`, 'PROVIDER_KEY_MISSING')
    }
    return {
        fonte,
        modelloRemoto,
        url: `${baseFisso}/chat/completions`,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chiave}` },
    }
}

/**
 * ⭐⭐⭐ 03/9 — I MODELLI DI OGNI PROVIDER, FATTI GIRARE DAVVERO (le sessioni Codice).
 *
 * ## Perché QUI e non nel kernel
 *
 * Il kernel ha UNA riga cablata su OpenRouter, ma prende `fetchDiRete` come
 * dipendenza (già oggi, per i test — `talosHarness.mjs`). Questo avvolgitore
 * si mette FRA `agent-service.mjs` e quel parametro: il kernel dice «fai un
 * completamento per il modello X»; DOVE vive X è una decisione del
 * trasporto, non sua — zero righe modificate nel kernel.
 *
 * ## Cosa fa, esattamente
 *
 * Guarda il `model` del corpo uscente. Senza prefisso di fonte non tocca
 * NIENTE — la richiesta parte come è sempre partita, e nessuna sessione
 * esistente cambia comportamento. Con un prefisso riconosciuto riscrive
 * indirizzo e intestazioni, e rimette nel corpo il nome vero del modello
 * senza prefisso: il provider non deve sapere niente della nostra
 * convenzione.
 *
 * ⛔ Se la fonte non è servibile — chiave mancante, provider non ancora
 * tradotto, locale non ancora raggiungibile — NON parte nessuna richiesta:
 * si solleva l'errore con il motivo vero. Partire e prendersi un 404
 * farebbe sembrare rotta una credenziale che è buona.
 */
/**
 * ⛔ L'UNICO URL che il kernel chiama davvero per un completamento
 * (`talosHarness.mjs`, `chiamaConRitenta`) — confronto ESATTO, non una
 * sottostringa. `generate_image` (`image-generator.mjs`) usa la propria
 * `fetch` diretta, mai `fetchDiRete` — verificato leggendo il sorgente,
 * non assunto — quindi oggi non c'è collisione possibile; un confronto
 * esatto invece di `.includes('/chat/completions')` la esclude anche se
 * quel percorso venisse mai collegato a `fetchDiRete` in futuro (Ollama
 * espone `/api/chat`, non `/chat/completions` — nessun accostamento
 * casuale con un percorso di un provider diverso, per costruzione).
 */
const URL_COMPLETAMENTO_KERNEL = 'https://openrouter.ai/api/v1/chat/completions'

export function creaFetchMultiProvider(fetchDiRete = fetch, { risolvi = risolviDestinazioneModello, dipendenze = null } = {}) {
    if (!dipendenze) return fetchDiRete
    return async function fetchMultiProvider(url, opzioni = {}) {
        let corpo = null
        try {
            corpo = typeof opzioni.body === 'string' ? JSON.parse(opzioni.body) : null
        } catch {
            corpo = null
        }
        /*
         * ⛔ Si interviene solo su una richiesta di completamento
         * riconoscibile: il kernel usa questa stessa fetch anche per la
         * ricerca web — dirottare quella sarebbe un guasto silenzioso.
         */
        if (!corpo || typeof corpo.model !== 'string' || String(url) !== URL_COMPLETAMENTO_KERNEL) {
            return fetchDiRete(url, opzioni)
        }
        /*
         * ⭐ Il controllo del PREFISSO (gratis, senza dipendenze) viene prima
         * della risoluzione VERA (che vuole `leggiChiave`/`leggiRuntime`):
         * un modello senza prefisso — la stragrande maggioranza delle
         * sessioni, oggi tutte — non deve dipendere da NESSUNA delle nuove
         * credenziali per continuare a funzionare esattamente come prima.
         * Un server senza `dipendenzeMultiProvider` configurato per intero
         * (es. `leggiChiave('openrouter')` che torna null) non deve rompere
         * le sessioni che non hanno mai chiesto un prefisso.
         */
        if (separaFonteModello(corpo.model).fonte === 'openrouter') return fetchDiRete(url, opzioni)
        const destinazione = risolvi(corpo.model, dipendenze)
        const corpoRiscritto = JSON.stringify({ ...corpo, model: destinazione.modelloRemoto })
        return fetchDiRete(destinazione.url, {
            ...opzioni,
            headers: { ...destinazione.headers },
            body: corpoRiscritto,
        })
    }
}
