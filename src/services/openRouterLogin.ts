/**
 * L'accesso a OpenRouter, dal tocco alla chiave nella cassaforte.
 *
 * I conti stanno in `@/lib/auth/openRouterOAuth` e si provano senza telefono;
 * qui c'è solo il montaggio dei tre pezzi che un telefono ce l'hanno davvero:
 * la porta di ritorno (nativa), il browser di sistema, e la cassaforte.
 *
 * ## L'ordine non è casuale
 *
 * La porta si apre PRIMA che il browser parta, e l'attesa comincia prima
 * ancora. Al contrario ci sarebbe una finestra — piccola, ma vera — in cui il
 * browser ha già rimandato la risposta e nessuno è in ascolto: l'accesso
 * fallirebbe una volta ogni tanto, in modo irriproducibile, che è il tipo di
 * difetto che costa una settimana.
 *
 * ## Perché il browser di SISTEMA
 *
 * Aprire l'accesso in una WebView nostra sarebbe più semplice e ci farebbe
 * leggere la risposta senza nessuna porta. Sarebbe anche una WebView nostra a
 * ricevere la password di OpenRouter di chi la digita. RFC 8252 lo vieta per
 * questo, e la ragione vale doppio per un'app che sarà pubblica e forkabile:
 * la password non deve passare da qui, e il modo di garantirlo è non essere
 * sulla sua strada.
 */
import { registerPlugin } from '@capacitor/core'
import { talosLogDeviceIssue } from '@/lib/talosDeviceLog'
import { openTalosLinkOnce } from '@/services/inAppBrowserService'
import {
    talosCreatePkcePair,
    talosExchangeOpenRouterCode,
    talosOpenRouterAuthUrl,
    talosOpenRouterCallbackUrl,
    talosReadOpenRouterCode,
} from '@/lib/auth/openRouterOAuth'

export interface TalosOAuthLoopbackPlugin {
    open(): Promise<{ port: number }>
    awaitCallback(): Promise<{ target: string }>
    /** Il codice arrivato mentre di qua non c'era piu' nessuno ad aspettarlo. */
    pendingCallback(): Promise<{ target: string }>
    close(): Promise<void>
}

/**
 * ⛔⛔ IL VERIFICATORE DEVE SOPRAVVIVERE ALL'APP RICREATA.
 *
 * MISURATO sul Pad il 2026-08-10, tre volte di fila: si tocca «Accedi con
 * OpenRouter», si autorizza, la pagina locale scrive «Fatto, torna a TALOS» —
 * e tornando non succede NIENTE. Nessuna chiave, nessun errore, nessuna riga in
 * logcat: lo scambio non partiva proprio.
 *
 * La causa e' che tutto il flusso viveva dentro una sola chiamata JavaScript:
 * il verificatore era una variabile locale, e l'attesa del codice una promessa
 * tenuta viva. Android ricrea l'attivita' mentre il browser di sistema sta
 * davanti, la WebView riparte da zero, e quella variabile e quella promessa
 * spariscono insieme. Il codice arrivava a una casa vuota.
 *
 * ⇒ Il verificatore si scrive PRIMA di aprire il browser, e al ritorno si
 * ritira il codice dal nativo.
 */
const CHIAVE_ATTESA = 'talos.openrouter.pkce'

async function ricordaVerificatore(verifier: string): Promise<void> {
    const { Preferences } = await import('@capacitor/preferences')
    await Preferences.set({ key: CHIAVE_ATTESA, value: verifier })
}

async function verificatoreRicordato(): Promise<string | null> {
    const { Preferences } = await import('@capacitor/preferences')
    return (await Preferences.get({ key: CHIAVE_ATTESA })).value
}

async function dimenticaVerificatore(): Promise<void> {
    const { Preferences } = await import('@capacitor/preferences')
    await Preferences.remove({ key: CHIAVE_ATTESA })
}

/**
 * ⭐ Riprende un accesso interrotto dalla ricreazione dell'app.
 *
 * Si chiama quando il pannello dei provider torna a schermo: se c'e' un codice
 * conservato dal nativo e un verificatore ricordato, l'accesso si chiude adesso
 * — senza far ricominciare da capo, e senza bruciare un secondo codice.
 *
 * ⛔ Torna `null` quando non c'e' niente da riprendere: e' il caso NORMALE, e
 * non deve diventare un errore rosso su una schermata che nessuno ha chiesto.
 */
