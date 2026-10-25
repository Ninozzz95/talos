/**
 * Mockup remoto del 23/10, tavola 3: la scelta «Dove» della lista del Codice (`'tutte'`, `'qui'` o un `pcId`), una sola per l'app.
 * ⛔ D-MOCK-1 (dal Pad, vc175, 24/10/2026): sul tablet la colonna e la pagina sono due istanze della lista, e la rotta `harness` riapre
 * l'ultima sessione (TAB-INDIETRO-01) perdendo `?dove=`: la scelta vista solo nella rotta tornava a «Tutte». Qui resta finché la
 * persona non ne fa un'altra; la rotta la imposta quando la porta (dal Computer, dall'Indietro di una sessione del PC).
 */
import { ref } from 'vue'

export const doveDelCodice = ref<string | null>(null)
