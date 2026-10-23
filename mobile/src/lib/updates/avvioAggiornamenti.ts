import { ref, watch, type WatchStopHandle } from 'vue'
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import {
    talosAggiornamenti,
    talosAggiornamentoDaMostrare,
    talosAvviaAggiornamenti,
    talosRileggiAggiornamenti,
    talosUscitaPerAggiornamento,
} from '@/services/appUpdates'
import { talosModelTransfers } from '@/stores/modelTransfers'
import { talosSegnaleAggiornamento } from './segnaleAggiornamento'

/**
 * Il cablaggio dell'aggiornamento nell'app, caricato DOPO l'avvio da `App.vue`.
 *
 * Owner 22/10 (1): il cassetto sale da solo, ma SOLO in un momento calmo — TALOS non scrive, il Codice non lavora, non si scarica
 * un modello, la persona è sulla chat — e una volta sola per ogni cosa da dire; chiuso, resta il segnale.
 * Owner 22/10 (3): «Al prossimo avvio» = s'installa quando la persona esce da TALOS e niente lavora.
 */
export interface TalosOccupazioneApp {
    /** La chat sta scrivendo una risposta. */
    chatAlLavoro(): boolean
    /** La persona è su una schermata che non è la chat (Impostazioni, Codice…): il cassetto non le sale sopra. */
    fuoriDallaChat(): boolean
}

const CHIAVE_MOSTRATO = 'talos.aggiornamento.cassetto-mostrato.v1'

/** Quante attività «Riavvia ora» interromperebbe. */
export function talosLavoriInCorso(occupazione: Pick<TalosOccupazioneApp, 'chatAlLavoro'>): number {
    return (occupazione.chatAlLavoro() ? 1 : 0)
        + (talosSegnaleAggiornamento.codiceAlLavoro ? 1 : 0)
        + (talosModelTransfers.active ? 1 : 0)
}

export function talosMomentoCalmo(occupazione: TalosOccupazioneApp, visibile = true): boolean {
    return visibile && !occupazione.fuoriDallaChat() && talosLavoriInCorso(occupazione) === 0
}

/** Cosa c'è da dire adesso, come chiave: il cassetto sale da solo una volta sola per ciascuna. */
function daDire(): string | null {
    if (talosAggiornamenti.appenaAggiornata) return `aggiornata:${talosAggiornamenti.appenaAggiornata}`
    if (talosAggiornamenti.fase === 'PRONTA') return `pronta:${talosAggiornamenti.versione}`
    if (talosAggiornamenti.fase === 'FALLITA') return `fallita:${talosAggiornamenti.versione}:${talosAggiornamenti.motivo}`
    return null
}

function giaMostrato(chiave: string): boolean {
    try { return localStorage.getItem(CHIAVE_MOSTRATO) === chiave } catch { return false }
}

function segnaMostrato(chiave: string): void {
    try { localStorage.setItem(CHIAVE_MOSTRATO, chiave) } catch { /* resta il segnale: al peggio il cassetto risale */ }
}

export async function talosAvviaCablaggioAggiornamenti(occupazione: TalosOccupazioneApp): Promise<() => void> {
    await talosAvviaAggiornamenti()
    // la visibilità non è reattiva: la si copia in un ref, così il cassetto può salire anche al ritorno nell'app
    const leggiVisibile = () => typeof document === 'undefined' || document.visibilityState === 'visible'
    const visibile = ref(leggiVisibile())
    const suVisibilita = () => { visibile.value = leggiVisibile() }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', suVisibilita)

    const fermaSegnale: WatchStopHandle = watch(
        () => [talosAggiornamenti.fase, talosAggiornamenti.appenaAggiornata] as const,
        () => {
            talosSegnaleAggiornamento.visibile = talosAggiornamentoDaMostrare(talosAggiornamenti)
            talosSegnaleAggiornamento.fallita = talosAggiornamenti.fase === 'FALLITA'
        },
        { immediate: true },
    )

    const fermaCassetto: WatchStopHandle = watch(
        () => [daDire(), talosMomentoCalmo(occupazione, visibile.value)] as const,
        ([chiave, calmo]) => {
            if (!chiave || !calmo || talosSegnaleAggiornamento.aperto || giaMostrato(chiave)) return
            segnaMostrato(chiave)
            talosSegnaleAggiornamento.aperto = true
        },
        { immediate: true },
    )

    let pausa: PluginListenerHandle | null = null
    let ripresa: PluginListenerHandle | null = null
    try {
        pausa = await App.addListener('pause', () => {
            if (talosLavoriInCorso(occupazione) === 0) void talosUscitaPerAggiornamento()
        })
        ripresa = await App.addListener('resume', () => { void talosRileggiAggiornamenti() })
    } catch {
        // senza l'ascolto della pausa «Al prossimo avvio» aspetta la prossima uscita
    }

    return () => {
        fermaSegnale()
        fermaCassetto()
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', suVisibilita)
        void pausa?.remove()
        void ripresa?.remove()
    }
}
