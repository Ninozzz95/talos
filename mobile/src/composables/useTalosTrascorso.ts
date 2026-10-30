import { computed, getCurrentScope, onScopeDispose, ref, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { talosElapsedLabel } from '@/composables/useTalosElapsed'

/**
 * ⭐ I SECONDI DELLE RIGHE IN CORSO, dall'ORA DELL'EVENTO (owner 27/10/2026: «ogni riga in corso deve essere animata e con un counter
 * di secondi, nulla deve fare sembrare la ui bloccata»; bozzetto approvato il 28/10).
 *
 * `useTalosElapsed` conta dal montaggio: una riga rimontata (lista che si ridisegna, sessione riaperta, ricarica) ripartiva da zero e
 * mentiva sul tempo. Il desktop conta dall'evento che ha aperto lo stato (ATTESA-DA-CAPO, `app.js:14066-14071`), Hermes dal `since`
 * del server (`activity-timer.ts:48-69`). Qui uguale: chi monta la riga passa l'ora dell'evento (RunStarted, ToolCallStart, l'invio
 * salvato col messaggio, `inizioGiroAlle` del PC…). Senza un'ora vera, niente secondi: meglio che inventarli (Desktop, 28/10).
 *
 * UN solo orologio per pagina (1 s): cinquanta righe non sono cinquanta timer, e quando l'ultima se ne va l'orologio si spegne.
 */
const ora = ref(Date.now())
let iscritti = 0
let battito: ReturnType<typeof setInterval> | null = null

function iscrivi(): void {
    iscritti += 1
    // ⛔ l'ora si rinfresca a OGNI iscrizione, anche con l'orologio già acceso: altrimenti una riga che nasce fra due battiti legge
    // un'ora vecchia fino a 1 s (una riga di 2 s diceva «1s», Pad vc364, 29/10; TRASC-06)
    ora.value = Date.now()
    if (battito !== null) return
    battito = setInterval(() => { ora.value = Date.now() }, 1_000)
}

function disiscrivi(): void {
    iscritti = Math.max(0, iscritti - 1)
    if (iscritti > 0 || battito === null) return
    clearInterval(battito)
    battito = null
}

/** Secondi trascorsi dall'ora dell'evento (ms dall'epoca); `null` se l'ora non c'è. Si aggiorna una volta al secondo. */
export function useTalosTrascorso(inizio: MaybeRefOrGetter<number | null | undefined>): ComputedRef<number | null> {
    iscrivi()
    if (getCurrentScope()) onScopeDispose(disiscrivi)
    return computed(() => {
        const da = toValue(inizio)
        if (typeof da !== 'number' || !Number.isFinite(da)) return null
        // un evento «nel futuro» (orologi di telefono e PC non allineati) conta da zero, mai all'indietro
        return Math.max(0, Math.floor((ora.value - da) / 1_000))
    })
}

/** I secondi come testo: «0s» al primo istante (mai vuoto: la riga deve dire che il tempo passa), poi il formato del telefono. */
export function talosTrascorsoEtichetta(secondi: number): string {
    return talosElapsedLabel(secondi) || '0s'
}
