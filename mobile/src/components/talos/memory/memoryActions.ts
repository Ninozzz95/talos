import { BookMarked, Download, Pause, Play, SquarePen, Trash2 } from '@lucide/vue'
import type { TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import { talosMemoryStateOf } from '@/components/talos/memory/memoryShape'

/**
 * Le azioni di UNA memoria, uguali in Lista e in Schede.
 *
 * ## Perché un menu e non cinque bottoni
 *
 * Owner 10/09/2026, dopo aver visto cinque bottoni in fila nella riga della
 * Libreria: più di due azioni su un oggetto vogliono un menu overflow, più il
 * tasto destro. Qui il conto non è discutibile — aprire, correggere,
 * attivare/mettere in pausa, esportare, eliminare — ed è lo stesso menu che il
 * mockup «Talos Calm Finale» apre dai tre puntini della scheda
 * (`pMemoryCard`, `src/app.js:183`).
 *
 * ## Perché l'elenco si costruisce qui e non dentro i due componenti
 *
 * Perché la scheda e la riga sono due DENSITÀ della stessa cosa, non due cose:
 * se le voci si scrivessero due volte, prima o poi una delle due ne avrebbe una
 * in più — ed è così che la stessa memoria comincia a offrire poteri diversi a
 * seconda di come la si sta guardando. È la stessa scelta già fatta per le Note
 * (`notes/noteActions.ts`).
 *
 * ## Perché la voce dell'interruttore dice cosa SUCCEDE
 *
 * «Metti in pausa» su una memoria attiva, «Attiva» su una che non lo è. Una
 * voce di menu che dichiara lo STATO invece dell'effetto costringe a indovinare
 * cosa farà toccarla. ⛔ È l'opposto della regola dell'interruttore vero, dove
 * l'etichetta NON deve cambiare con lo stato (WAI-ARIA APG, «Switch Pattern»,
 * letto il 12/09/2026: *«It is critical the label on a switch does not change
 * when its state changes»* — https://www.w3.org/WAI/ARIA/apg/patterns/switch/):
 * là lo stato lo porta `aria-checked`, qui non c'è nessuno stato da portare,
 * c'è un comando.
 */
export type TalosMemoryActionId = 'open' | 'edit' | 'toggle' | 'export' | 'delete'

export interface TalosMemoryActionLabels {
    readonly open: string
    readonly edit: string
    /** «Attiva» — quello che succede a una memoria che ora non è attiva. */
    readonly activate: string
    /** «Metti in pausa» — quello che succede a una memoria attiva. */
    readonly pause: string
    readonly exportText: string
    readonly remove: string
    /** «Elimina memoria {title}», già composta: il nome da solo non dice cosa si elimina. */
    readonly removeNamed: string
}

export function talosMemoryRowActions(
    memory: { readonly status?: string | null; readonly kind?: string | null },
    labels: TalosMemoryActionLabels,
): TalosRowAction[] {
    const attiva = talosMemoryStateOf(memory) === 'active'
    return [
        { id: 'open', label: labels.open, icon: BookMarked, testId: 'talos-memory-action-open' },
        { id: 'edit', label: labels.edit, icon: SquarePen, testId: 'talos-memory-action-edit' },
        {
            id: 'toggle',
            label: attiva ? labels.pause : labels.activate,
            icon: attiva ? Pause : Play,
            testId: 'talos-memory-action-toggle',
        },
        { id: 'export', label: labels.exportText, icon: Download, testId: 'talos-memory-action-export' },
        {
            id: 'delete',
            label: labels.remove,
            // `danger` lo stacca sotto una riga e lo colora: il colore non è
            // mai l'unico segnale, la separazione lo accompagna.
            danger: true,
            icon: Trash2,
            ariaLabel: labels.removeNamed,
            testId: 'talos-memory-action-delete',
        },
    ]
}