export async function talosRiprendiAccessoOpenRouter(
    deps: TalosOpenRouterLoginDeps = defaultDeps(),
): Promise<TalosOpenRouterLoginResult | null> {
    let target = ''
    try {
        target = (await deps.loopback.pendingCallback()).target
    } catch {
        return null
    }
    if (!target) return null
    const verifier = await verificatoreRicordato()
    if (!verifier) return null
    await dimenticaVerificatore()
    let code: string | null = null
    try {
        code = talosReadOpenRouterCode(target)
    } catch {
        return { ok: false, reason: 'cancelled' }
    }
    if (code === null) return { ok: false, reason: 'cancelled' }
    await dimenticaVerificatore().catch(() => {})
    try {
        return { ok: true, key: await deps.exchange({ code, verifier }) }
    } catch (errore) {
        talosLogDeviceIssue('TALOS_OPENROUTER_EXCHANGE', String(errore))
        return { ok: false, reason: 'exchange' }
    }
}

export interface TalosOpenRouterLoginDeps {
    loopback: TalosOAuthLoopbackPlugin
    openBrowser: (url: string) => Promise<boolean>
    exchange: (input: { code: string; verifier: string }) => Promise<string>
}

function defaultDeps(): TalosOpenRouterLoginDeps {
    return {
        loopback: registerPlugin<TalosOAuthLoopbackPlugin>('TalosOAuthLoopback'),
        openBrowser: (url) => openTalosLinkOnce(url, 'system_browser'),
        exchange: talosExchangeOpenRouterCode,
    }
}

/**
 * La chiave torna a chi ha chiamato, e NON viene salvata qui.
 *
 * OpenRouter chiude lo scambio con una chiave API identica a quella che si
 * sarebbe incollata a mano: farla passare per la stessa porta — quella del
 * pannello dei provider — significa che l'elenco dei modelli si aggiorna, lo
 * stato «chiave salvata» compare e l'errore si mostra dove si mostrano tutti
 * gli altri. Salvarla di nascosto da qui vorrebbe dire riscrivere quella
 * catena una seconda volta, peggio.
 */
export type TalosOpenRouterLoginResult =
    | { ok: true; key: string }
    | { ok: false; reason: 'port' | 'browser' | 'cancelled' | 'exchange' }

export async function talosLoginWithOpenRouter(
    deps: TalosOpenRouterLoginDeps = defaultDeps(),
): Promise<TalosOpenRouterLoginResult> {
    const { verifier, challenge } = await talosCreatePkcePair()

    let port: number
    try {
        port = (await deps.loopback.open()).port
    } catch {
        return { ok: false, reason: 'port' }
    }

    // L'attesa parte adesso, non dopo: il browser non deve poter rispondere a
    // una porta che nessuno sta ascoltando.
    const risposta = deps.loopback.awaitCallback()
    // Nessuno la aspetta finché il browser non è partito, e una promessa
    // rifiutata senza ascoltatori è un avviso nella console di chi svilupperà
    // domani. Le si dà un ascoltatore subito; il rifiuto vero si legge sotto.
    risposta.catch(() => {})

    // ⛔ PRIMA di aprire il browser: da qui in poi l'app puo' essere ricreata
    // in qualunque momento, e questa e' l'unica cosa che non si puo' ricostruire.
    await ricordaVerificatore(verifier).catch(() => {})

    const aperto = await deps.openBrowser(talosOpenRouterAuthUrl({
        callbackUrl: talosOpenRouterCallbackUrl(port),
        challenge,
    }))
    if (!aperto) {
        await deps.loopback.close().catch(() => {})
        return { ok: false, reason: 'browser' }
    }

    let code: string | null
    try {
        code = talosReadOpenRouterCode((await risposta).target)
    } catch {
        return { ok: false, reason: 'cancelled' }
    }
    // Un ritorno senza codice è un rifiuto: chi ha detto di no, o ha chiuso la
    // pagina. Non è un guasto e non merita un errore rosso.
    if (code === null) return { ok: false, reason: 'cancelled' }

    try {
        return { ok: true, key: await deps.exchange({ code, verifier }) }
    } catch (errore) {
        // ⛔ Il motivo va ALMENO in logcat: senza, l'unica diagnosi possibile e'
        // riprovare e sperare — che e' esattamente cio' che abbiamo dovuto fare
        // il 2026-08-10, bruciando un codice a ogni tentativo.
        talosLogDeviceIssue('TALOS_OPENROUTER_EXCHANGE', String(errore))
        return { ok: false, reason: 'exchange' }
    }
}

/** Chiude una porta rimasta aperta: l'accesso è stato abbandonato. */
export async function talosCancelOpenRouterLogin(
    loopback: TalosOAuthLoopbackPlugin = registerPlugin<TalosOAuthLoopbackPlugin>('TalosOAuthLoopback'),
): Promise<void> {
    await loopback.close().catch(() => {})
}
