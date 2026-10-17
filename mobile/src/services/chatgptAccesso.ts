/**
 * N15 — «Continue with ChatGPT» sul telefono: il servizio VERO, con i suoi pezzi di piattaforma.
 *
 *   · ascolto: il plugin `TalosOAuthLoopback` (127.0.0.1, porta effimera), lo stesso del login OpenRouter;
 *   · scheda: `openTalosLinkOnce(…, 'system_browser')`, cioè la Custom Tab misurata sul Pad l'11/10;
 *   · rete: il trasporto nativo dell'app (`CapacitorHttp`), perché dalla WebView (`https://localhost`) le pagine di
 *     `auth.openai.com` non sono chiamabili con `fetch` per via del CORS; il trasporto nativo non segue i reindirizzamenti.
 *
 * ⛔ Caricato a richiesta (dal pannello dei fornitori): niente di tutto questo entra nel pacchetto d'avvio.
 */
import { registerPlugin } from '@capacitor/core'
import { talosT } from '@/i18n'
import { type TalosMobileHttpTransport, talosMobileHttpTransport } from '@/lib/chat/httpTransport'
import { openTalosLinkOnce } from '@/services/inAppBrowserService'
import { type TalosRunKeeper, createTalosRunKeeper } from '@/services/longRunKeeper'
import { type TalosChatgptAscolto, creaCustodiaChatgpt, creaSessioneChatgpt } from '@/services/chatgptCustodia'
import { riprendiAccessoRimasto, tieniIlSegnoDellAccesso } from '@/services/chatgptRipresa'

/** Un `fetch` quanto basta per i conti dell'accesso (GET e POST con corpo di testo), sopra il trasporto nativo. */
export function talosFetchSenzaCors(trasporto: TalosMobileHttpTransport = talosMobileHttpTransport): typeof fetch {
    return (async (indirizzo: RequestInfo | URL, opzioni: RequestInit = {}): Promise<Response> => {
        const metodo = String(opzioni.method ?? 'GET').toUpperCase()
        if (metodo !== 'GET' && metodo !== 'POST') throw new TypeError(`Unsupported method ${metodo}`)
        const intestazioni = Object.fromEntries(new Headers(opzioni.headers ?? {}))
        const risposta = await trasporto.request({
            method: metodo, url: String(indirizzo), headers: intestazioni,
            ...(typeof opzioni.body === 'string' ? { data: opzioni.body } : {}),
            connectTimeout: 15_000, readTimeout: 30_000,
        })
        const corpo = typeof risposta.data === 'string' ? risposta.data : JSON.stringify(risposta.data ?? null)
        // 204/304 non ammettono un corpo nel costruttore di `Response`
        const senzaCorpo = risposta.status === 204 || risposta.status === 304
        return new Response(senzaCorpo ? null : corpo, { status: risposta.status, headers: risposta.headers ?? {} })
    }) as typeof fetch
}

/**
 * Il servizio in primo piano durante l'attesa: lo stesso `TalosRunService` dei giri lunghi, col testo del mockup approvato
 * («TALOS sta aspettando l'accesso a ChatGPT»). `engage` lo accende subito: la persona sta per lasciare l'app per la scheda.
 */
function custodeDellAttesa(): { inizia(): void, finisci(): void } {
    let custode: TalosRunKeeper | null = null
    return {
        inizia() {
            custode?.release()
            custode = createTalosRunKeeper('TALOS')
            custode.engage(talosT('chatgptPlan.waitingNotification'))
        },
        finisci() { custode?.release(); custode = null },
    }
}

let istanza: ReturnType<typeof creaSessioneChatgpt> | null = null

/** L'unica istanza: il rinnovo «uno alla volta» e «un solo accesso vivo» valgono solo se tutti passano da qui. */
export function talosChatgpt(): ReturnType<typeof creaSessioneChatgpt> {
    if (!istanza) {
        istanza = creaSessioneChatgpt({
            custodia: creaCustodiaChatgpt(),
            fetchFn: talosFetchSenzaCors(),
            loopback: registerPlugin<TalosChatgptAscolto>('TalosOAuthLoopback'),
            apriBrowser: (indirizzo) => openTalosLinkOnce(indirizzo, 'system_browser'),
            custode: custodeDellAttesa(),
        })
        // Il segno «c'è un accesso aperto», per riprenderlo all'avvio se Android ricrea l'app (`chatgptRipresa.ts`).
        tieniIlSegnoDellAccesso(istanza, globalThis.localStorage)
    }
    return istanza
}

/**
 * All'avvio dell'app, SOLO se il segno dice che un accesso era aperto (lo controlla chi chiama, prima di caricare questo
 * modulo): lo riprende, e dice com'è finita. `quandoCollegato` fa rileggere alla chat le chiavi e i modelli del piano.
 */
export function talosRiprendiAccessoChatgptRimasto(quandoCollegato: () => Promise<void>, avvisa: (messaggio: string) => void): Promise<unknown> {
    return riprendiAccessoRimasto({
        servizio: talosChatgpt(),
        deposito: globalThis.localStorage,
        quandoCollegato,
        avvisa: (che, codice) => avvisa(che === 'collegato' ? talosT('chatgptPlan.resumedConnected') : talosT('chatgptPlan.resumeFailed', { code: codice ?? '' })),
    })
}
