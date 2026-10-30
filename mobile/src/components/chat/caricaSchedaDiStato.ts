import type { Component } from 'vue'

/**
 * Il caricamento a richiesta della scheda d'errore della chat (29/10, OK del Desktop): con `erroreLeggibile` e `talosMessageState`, che
 * usa solo lei, sono circa 7 KB fuori dal pezzo d'avvio. Una promessa sola per tutta l'app, così dalla seconda riga la scheda è già
 * pronta; se fallisce si dimentica, e la riga dopo ci riprova.
 */
let promessa: Promise<Component> | null = null

export function caricaSchedaDiStato(): Promise<Component> {
    promessa ??= import('@/components/chat/TalosMobileStatusMessage.vue').then((m) => m.default as Component)
    promessa.catch(() => { promessa = null })
    return promessa
}
