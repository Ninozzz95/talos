import { Capacitor, registerPlugin } from '@capacitor/core'
import { getProviderKey } from '@/services/secureKeyStore'
import { getProviderEndpoint } from '@/services/providerEndpointStore'

/**
 * Il ponte fra il terminale sandboxato on-device (`TalosTerminalPlugin`,
 * ledger FASE-5-EXECUTION-PLANE) e la chiave del provider — owner 28/8,
 * "procedi in ordine" punto 1. La chiave non lascia mai questo processo se
 * non verso il plugin nativo: nessuna scrittura su disco, nessun log.
 *
 * ⛔ Il plugin nativo `TalosTerminal` esiste SOLO in una build di debug
 * (stesso meccanismo di `talosHarnessUiAvailable()` — la classe Kotlin non
 * compila affatto in release). `talosTerminaleDisponibile()` è la stessa
 * domanda fatta allo stesso modo, non una nuova convenzione — e
 * `registerPlugin()` (non un cast su `Capacitor.Plugins`, che non esiste
 * nei tipi di `@capacitor/core`) è lo stesso schema già usato da
 * `talosNativeSpeechSynth()` in `services/speech.ts` per un plugin
 * altrettanto opzionale.
 */
export function talosTerminaleDisponibile(): boolean {
    return Capacitor.isPluginAvailable('TalosTerminal')
}

interface TalosTerminalePlugin {
    sonda(): Promise<{ ok: boolean, identita: unknown, node: unknown }>
    eseguiComando(opzioni: { comando: string, ambiente?: Record<string, string> }): Promise<{
        ok: boolean
        stdout: string
        stderr: string
        exitCode: number
        motivo: string | null
    }>
    avviaServerHarness(opzioni: { ambiente?: Record<string, string> }): Promise<{
        ok: boolean
        giaAttivo: boolean
        stdout: string
        stderr: string
        exitCode: number
        motivo: string | null
    }>
}

let pluginCache: TalosTerminalePlugin | null = null
function plugin(): TalosTerminalePlugin {
    if (!pluginCache) pluginCache = registerPlugin<TalosTerminalePlugin>('TalosTerminal')
    return pluginCache
}

/**
 * Esegue un comando sul terminale on-device con la chiave del provider già
 * iniettata come `OPENROUTER_API_KEY` — stesso nome di env var che
 * `harness-ui/src/config.mjs` legge sul desktop (`env.OPENROUTER_API_KEY`),
 * per costruzione: una sola chiave, mai una copia che potrebbe disallinearsi
 * (stesso principio già seguito da `config.mjs` verso lo script di prova
 * del banco interno).
 *
 * ⛔ Se la chiave non è configurata, il comando parte comunque SENZA
 * `OPENROUTER_API_KEY` — non è compito di questo ponte decidere se quel
 * comando ne ha bisogno (un `GET /api/v1/health` non la usa affatto). Chi
 * chiama e sa di aver bisogno del modello legge `esito.motivo`/`stderr`
 * per accorgersi che la chiave mancava.
 */
export async function eseguiComandoConChiaveProvider(
    comando: string,
    provider: string = 'openrouter',
): Promise<ReturnType<TalosTerminalePlugin['eseguiComando']>> {
    const chiave = await getProviderKey(provider)
    const ambiente: Record<string, string> = {}
    if (chiave) ambiente.OPENROUTER_API_KEY = chiave
    return plugin().eseguiComando({ comando, ambiente })
}

/**
 * ⭐⭐⭐ 03/9 — le CINQUE credenziali di rete già salvate per la chat
 * (`secureKeyStore.ts`/`providerEndpointStore.ts`, `providerRegistry.ts`),
 * riusate qui — non riderivate. Owner, dopo un primo tentativo di
 * ricopiare il desktop: «guarda come fa la chat, per evitare di duplicare
 * codice». Nomi di env var concordati con la lane desktop (stesso schema
 * di `OPENROUTER_API_KEY`), letti da `harness-ui/src/config.mjs` →
 * `model-destination.mjs`. `local` resta escluso qui: il motore locale non
 * ha una chiave né un indirizzo (`localAdapter.ts`), e non è ancora
 * raggiungibile dalle sessioni Codice — owner, 3/9: "colleghiamo i 5, poi
 * pensiamo ai locali".
 */
const PROVIDER_DI_RETE = Object.freeze(['openrouter', 'openai', 'deepseek', 'anthropic', 'gemini'] as const)
const NOME_VAR_PER_PROVIDER: Record<typeof PROVIDER_DI_RETE[number], string> = Object.freeze({
    openrouter: 'OPENROUTER_API_KEY',
    openai: 'OPENAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    gemini: 'GEMINI_API_KEY',
})

/**
 * Fa partire il server `harness-ui` sul telefono stesso — 28/8, "procedi
 * in ordine" punto 2. Idempotente lato nativo (`TalosTerminalPlugin.
 * avviaServerHarness`, ledger FASE-5-EXECUTION-PLANE): chiamarla quando il
 * server è già vivo torna `giaAttivo:true` senza ripetere staging/push.
 *
 * ⛔ Stessa scelta di `eseguiComandoConChiaveProvider`: senza NESSUNA
 * credenziale configurata il server parte comunque (serve anche in sola
 * lettura — elenco task, stato campagne — senza un provider), semplicemente
 * ogni sessione che prova a chiamare un modello che ne ha bisogno vedrà
 * l'errore onesto del provider mancante (`CONFIG_INVALID`/
 * `PROVIDER_KEY_MISSING`), non un fallimento muto.
 */
export async function avviaServerHarnessConChiaveProvider(): Promise<ReturnType<TalosTerminalePlugin['avviaServerHarness']>> {
    const ambiente: Record<string, string> = {}
    /*
     * ⛔ TUTTE e sei le letture in parallelo, non in sequenza: cinque dal
     * portachiavi più l'indirizzo Ollama (providerEndpointStore.ts, nessun
     * account, nessuna chiave — solo l'indirizzo che l'owner ha
     * configurato). Farle una dopo l'altra sommerebbe la latenza di
     * ognuna prima che il server possa partire — trovato in revisione:
     * la prima stesura paralellizzava le cinque chiavi ma poi leggeva
     * l'indirizzo Ollama DOPO, in sequenza, vanificando in parte lo scopo
     * dichiarato di questo commento.
     */
    const [chiavi, indirizzoOllama] = await Promise.all([
        Promise.all(PROVIDER_DI_RETE.map((provider) => getProviderKey(provider))),
        getProviderEndpoint('ollama'),
    ])
    PROVIDER_DI_RETE.forEach((provider, indice) => {
        const chiave = chiavi[indice]
        if (chiave) ambiente[NOME_VAR_PER_PROVIDER[provider]] = chiave
    })
    if (indirizzoOllama) ambiente.OLLAMA_ENDPOINT = indirizzoOllama
    return plugin().avviaServerHarness({ ambiente })
}
