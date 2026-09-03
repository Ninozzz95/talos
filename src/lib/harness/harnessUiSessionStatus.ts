import { talosHarnessUiApiBase } from '@/lib/harness/harnessUiApiBase'

/**
 * ⭐⭐⭐ 2/9 — piano §16.1 (owner: "stato vivo nella lista sessioni, come
 * Claude Code"). Il server on-device (`session-registry.mjs`, `elenca()`)
 * espone già `conclusa`/`interrotta`/`ultimoMessaggio` per riga — questo
 * modulo li porta al native `HarnessScreen.vue`, che vive FUORI dal
 * WebView shadow-DOM e non ha mai avuto un motivo per parlare col server
 * finché non si apre una sessione specifica.
 *
 * ⛔ Best-effort per costruzione, mai un requisito: il server si avvia solo
 * quando una schermata Codice specifica lo stagia (`avviaServerHarness()`,
 * `HarnessSessionScreen.vue`) — chi guarda SOLO la lista, senza aver mai
 * aperto una sessione in questo avvio dell'app, lo trova spento. Un errore
 * qui non deve mai bloccare né sporcare la lista nativa: fallisce chiuso,
 * una Map vuota, la riga mostra quello che mostra oggi.
 */
/**
 * ⭐⭐⭐ 2/9 — `inAttesaApprovazione`/`ultimoEsito` aggiunti, owner:
 * "esattamente come fa desktop... metti anche lo stato". Stessa forma
 * del desktop (`statoSessione()`, harness-ui/public/app.js): un
 * esito 'errore'/'successo' esiste solo dopo il primo giro concluso
 * (`null` altrimenti — mai un successo presunto per una sessione
 * ancora senza un solo turno finito).
 */
export interface TalosHarnessSessionStatus {
    conclusa: boolean
    interrotta: boolean
    ultimoMessaggio: string | null
    inAttesaApprovazione: boolean
    ultimoEsito: 'errore' | 'successo' | null
}

interface TalosHarnessSessionsEnvelope {
    ok?: boolean
    data?: {
        items?: Array<{
            sessionId?: unknown
            conclusa?: unknown
            interrotta?: unknown
            ultimoMessaggio?: unknown
            inAttesaApprovazione?: unknown
            ultimoEsito?: unknown
        }>
    }
}

/**
 * Corto apposta: questa è una rifinitura dello schermo, non un'attesa che
 * la persona deve notare. Un server che non risponde entro questa finestra
 * si comporta come uno spento — la lista resta quella di oggi, non un
 * caricamento a vista.
 */
const TALOS_HARNESS_STATUS_TIMEOUT_MS = 2500

export async function fetchTalosHarnessSessionsStatus(): Promise<Map<string, TalosHarnessSessionStatus>> {
    const risultato = new Map<string, TalosHarnessSessionStatus>()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TALOS_HARNESS_STATUS_TIMEOUT_MS)
    try {
        const response = await fetch(`${talosHarnessUiApiBase()}/api/v1/sessions`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            signal: controller.signal,
        })
        if (!response.ok) return risultato
        const envelope = await response.json() as TalosHarnessSessionsEnvelope
        if (!envelope?.ok || !Array.isArray(envelope.data?.items)) return risultato
        for (const item of envelope.data.items) {
            if (typeof item.sessionId !== 'string' || !item.sessionId) continue
            risultato.set(item.sessionId, {
                conclusa: item.conclusa === true,
                interrotta: item.interrotta === true,
                ultimoMessaggio: typeof item.ultimoMessaggio === 'string' ? item.ultimoMessaggio : null,
                inAttesaApprovazione: item.inAttesaApprovazione === true,
                ultimoEsito: item.ultimoEsito === 'errore' || item.ultimoEsito === 'successo' ? item.ultimoEsito : null,
            })
        }
        return risultato
    } catch {
        // Server spento, rete assente, risposta malformata: la lista nativa resta quella di oggi — mai un errore che la persona deve leggere per una rifinitura.
        return risultato
    } finally {
        clearTimeout(timer)
    }
}
