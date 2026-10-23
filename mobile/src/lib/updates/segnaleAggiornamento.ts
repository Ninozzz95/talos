import { reactive } from 'vue'

/**
 * La parte dell'aggiornamento automatico che sta nel grafo d'AVVIO: solo ciò che servono il segnale nell'intestazione e il
 * montaggio del cassetto. Tutto il resto (servizio nativo, momento calmo, cassetto) si carica dopo, in modo dinamico: il grafo
 * d'avvio ha pochi KB di margine (`scripts/verify-initial-chunk.mjs`).
 *
 * - `visibile`: c'è qualcosa da dire (pronta, fallita, appena aggiornata) → il segnale si vede (owner 22/10, 1: chiuso il cassetto,
 *   resta il segnale per riaprirlo).
 * - `fallita`: il segnale lo dice col suo colore.
 * - `aperto`: il cassetto è su.
 * - `codiceAlLavoro`: il Codice sta girando un giro (lo scrive `CodiceR4Screen.vue`): niente cassetto da solo, e «Riavvia ora» lo
 *   conta fra le attività che s'interrompono.
 */
export const talosSegnaleAggiornamento = reactive({
    visibile: false,
    fallita: false,
    aperto: false,
    codiceAlLavoro: false,
})

export function talosApriCassettoAggiornamento(): void {
    talosSegnaleAggiornamento.aperto = true
}

export function talosChiudiCassettoAggiornamento(): void {
    talosSegnaleAggiornamento.aperto = false
}
