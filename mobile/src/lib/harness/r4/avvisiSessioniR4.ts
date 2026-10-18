/**
 * ⛔ REV-ELENCO-07 (review avversariale della v0.1.42, 18/10): sul tablet la stessa sessione r4 si vede in due posti, la riga della
 * colonna (`HarnessScreen.vue`) e la conversazione al centro (`CodiceR4Screen.vue`). Rinominata o eliminata da uno, l'altro restava
 * com'era: titolo vecchio, o una conversazione che non esiste più. Chi cambia una sessione lo annuncia qui; chi la mostra si aggiorna.
 * Solo i cambi fatti da questa app: r4 non manda un evento per la lista delle sessioni.
 */
import { ref } from 'vue'

export interface TalosCambioSessioneR4 {
    /** Cresce a ogni annuncio, anche quando due annunci di fila sono uguali. */
    n: number
    id: string | null
    nome: string | null
    eliminata: boolean
}

export const talosCambiSessioniR4 = ref<TalosCambioSessioneR4>({ n: 0, id: null, nome: null, eliminata: false })

export function annunciaCambioSessioneR4({ id, nome = null, eliminata = false }: { id: string; nome?: string | null; eliminata?: boolean }): void {
    talosCambiSessioniR4.value = { n: talosCambiSessioniR4.value.n + 1, id, nome, eliminata }
}
