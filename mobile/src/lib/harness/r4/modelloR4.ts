/**
 * ⛔ K3-C Scelta del modello (ledger `LEDGER-K3-MODELLO-2026-10-16.md`; owner 16/10 «Profili dell'app, chiave unica»).
 * Il Codice su r4 sceglie fra gli STESSI profili della chat; qui la traduzione verso r4 e il ponte delle chiavi.
 *   · l'id: `fonte:modello` per i fornitori diretti, l'id OpenRouter da solo (`model-destination.mjs` `separaFonteModello` @
 *     701c6c0d2, invariato da 2161afb32, provato col golden `modello-fonti-701c6c0d2.json`); l'id del profilo dell'app È già `fornitore:modello`;
 *   · il ragionamento: r4 vuole `none` dove la chat dice `off` (`config.mjs` `EFFORT_AMMESSI`; `off` → 400 `REASONING_INVALID`);
 *   · la chiave: una sola, quella dell'app. Passa nel portachiavi di r4 (`POST /providers/:id/key`, cifrato con la chiave sigillata
 *     nell'archivio sicuro di Android, K2-C), mai nell'ambiente; se l'app non l'ha, la copia di r4 si toglie (owner 16/10).
 * ⛔ CODICE COL MOTORE LOCALE (owner 18/10/2026, ledger `LEDGER-CODICE-MOTORE-LOCALE-2026-10-18.md`): il motore dentro l'app è nel
 *   Codice come nella chat. r4 (fonte `locale-ospite`, `accesso-locale-ospite.mjs` @ 0f3f90f8e) non lo carica una seconda volta: gli
 *   parla sul socket privato che l'app apre, con la chiave che l'app gli spinge (`spingiAccessoLocaleR4`) prima di ogni giro.
 * ⛔ CHATGPT NEL CODICE (owner 18/10/2026: «Deve selezionarli esattamente come i modelli della chat»; ledger
 *   `LEDGER-CHATGPT-NEL-CODICE-2026-10-18.md`): il piano è nel Codice come nella chat. Un solo custode, l'app: prima di ogni giro
 *   spinge a r4 il token e la sua scadenza (`spingiAccessoChatgptR4`); r4 (`TALOS_CHATGPT_CUSTODE=app`) non rinnova mai.
 */
import type { TalosMobileModelProfileView, TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import type { TalosR4ClientePonte } from './clienteR4'
import erroriModello from './testi/errori-modello-r4.json'
// i codici generici del server (INTERNAL_ERROR, NOT_FOUND, QUERY_INVALID…), con le parole del desktop già estratte per il piano
import erroriGenerici from './testi/errori-piano-r4.json'
// revisione del blocco 10, F-R1: i codici del PC coi motivi; FRASI-UNICHE (27/10/2026): estratti di nuovo a r4 79ea996de, ora anche coi .message
import erroriDelPc from './testi/errori-generici-r4.json'
import erroriChatgpt from './testi/errori-chatgpt-r4.json'
import erroriLocale from './testi/errori-locale-r4.json'
import erroriKernel from './testi/errori-kernel-r4.json'
// IMPOSTAZIONE-RIFIUTATA (Pad, 27/10/2026): i rifiuti di una sessione (SESSION_NOT_READY col motivo…), già estratti per la lista del
// Codice: un cambio di modo durante un giro diceva «Session not ready for this action» in inglese con l'app in italiano
import erroriSessioni from './testi/errori-sessioni-r4.json'
import { testoApprovazioneR4 } from './approvazioniR4'
import { fraseDelMotivoR4, fraseErroreR4 } from './fraseErroreR4'

export const FORNITORI_DEL_CODICE_R4: ReadonlySet<TalosMobileProviderId> = new Set<TalosMobileProviderId>(['openai', 'chatgpt', 'deepseek', 'anthropic', 'gemini', 'openrouter', 'ollama', 'local'])

/** La fonte di r4 per il motore dell'app (`FONTE_LOCALE_OSPITE` @ 0f3f90f8e). */
export const FONTE_LOCALE_OSPITE_R4 = 'locale-ospite'

/**
 * Le fonti che r4 riconosce davanti ai due punti (`provider-registry.mjs` `ID_DESTINAZIONE_CHAT` @ 0f3f90f8e, golden
 * `modello-fonti-0f3f90f8e.json`; da 701c6c0d2 si aggiunge solo `locale-ospite`). Senza, `lmstudio:finto` sembrerebbe un id OpenRouter e si sincronizzerebbe la chiave sbagliata.
 */
export const FONTI_DI_CHAT_R4: readonly string[] = Object.freeze([
    'esterno', 'openai', 'chatgpt', 'deepseek', 'kimi', 'minimax', 'qwen', 'zai', 'anthropic', 'gemini', 'openrouter', 'ollama', 'lmstudio',
    'groq', 'cerebras', 'mistral', 'together', 'fireworks', 'deepinfra', 'novita', 'nebius', 'xai', 'ollama-cloud', 'huggingface',
    'zai-anthropic', 'minimax-anthropic', 'azure', 'bedrock', 'vertex', 'local', 'locale-ospite',
])

/** La grammatica di r4 per il nome di un modello locale (`FORMA_ID_MODELLO_LOCALE` @ 0f3f90f8e, senza maiuscole/minuscole). */
const NOME_LOCALE_R4 = /^[a-z0-9][a-z0-9._-]{0,127}$/iu

/** Il nome del file che r4 accetta come modello locale: fuori dalla grammatica il Codice non spinge e dice perché. */
export function nomeLocaleValidoR4(nome: string): boolean {
    return NOME_LOCALE_R4.test(nome)
}

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
    // il profilo locale ha per id il percorso del file; al motore arriva il nome del file (`TalosLlamaPlugin.motoreOspite`)
    if (profilo.provider === 'local') return `${FONTE_LOCALE_OSPITE_R4}:${profilo.model.split('/').pop() ?? profilo.model}`
    return profilo.provider === 'openrouter' ? profilo.model : `${profilo.provider}:${profilo.model}`
}

