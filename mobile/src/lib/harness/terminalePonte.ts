import { Capacitor, registerPlugin } from '@capacitor/core'
import { getProviderKey } from '@/services/secureKeyStore'
import { getProviderEndpoint } from '@/services/providerEndpointStore'

/**
 * Il ponte fra il terminale sandboxato on-device (`TalosTerminalPlugin`,
 * ledger FASE-5-EXECUTION-PLANE) e la chiave del provider — owner 28/8,
 * "procedi in ordine" punto 1. La chiave non lascia mai questo processo se
 * non verso il plugin nativo: nessuna scrittura su disco, nessun log.
 *
 * ⛔⛔⛔ 10/9 — QUELLA FRASE ERA VERA DI NOI E FALSA DEL SISTEMA, ed è
 * costata all'owner una chiave ruotata. La chiave non veniva scritta né
 * loggata da nessuna riga di questo repo — e compariva lo stesso nel
 * logcat di una build di rilascio, a ogni avvio:
 *
 *     I adbd: adbd service requested 'shell,v2,raw:LD_LIBRARY_PATH=…
 *             OPENROUTER_API_KEY=sk-or-… node …'
 *
 * A stamparla era `adbd`, che registra OGNI comando che gli viene chiesto
 * di eseguire (AOSP `daemon/shell_service.cpp`, verificato alla fonte il
 * 2026-09-10). Il segreto non veniva loggato: veniva **consegnato come
 * riga di comando**, e la riga di comando è pubblica per costruzione.
 *
 * ⇒ Curato in `TalosPonteSegreti.kt` — l'ambiente qui sotto viaggia ora
 * sullo **stdin** del processo remoto, mai più come token `VAR=valore`.
 * L'interfaccia di questo file non cambia (`ambiente` resta una mappa);
 * cambia il canale, un livello più in basso. La catena intera, processo
 * per processo, è disegnata lì.
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
        /** ⛔ F4: «casa» quando il server acceso è quello dentro l'app (`TalosTerminalPlugin.kt`, ramo «Codice in casa»). */
        dove?: 'casa'
    }>
    // ⛔⛔ 70-A (30/09/2026): il segreto che il server del Codice scrive a ogni avvio (`TalosTerminalPlugin.leggiSegretoServer`).
    leggiSegretoServer(): Promise<{ ok: boolean, segreto: string | null, motivo: string | null }>
    /** «Codice in casa»: questo APK sa far girare il server del Codice dentro l'app, senza ponte? */
    codiceInCasa(): Promise<{ disponibile: boolean }>
    /** ⛔ F4 (14/10/2026): il nativo segue il giro del Codice e tiene acceso il servizio in primo piano finché lavora. */
    seguiGiroCodice(opzioni: { idSessione: string, titolo: string, testo: string }): Promise<{ custodito: boolean }>
    lasciaGiroCodice(opzioni: { idSessione: string }): Promise<{ ok: boolean }>
    /** K2-B/K3-B2: r4 accanto al Codice di oggi, solo nella build di sviluppo con l'archivio. Mai il token. */
    statoR4Sviluppo(): Promise<TalosStatoR4>
    avviaR4Sviluppo(): Promise<TalosStatoR4 & { motivo?: string }>
}

/** Lo stato di r4 nella build di sviluppo: se c'è, se è acceso, e la cartella di lavoro che conosce. */
export interface TalosStatoR4 {
    disponibile: boolean
    acceso: boolean
    porta: number
    cartella: string
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
export async function avviaServerHarnessConChiaveProvider(): Promise<Awaited<ReturnType<TalosTerminalePlugin['avviaServerHarness']>>> {
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

/**
 * ⛔⛔ 70-A (30/09/2026, contratto desktop 70) — il segreto del server del Codice, letto dal file che il server scrive
 * a ogni avvio (owner, 30/09 sera: «Lo crea il server»). Chi lo usa è `harnessUiSegreto.ts`; mai nei log.
 */
export function leggiSegretoServerDalPonte(): ReturnType<TalosTerminalePlugin['leggiSegretoServer']> {
    return plugin().leggiSegretoServer()
}

/**
 * «Codice in casa» (owner 13/10/2026: il Codice senza il ponte ADB). Vero quando il server del Codice può girare dentro
 * l'app: lì il ponte è un extra per il terminale, non una condizione. Sul web, o con un APK che non lo sa fare, è falso.
 */
export async function talosCodiceInCasa(): Promise<boolean> {
    if (!talosTerminaleDisponibile()) return false
    try {
        return (await plugin().codiceInCasa()).disponibile === true
    } catch {
        return false
    }
}

/**
 * ⛔ F4 (14/10/2026, owner «Notifica solo mentre lavora»): un giro del Codice in casa è cominciato. Il nativo
 * (`TalosCodiceCustode.kt`) chiede lo stato al server e tiene acceso il servizio finché la sessione lavora: in secondo piano
 * la WebView è congelata (misurato sul Pad) e da qui la fine non si vedrebbe. Mai un errore: senza custode il giro continua
 * com'era prima.
 */
export async function talosSeguiGiroCodice(idSessione: string, titolo: string, testo: string): Promise<boolean> {
    if (!talosTerminaleDisponibile()) return false
    try {
        return (await plugin().seguiGiroCodice({ idSessione, titolo, testo })).custodito === true
    } catch {
        return false
    }
}

/**
 * K3-B2: r4 acceso e pronto per il Codice su r4, oppure `null` (web, build senza r4, avvio fallito). Avvia se serve: lato nativo
 * è idempotente (`TalosR4Avvio.avvia`).
 */
export async function talosR4Pronto(): Promise<TalosStatoR4 | null> {
    if (!talosTerminaleDisponibile()) return null
    try {
        const stato = await plugin().statoR4Sviluppo()
        if (!stato.disponibile) return null
        if (stato.acceso) return stato
        const avviato = await plugin().avviaR4Sviluppo()
        return avviato.acceso && !avviato.motivo ? avviato : null
    } catch {
        return null
    }
}

/** K4-E: questo APK porta r4? Solo la domanda, senza accenderlo (`TalosR4Avvio.disponibile`: l'archivio negli asset). */
export async function talosR4Disponibile(): Promise<boolean> {
    if (!talosTerminaleDisponibile()) return false
    try {
        return (await plugin().statoR4Sviluppo()).disponibile === true
    } catch {
        return false
    }
}

/** CHATGPT NEL CODICE: r4 è già acceso? Solo la domanda, senza avviarlo (per l'uscita dalla chat). */
export async function talosR4Acceso(): Promise<boolean> {
    if (!talosTerminaleDisponibile()) return false
    try {
        return (await plugin().statoR4Sviluppo()).acceso === true
    } catch {
        return false
    }
}

/** ⛔ F4: la fine del giro vista dall'app davanti; se l'app è dietro la vede il nativo da solo. */
export async function talosLasciaGiroCodice(idSessione: string): Promise<void> {
    if (!talosTerminaleDisponibile()) return
    try {
        await plugin().lasciaGiroCodice({ idSessione })
    } catch {
        // Il nativo rilascia comunque al prossimo controllo dello stato.
    }
}
