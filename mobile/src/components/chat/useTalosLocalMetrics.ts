import { computed, ref } from 'vue'
import {
    type TalosLocalGenerationMetrics,
    talosRitiraMisuraLocale,
} from '@/lib/chat/providers/localTrace'

/**
 * ⭐⭐⭐ FASE 2 — chi lega le misure di UNA generazione locale al messaggio
 * che si è appena visto comparire.
 *
 * ## Perché serve un legame invece di un campo
 *
 * Le misure non possono viaggiare dentro `message.metadata`: quella busta la
 * costruisce `chatController`, campo per campo, e attraversa `chatCompletion`
 * che ricopia a mano ogni chiave. È esattamente la strada dove in questo
 * progetto un valore è già morto in silenzio («il valore che muore all'ultimo
 * ponte»), e nessuno dei due file è di questa lane. ⇒ L'adattatore locale
 * mette le misure in una coda cortissima (`localTrace.ts`), e qui si ritirano
 * quando la risposta compare a schermo.
 *
 * ## La regola del legame, e perché è questa
 *
 * Una misura appartiene al PRIMO messaggio dell'assistente che compare dopo di
 * lei. Non è un'ipotesi sui tempi: l'adattatore registra a generazione
 * consegnata, e il negozio scrive il messaggio subito dopo — l'ordine è
 * garantito dalla catena, non indovinato da un orologio.
 *
 * ⛔ E si RITIRA sempre, anche quando la coda è vuota: un messaggio
 * dell'assistente consuma il turno che l'ha prodotto. Senza questo, una
 * misura rimasta indietro (generazione interrotta, risposta mai scritta) si
 * appiccicherebbe alla risposta DOPO — che magari è di un fornitore a chiave,
 * e vedrebbe a schermo la velocità di un motore che non ha usato.
 *
 * ## Ciò che questo NON fa, detto
 *
 * ~~Non sopravvive alla chiusura dell'app~~ — ⛔ N13-TPS-01 (Pad, 11/10/2026): dopo il ricaricamento la riga spariva, e
 * l'owner il 12/10 ha chiesto di curarlo. La catena dei metadati resta intoccata (vedi sopra): il legame si salva a
 * parte, in `localStorage`, per id del messaggio, con un TETTO (cadono le misure più vecchie). Sono solo tempi del
 * motore, niente testo della chat. Ciò che si rilegge si controlla campo per campo: un dato rotto non diventa una riga
 * di zeri, diventa nessuna riga — la stessa regola di sempre.
 */
const CHIAVE_SALVATAGGIO = 'talos.misure-locali.v1'
const MASSIMO_SALVATE = 300

const numeroONull = (valore: unknown): boolean => valore === null || (typeof valore === 'number' && Number.isFinite(valore))

function misuraValida(valore: unknown): valore is TalosLocalGenerationMetrics {
    if (!valore || typeof valore !== 'object') return false
    const m = valore as Record<string, unknown>
    return typeof m.traceId === 'string' && typeof m.finishedAt === 'number'
        && ['firstVisibleMs', 'tokensPerSecond', 'msPerToken', 'producedTokens', 'promptTokens', 'prefillMs', 'engineFirstTokenMs']
            .every((campo) => numeroONull(m[campo] ?? null))
}

function leggiSalvate(): Record<string, TalosLocalGenerationMetrics> {
    try {
        const grezzo: unknown = JSON.parse(window.localStorage.getItem(CHIAVE_SALVATAGGIO) ?? '{}')
        if (!grezzo || typeof grezzo !== 'object' || Array.isArray(grezzo)) return {}
        return Object.fromEntries(Object.entries(grezzo).filter(([, misura]) => misuraValida(misura))) as Record<string, TalosLocalGenerationMetrics>
    } catch {
        return {}
    }
}

function salva(misure: Record<string, TalosLocalGenerationMetrics>): Record<string, TalosLocalGenerationMetrics> {
    // L'ordine d'inserimento è l'ordine d'arrivo: oltre il tetto cadono le prime, cioè le più vecchie.
    const voci = Object.entries(misure)
    const tenute = Object.fromEntries(voci.slice(Math.max(0, voci.length - MASSIMO_SALVATE)))
    try { window.localStorage.setItem(CHIAVE_SALVATAGGIO, JSON.stringify(tenute)) } catch { /* memoria piena o negata: resta la riga di questa sessione */ }
    return tenute
}

const misurePerMessaggio = ref<Record<string, TalosLocalGenerationMetrics>>(leggiSalvate())

/**
 * Gli id visti all'ultimo sguardo. `null` = mai guardato: al primo sguardo si
 * osserva e basta.
 *
 * ⛔ Il primo sguardo NON assegna niente, e la ragione è un caso vero: aprire
 * una conversazione già piena farebbe comparire venti messaggi tutti «nuovi»,
 * e l'ultimo si prenderebbe una misura che non è sua.
 */
let idsPrecedenti: Set<string> | null = null

/** Oltre questi, non è un turno: è un cambio di chat o una pagina caricata. */
const MASSIMO_NUOVI_IN_UN_TURNO = 2

export interface TalosMessaggioDaLegare {
    id: string
    role: string
}

export function talosAggiornaMisureDeiMessaggi(
    messaggi: readonly TalosMessaggioDaLegare[],
): void {
    const precedenti = idsPrecedenti
    idsPrecedenti = new Set(messaggi.map((messaggio) => messaggio.id))
    if (precedenti === null) return
    const nuovi = messaggi.filter((messaggio) => !precedenti.has(messaggio.id))
    if (nuovi.length === 0 || nuovi.length > MASSIMO_NUOVI_IN_UN_TURNO) return
    const ultimo = nuovi[nuovi.length - 1]
    if (ultimo === undefined || ultimo.role !== 'assistant') return
    // Ritira SEMPRE: svuota anche quando non c'è niente da mostrare.
    const misura = talosRitiraMisuraLocale()
    if (misura === null) return
    misurePerMessaggio.value = salva({ ...misurePerMessaggio.value, [ultimo.id]: misura })
}

export function talosMisureDelMessaggio(
    messaggioId: string,
): TalosLocalGenerationMetrics | null {
    return misurePerMessaggio.value[messaggioId] ?? null
}

/** Per i test, e per chi vuole sapere se c'è qualcosa da mostrare. */
export const talosQuanteMisureLegate = computed(
    () => Object.keys(misurePerMessaggio.value).length,
)

/** Solo per i test: riporta il legame a com'era prima. */
export function talosScordaLegameMisure(): void {
    misurePerMessaggio.value = {}
    idsPrecedenti = null
    try { window.localStorage.removeItem(CHIAVE_SALVATAGGIO) } catch { /* niente da togliere */ }
}
