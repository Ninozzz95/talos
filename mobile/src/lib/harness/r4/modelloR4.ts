/**
 * ⛔ K3-C Scelta del modello (ledger `LEDGER-K3-MODELLO-2026-10-16.md`; owner 16/10 «Profili dell'app, chiave unica»).
 * Il Codice su r4 sceglie fra gli STESSI profili della chat; qui la traduzione verso r4 e il ponte delle chiavi.
 *   · l'id: `fonte:modello` per i fornitori diretti, l'id OpenRouter da solo (`model-destination.mjs` `separaFonteModello` @
 *     701c6c0d2, invariato da 2161afb32, provato col golden `modello-fonti-701c6c0d2.json`); l'id del profilo dell'app È già `fornitore:modello`;
 *   · il ragionamento: r4 vuole `none` dove la chat dice `off` (`config.mjs` `EFFORT_AMMESSI`; `off` → 400 `REASONING_INVALID`);
 *   · la chiave: una sola, quella dell'app. Passa nel portachiavi di r4 (`POST /providers/:id/key`, cifrato con la chiave sigillata
 *     nell'archivio sicuro di Android, K2-C), mai nell'ambiente; se l'app non l'ha, la copia di r4 si toglie (owner 16/10).
 * Fuori dal Codice: il motore dentro l'app (`local`, r4 non lo raggiunge) e il piano ChatGPT (`chatgpt`, N15).
 */
import type { TalosMobileModelProfileView, TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import type { TalosR4ClientePonte } from './clienteR4'
import erroriModello from './testi/errori-modello-r4.json'
import { testoApprovazioneR4 } from './approvazioniR4'

export const FORNITORI_DEL_CODICE_R4: ReadonlySet<TalosMobileProviderId> = new Set<TalosMobileProviderId>(['openai', 'deepseek', 'anthropic', 'gemini', 'openrouter', 'ollama'])

/**
 * Le fonti che r4 riconosce davanti ai due punti (`provider-registry.mjs` `ID_DESTINAZIONE_CHAT` @ 701c6c0d2, invariato da 2161afb32, golden
 * `modello-fonti-701c6c0d2.json`). Senza, `lmstudio:finto` sembrerebbe un id OpenRouter e si sincronizzerebbe la chiave sbagliata.
 */
export const FONTI_DI_CHAT_R4: readonly string[] = Object.freeze([
    'esterno', 'openai', 'chatgpt', 'deepseek', 'kimi', 'minimax', 'qwen', 'zai', 'anthropic', 'gemini', 'openrouter', 'ollama', 'lmstudio',
    'groq', 'cerebras', 'mistral', 'together', 'fireworks', 'deepinfra', 'novita', 'nebius', 'xai', 'ollama-cloud', 'huggingface',
    'zai-anthropic', 'minimax-anthropic', 'azure', 'bedrock', 'vertex', 'local',
])

/** `separaFonteModello` di r4: la fonte prima del PRIMO due punti, se r4 la conosce; altrimenti OpenRouter. */
export function fornitoreDelModelloR4(modello: string | null | undefined): string | null {
    if (!modello) return null
    const taglio = modello.indexOf(':')
    if (taglio > 0 && FONTI_DI_CHAT_R4.includes(modello.slice(0, taglio))) return modello.slice(0, taglio)
    return 'openrouter'
}

export interface RagionamentoR4 {
    effort: string
}

/** L'id che r4 riconosce per il profilo; `null` per un profilo che il Codice non porta. */
export function modelloR4DelProfilo(profilo: Pick<TalosMobileModelProfileView, 'provider' | 'model'>): string | null {
    if (!FORNITORI_DEL_CODICE_R4.has(profilo.provider)) return null
    return profilo.provider === 'openrouter' ? profilo.model : `${profilo.provider}:${profilo.model}`
}

/**
 * Il profilo dietro il modello della sessione. Un modello che l'app non elenca (scelto altrove, o un fornitore che la chat non ha)
 * diventa un profilo col nome che r4 gli dà: la pastiglia dice il vero invece di «Scegli modello».
 */
export function profiloDelModelloR4(modello: string | null | undefined, profili: readonly TalosMobileModelProfileView[]): TalosMobileModelProfileView | null {
    if (!modello) return null
    const trovato = profili.find((p) => modelloR4DelProfilo(p) === modello)
    if (trovato) return trovato
    return {
        // la fonte come la legge r4 (`lmstudio`…): l'icona del fornitore ricade da sé su quella generica per un id che l'app non ha
        id: `r4:${modello}`, provider: fornitoreDelModelloR4(modello) as TalosMobileProviderId, model: modello, display_name: modello, status: 'untested', has_secret: true,
        effort_levels: [], supports_thinking: false, show_in_composer: true, capabilities: null, probe_ok: null,
    }
}

export function ragionamentoR4(livello: string): RagionamentoR4 {
    return { effort: livello === 'off' ? 'none' : livello }
}

/** Il livello della chat per il ragionamento della sessione; nessuno, o `none`, è «off». */
export function livelloDelRagionamentoR4(reasoning: unknown): string {
    const effort = reasoning && typeof reasoning === 'object' ? (reasoning as { effort?: unknown }).effort : null
    return typeof effort === 'string' && effort !== 'none' ? effort : 'off'
}

const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)

