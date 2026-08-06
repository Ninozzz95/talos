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
    close(): Promise<void>
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
    } catch {
        return { ok: false, reason: 'exchange' }
    }
}

/** Chiude una porta rimasta aperta: l'accesso è stato abbandonato. */
export async function talosCancelOpenRouterLogin(
    loopback: TalosOAuthLoopbackPlugin = registerPlugin<TalosOAuthLoopbackPlugin>('TalosOAuthLoopback'),
): Promise<void> {
    await loopback.close().catch(() => {})
}