/**
 * Il profilo dietro il modello della sessione. Un modello che l'app non elenca (scelto altrove, o un fornitore che la chat non ha)
 * diventa un profilo col nome che r4 gli dà: la pastiglia dice il vero invece di «Scegli modello».
 */
export function profiloDelModelloR4(
    modello: string | null | undefined,
    profili: readonly TalosMobileModelProfileView[],
    opzioni: { dispositivo?: boolean } = {},
): TalosMobileModelProfileView | null {
    if (!modello) return null
    const locale = fornitoreDelModelloR4(modello) === FONTE_LOCALE_OSPITE_R4
    // il nome del file di un locale si confronta senza maiuscole, come `sincronizzaLocale` (revisione avversaria 22/10, rilievo 7)
    const uguale = (id: string | null) => (locale ? id?.toLowerCase() === modello.toLowerCase() : id === modello)
    const trovato = profili.find((p) => uguale(modelloR4DelProfilo(p)))
    if (trovato) return trovato
    // un modello del dispositivo che l'app non elenca più (file eliminato, Pad 22/10/2026): resta locale, col nome del file come gli
    // altri, invece del gruppo «locale-ospite» con l'icona ignota; `modelloR4DelProfilo` lo riporta allo stesso id di r4.
    // ⛔ In remoto (`dispositivo: false`) il file è del PC: l'id di r4 resta intero (rilievo 8).
    if (locale && opzioni.dispositivo !== false) {
        const file = modello.slice(FONTE_LOCALE_OSPITE_R4.length + 1)
        return {
            id: `r4:${modello}`, provider: 'local', model: file, display_name: file.replace(/\.gguf$/i, ''), status: 'untested', has_secret: false,
            effort_levels: [], supports_thinking: false, show_in_composer: true, capabilities: null, probe_ok: null,
        }
    }
    const fonte = fornitoreDelModelloR4(modello)
    // ⛔ D-0145-4b (Desktop 26/10): il nome è il modello senza la fonte («z-ai/glm-4.7», non «openrouter:z-ai/glm-4.7»): la fonte la
    // dice già il gruppo; l'id intero resta in `model`, che è ciò che torna a r4
    const nome = modello.startsWith(`${fonte}:`) ? modello.slice(`${fonte}:`.length) : modello
    return {
        // la fonte come la legge r4 (`lmstudio`…): l'icona del fornitore ricade da sé su quella generica per un id che l'app non ha
        id: `r4:${modello}`, provider: fonte as TalosMobileProviderId, model: modello, display_name: nome, status: 'untested', has_secret: true,
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

/**
 * J3 (24/10/2026): il livello per la pillola del ragionamento, che distingue «nessuna scelta» da «spento». Una sessione senza
 * `reasoning` non manda niente e decide il fornitore (`null`: la pillola dice «Auto»); `none` è «off», come sopra.
 */
export function livelloSceltoR4(reasoning: unknown): string | null {
    const effort = reasoning && typeof reasoning === 'object' ? (reasoning as { effort?: unknown }).effort : null
    if (typeof effort !== 'string' || !effort) return null
    return effort === 'none' ? 'off' : effort
}

const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)

/** I codici del motore dell'app che r4 manda durante il giro, con la frase che il desktop gli dà (`components/errori.js` @ 0f3f90f8e). */
const FRASI_DEL_MOTORE_OSPITE: Record<string, string> = {
    LOCAL_ENGINE_BUSY: 'kernel.motoreOspiteOccupato',
    LOCAL_RUNTIME_NOT_READY: 'kernel.motoreOspiteNonAperto',
    LOCAL_MODEL_CHANGED: 'kernel.motoreOspiteCambiato',
    // D-0146-1, lato r4 (`3b5009de6`): il socket del motore dell'app che non risponde non è più «nessun modello aperto»
    LOCAL_GUEST_UNREACHABLE: 'kernel.motoreOspiteNonRisponde',
}

/** I testi `kernel.*` del desktop nella lingua dell'app. */
const testiDelKernel = (lingua: string) => (italiano(lingua) ? erroriKernel.it : erroriKernel.en) as Record<string, string>

/**
 * I parametri delle voci coi numeri, come `parametri` del desktop (`components/errori.js:955-959` @ 5bccc25a8): il resto della voce
 * (chiave, espressione, ordine) viene dalla tabella estratta, non da qui. MOD-20 vuole gli stessi nomi del desktop.
 */
const PARAMETRI_DEL_KERNEL: Readonly<Record<string, (m: RegExpExecArray, lingua: string) => Record<string, string>>> = {
    'errori.kernel.inattivoPerSecondi': (m) => ({ secondi: m[1] }),
    'errori.kernel.nessunaRispostaEntro': (m) => ({ secondi: m[1] }),
    'errori.kernel.rispostaHttp': (m) => ({ stato: m[1] }),
    'errori.kernel.nonRispondeStato': (m, lingua) => ({
        stato: /^(?:unknown|sconosciuto)$/u.test(m[1]) ? testiDelKernel(lingua)['kernel.statoSconosciuto'] : m[1], dettaglio: m[2],
    }),
    'errori.kernel.finestraLocale': (m, lingua) => {
        const quanti = (n: string | undefined) => (n ? testiDelKernel(lingua)['kernel.quantiToken'].replace('{n}', n) : '')
        return { conversazione: quanti(m[1]), finestra: quanti(m[2]) }
    },
}

/**
 * ⛔ D-0147-ERR-2 (Pad, 27/10/2026; Desktop: «una tabella sola»): K3 scrive i messaggi del kernel in INGLESE e il desktop li dice nella
 * lingua dell'interfaccia con `MESSAGGI_DEL_KERNEL` (`components/errori.js:908-959`). La tabella del telefono È quella: chiavi,
 * espressioni e ordine estratti dallo stesso commit (`testi-server-r4.mjs --area errori-kernel`, `testi/errori-kernel-r4.json`);
 * qui solo i parametri. Prima erano due voci copiate a mano, e «Credit not available at the provider.» restava in inglese.
 */
export const MESSAGGI_DEL_KERNEL_R4: ReadonlyArray<{ chiave: string; re: RegExp; parametri?: (m: RegExpExecArray, lingua: string) => Record<string, string> }> =
    erroriKernel.regole.map((r) => ({ chiave: r.chiave, re: new RegExp(r.sorgente, r.flag), parametri: PARAMETRI_DEL_KERNEL[r.chiave] }))

/** Il messaggio del kernel nella lingua dell'app (`messaggioDelKernelNellaLingua` del desktop), o `null` se non è uno di quelli noti. */
function messaggioDelKernelNellaLingua(messaggio: string, lingua: string): string | null {
    const testo = String(messaggio ?? '').trim()
    for (const voce of MESSAGGI_DEL_KERNEL_R4) {
        const m = voce.re.exec(testo)
        if (!m) continue
        const frase = testiDelKernel(lingua)[voce.chiave.replace(/^errori\./u, '')]
        if (typeof frase !== 'string') return null
        const valori = voce.parametri ? voce.parametri(m, lingua) : {}
        return frase.replace(/\{(\w+)\}/gu, (tutto, k: string) => (typeof valori[k] === 'string' ? valori[k] : tutto))
    }
    return null
}

/**
 * Il motivo di un rifiuto legato al modello, come lo dice il desktop (`testoErroreServer` e `fraseChiaveMancante`, `legacy/app.js:3244`
 * @ 2161afb32): la chiave che manca ha la sua frase col nome del fornitore (`errori.CONFIG_INVALID.<motivo>`), gli altri codici la
 * loro `<CODICE>.message`. Un codice che il dizionario non porta resta con le parole di r4, mai una chiave grezza.
 * Dal pin 701c6c0d2 il desktop dice la chiave che manca con `fraseDelMotivo` (#44): sulla busta vera la frase è la stessa (MOT-R4-03).
 */
export function messaggioErroreModelloR4(errore: { code: string; message: string; reason?: string; params?: Record<string, unknown>; explanation?: string }, lingua: string): string {
    // ⛔ CHATGPT NEL CODICE: accanto, i codici del piano che r4 manda (`testi/errori-chatgpt-r4.json`)
    // ⛔ CODICE COL MOTORE LOCALE: e quelli della fonte `locale-ospite` e del motore dell'app (`testi/errori-locale-r4.json`)
    // ⛔ le frasi del kernel sul motore locale (Pad 22/10/2026, in inglese con l'app in italiano): le regole del desktop
    const delKernel = messaggioDelKernelNellaLingua(errore.message, lingua)
    if (delKernel) return delKernel
    // ⛔ dal Pad, 27/10/2026: «Internal error» in inglese con l'app in italiano. I generici per ultimi: le tabelle sopra vincono
    const tabelle = (italiano(lingua)
        ? [erroriModello.it, erroriChatgpt.it, erroriLocale.it, erroriDelPc.it, erroriSessioni.it, erroriGenerici.it]
        : [erroriModello.en, erroriChatgpt.en, erroriLocale.en, erroriDelPc.en, erroriSessioni.en, erroriGenerici.en]) as Record<string, string>[]
    const dalDizionario = (chiave: string) => tabelle.find((t) => Object.hasOwn(t, chiave))?.[chiave]
    // la chiave che manca (la frase col nome del fornitore) e i rifiuti del motore locale hanno la loro frase fissa, come il desktop
    const motivo = errore.code === 'CONFIG_INVALID' && (errore.reason === 'provider-key-missing' || errore.reason === 'provider-key-missing-named')
        ? dalDizionario(`CONFIG_INVALID.${errore.reason.replace(/-/gu, '_')}`)
        : Object.hasOwn(FRASI_DEL_MOTORE_OSPITE, errore.code) ? dalDizionario(FRASI_DEL_MOTORE_OSPITE[errore.code]) : undefined
    if (motivo) return motivo.replace(/\{(\w+)\}/gu, (tutto, k: string) => (errore.params && typeof errore.params[k] === 'string' ? String(errore.params[k]) : tutto))
    // ⛔ FRASI-UNICHE (censimento G, punto b; Desktop 27/10/2026): il resto con la regola del desktop, la stessa dei fogli e degli avvisi,
    // nell'ordine di `messaggioErroreUtente` (`legacy/app.js:3491` @ 79ea996de): prima la frase del motivo (la `explanation` precisa)
    return fraseDelMotivoR4(errore, lingua) || fraseErroreR4(errore, lingua) || errore.message
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
    // il piano ChatGPT non ha una chiave: il suo accesso passa da `spingiAccessoChatgptR4`; il motore dell'app da `spingiAccessoLocaleR4`
    if (!FORNITORI_DEL_CODICE_R4.has(fornitore as TalosMobileProviderId) || fornitore === 'chatgpt' || fornitore === 'local') return
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
 * Quanto deve valere ancora il token del piano quando lo si spinge a r4: r4 rifiuta un giro con un token che scade entro 5 minuti, e
 * non ha un canale per chiederne uno nuovo a metà giro (contratto col Desktop, 18/10/2026). Hermes rinnova 120 s prima
 * (`hermes_cli/auth_constants.py:93`), ma lì il rinnovo avviene durante la chiamata.
 */
export const MINIMO_ACCESSO_CHATGPT_R4_MS = 10 * 60 * 1000

/**
 * ⛔ CHATGPT NEL CODICE: l'accesso del piano dato a r4 (`POST /api/v1/providers/chatgpt/access {accessToken, scadeAlle}`), oppure
 * tolto (`…/access/remove`) quando la chat non è collegata. NIENT'ALTRO nel corpo: r4 rifiuta ogni altro campo, email compresa.
 * Un rifiuto porta il codice e le parole di r4, mai il token (Codex `external_auth.rs`: «it may contain a token»).
 */
export async function spingiAccessoChatgptR4(cliente: Pick<TalosR4ClientePonte, 'richiesta'>, accesso: { accessToken: string; scadeAlle: number } | null): Promise<void> {
    const r = accesso
        ? await cliente.richiesta({ metodo: 'POST', percorso: '/api/v1/providers/chatgpt/access', corpo: JSON.stringify({ accessToken: accesso.accessToken, scadeAlle: accesso.scadeAlle }) })
        : await cliente.richiesta({ metodo: 'POST', percorso: '/api/v1/providers/chatgpt/access/remove', corpo: '{}' })
    if (r.stato < 200 || r.stato >= 300) throw rifiuto(r.stato, r.corpo)
}

export interface AccessoLocaleR4 {
    socketPath: string
    chiave: string
    modello: string
    nCtx: number
    capacita?: { tools?: boolean; reasoning?: boolean }
}

/**
 * ⛔ CODICE COL MOTORE LOCALE: il motore dell'app dato a r4 (`POST /api/v1/providers/locale-ospite/access`), oppure tolto
 * (`…/access/remove`) quando nell'app non c'è un modello che il Codice può usare. Solo i campi del contratto: r4 dà 400 a ogni altro.
 * Un rifiuto porta il codice e le parole di r4, mai la chiave.
 */
export async function spingiAccessoLocaleR4(cliente: Pick<TalosR4ClientePonte, 'richiesta'>, accesso: AccessoLocaleR4 | null): Promise<void> {
    const corpo = accesso
        ? JSON.stringify({
            socketPath: accesso.socketPath, chiave: accesso.chiave, modello: accesso.modello, nCtx: accesso.nCtx,
            // solo le capacità dette: una che manca r4 la tiene per «non so» (`null`), mai per un «no»
            ...(accesso.capacita ? { capacita: Object.fromEntries(Object.entries(accesso.capacita).filter(([, v]) => typeof v === 'boolean')) } : {}),
        })
        : '{}'
    const percorso = `/api/v1/providers/${FONTE_LOCALE_OSPITE_R4}/access${accesso ? '' : '/remove'}`
    const r = await cliente.richiesta({ metodo: 'POST', percorso, corpo })
    if (r.stato < 200 || r.stato >= 300) throw rifiuto(r.stato, r.corpo)
}

/**
 * ⛔ CHATGPT NEL CODICE: uscendo dalla chat, r4 dimentica l'accesso del piano, ma solo se è GIÀ acceso (`acceso` non lo avvia): un
 * r4 spento non ha token, e al prossimo avvio il Codice lo chiede di nuovo al custode, che non è più collegato.
 */
export async function dimenticaAccessoChatgptR4(acceso: () => Promise<boolean>, cliente: () => Pick<TalosR4ClientePonte, 'richiesta'>): Promise<void> {
    if (await acceso()) await spingiAccessoChatgptR4(cliente(), null)
}

/**
 * K3 automazioni (ledger `LEDGER-K3-AUTOMAZIONI-FORNITORI-COORDINAZIONE-2026-10-17.md`): il nome di un modello per la persona, mai
 * l'id grezzo. Trascrizione di `nomeModelloUmano` (`chat-foot.js` @ 701c6c0d2): via il prefisso del fornitore (`deepseek:`), via la
 * tilde, l'ultima parte del percorso; un GGUF locale diventa «famiglia · parametri (attivi) · quantizzazione».
 */
export function nomeModelloUmanoR4(id: unknown, lingua = 'en'): string {
    if (typeof id !== 'string' || !id.trim()) return ''
    const grezzo = id.trim()
    if (!/^(?:local|locale-ospite):/i.test(grezzo)) {
        const senzaFonte = grezzo.replace(/^[a-z][a-z0-9-]*:(?=.)/u, '')
        return senzaFonte.replace(/^~/u, '').split('/').pop() ?? ''
    }
    const resto = grezzo.replace(/^(?:local|locale-ospite):/i, '').replace(/[-_.]gguf$/i, '')
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