/**
 * Il motivo di un rifiuto legato al modello, come lo dice il desktop (`testoErroreServer` e `fraseChiaveMancante`, `legacy/app.js:3244`
 * @ 2161afb32): la chiave che manca ha la sua frase col nome del fornitore (`errori.CONFIG_INVALID.<motivo>`), gli altri codici la
 * loro `<CODICE>.message`. Un codice che il dizionario non porta resta con le parole di r4, mai una chiave grezza.
 * Dal pin 701c6c0d2 il desktop dice la chiave che manca con `fraseDelMotivo` (#44): sulla busta vera la frase è la stessa (MOT-R4-03).
 */
export function messaggioErroreModelloR4(errore: { code: string; message: string; reason?: string; params?: Record<string, unknown> }, lingua: string): string {
    const tabella = (italiano(lingua) ? erroriModello.it : erroriModello.en) as Record<string, string>
    const dalDizionario = (chiave: string) => (Object.hasOwn(tabella, chiave) ? tabella[chiave] : undefined)
    const motivo = errore.code === 'CONFIG_INVALID' && (errore.reason === 'provider-key-missing' || errore.reason === 'provider-key-missing-named')
        ? dalDizionario(`CONFIG_INVALID.${errore.reason.replace(/-/gu, '_')}`)
        : undefined
    const frase = motivo ?? dalDizionario(`${errore.code}.message`)
    if (!frase) return errore.message
    return frase.replace(/\{(\w+)\}/gu, (tutto, k: string) => (errore.params && typeof errore.params[k] === 'string' ? String(errore.params[k]) : tutto))
}

export interface ErroreDelFornitoreR4 extends Error {
    code: string
}

function rifiuto(stato: number, corpo: string): ErroreDelFornitoreR4 {
    let code = `HTTP_${stato}`
    let message = `HTTP ${stato}`
    try {
        const e = (JSON.parse(corpo) as { error?: { code?: unknown; message?: unknown } }).error
        if (typeof e?.code === 'string') { code = e.code; message = typeof e.message === 'string' ? e.message : e.code }
    } catch {
        // resta lo stato HTTP
    }
    return Object.assign(new Error(message), { code })
}

interface FornitorePubblicoR4 {
    id: string
    requiresKey?: boolean
    keyConfigured?: boolean
    origineChiave?: string | null
    supportsEndpoint?: boolean
    endpoint?: string | null
    endpointConfigured?: boolean
}

/**
 * Porta in r4 la chiave e l'indirizzo che l'app ha per quel fornitore, alla scelta del modello e prima di ogni invio (owner 16/10).
 * Una lettura di `GET /providers`, poi solo le scritture che servono. La chiave non si legge mai da r4 (non la ridà): si riscrive.
 */
