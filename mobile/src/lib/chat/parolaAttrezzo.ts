/**
 * La parola di una riga d'attrezzo: quella della chat se la chat conosce l'attrezzo; altrimenti il nome umano del desktop r4 (gli
 * attrezzi del Codice: «shell», «leggi», «delega_sottotask»…) con l'iniziale maiuscola, come `comeTitolo` (`legacy/app.js:9859` @ fc5).
 *
 * Estratta da `TalosMobileAttivitaDelTurno.vue` il 20/10/2026 perché la usano anche la riga dell'attrezzo in scrittura
 * (`TalosMobileBozzeAttrezzi.vue`) e il riassunto del gruppo: una parola sola per lo stesso attrezzo, ovunque. Solo moduli pigri
 * la importano: il nome umano r4 non entra nell'avvio.
 */
import type { TalosTranslate } from '@/i18n/contracts'
import { TALOS_TOOL_LABEL_KEYS } from '@/lib/tools/toolLabels'
import { nomeUmanoAttrezzoR4 } from '@/lib/harness/r4/agentiR4'

export function talosParolaAttrezzo(nome: string, t: TalosTranslate, lingua: string): string | undefined {
    const chiave = TALOS_TOOL_LABEL_KEYS[nome]
    if (chiave) return t(chiave)
    const umano = nomeUmanoAttrezzoR4(nome, lingua)
    return umano ? umano.charAt(0).toLocaleUpperCase(lingua) + umano.slice(1) : undefined
}
