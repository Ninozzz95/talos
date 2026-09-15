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
 * Non sopravvive alla chiusura dell'app: quelle misure non sono su disco.
 * Riaprendo una chat di ieri la riga non c'è. È la scelta onesta — meglio
 * niente che una riga di zeri — ed è il debito da chiudere il giorno in cui la
 * catena dei metadati avrà un canale per le misure.
 */
const misurePerMessaggio = ref<Record<string, TalosLocalGenerationMetrics>>({})

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
    misurePerMessaggio.value = { ...misurePerMessaggio.value, [ultimo.id]: misura }
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
}