export async function sincronizzaFornitoreR4(
    cliente: TalosR4ClientePonte,
    fornitore: string,
    { chiave, indirizzo }: { chiave: string | null; indirizzo: string | null },
): Promise<void> {
    if (!FORNITORI_DEL_CODICE_R4.has(fornitore as TalosMobileProviderId)) return
    const chiama = async (metodo: 'GET' | 'POST', percorso: string, corpo?: unknown): Promise<string> => {
        const r = await cliente.richiesta({ metodo, percorso, ...(corpo === undefined ? {} : { corpo: JSON.stringify(corpo) }) })
        if (r.stato < 200 || r.stato >= 300) throw rifiuto(r.stato, r.corpo)
        return r.corpo
    }
    const elenco = JSON.parse(await chiama('GET', '/api/v1/providers')) as { data?: { items?: FornitorePubblicoR4[] } }
    const voce = elenco.data?.items?.find((i) => i.id === fornitore)
    if (!voce) return
    const base = `/api/v1/providers/${encodeURIComponent(fornitore)}`
    if (voce.requiresKey !== false) {
        if (chiave) await chiama('POST', `${base}/key`, { key: chiave })
        else if (voce.keyConfigured && voce.origineChiave === 'custodia') await chiama('POST', `${base}/key/remove`, {})
    }
    if (voce.supportsEndpoint) {
        if (indirizzo && indirizzo !== voce.endpoint) await chiama('POST', `${base}/runtime`, { endpoint: indirizzo })
        else if (!indirizzo && voce.endpointConfigured) await chiama('POST', `${base}/runtime/reset`, {})
    }
}

/**
 * K3 automazioni (ledger `LEDGER-K3-AUTOMAZIONI-FORNITORI-COORDINAZIONE-2026-10-17.md`): il nome di un modello per la persona, mai
 * l'id grezzo. Trascrizione di `nomeModelloUmano` (`chat-foot.js` @ 701c6c0d2): via il prefisso del fornitore (`deepseek:`), via la
 * tilde, l'ultima parte del percorso; un GGUF locale diventa «famiglia · parametri (attivi) · quantizzazione».
 */
export function nomeModelloUmanoR4(id: unknown, lingua = 'en'): string {
    if (typeof id !== 'string' || !id.trim()) return ''
    const grezzo = id.trim()
    if (!/^local:/i.test(grezzo)) {
        const senzaFonte = grezzo.replace(/^[a-z][a-z0-9-]*:(?=.)/u, '')
        return senzaFonte.replace(/^~/u, '').split('/').pop() ?? ''
    }
    const resto = grezzo.replace(/^local:/i, '').replace(/[-_.]gguf$/i, '')
    const quant = /[-_](IQ\d\w*|Q\d(?:[-_]\d)?(?:[-_][A-Z]+)*)(?=[-_]|$)/i.exec(resto)
    const parametri = /(?:^|[-_])(\d+(?:[.,]\d+)?B)(?:[-_]A(\d+(?:[.,]\d+)?B))?(?=[-_]|$)/i.exec(resto)
    let nome = resto
    if (parametri) nome = resto.slice(0, parametri.index)
    nome = nome.replace(/[-_](GGUF|MLX|AWQ|GPTQ)$/i, '')
    const pezzi = nome.split(/[-_]/).filter(Boolean)
    if (pezzi.length > 1) pezzi.shift() // il primo segmento è chi ha pubblicato il file, non il modello
    const pulito = pezzi.join(' ').replace(/\s+/g, ' ').trim()
    const parti = [pulito || resto]
    if (parametri) {
        parti.push(parametri[2]
            ? testoApprovazioneR4('chat.foot.activeOf', lingua, { totali: parametri[1], attivi: parametri[2].replace(/^A/i, '') })
            : parametri[1])
    }
    if (quant) parti.push(quant[1].toUpperCase().replace(/-/g, '_'))
    return parti.filter(Boolean).join(' · ')
}
