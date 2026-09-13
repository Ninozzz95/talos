import { Download, FileText, Pin, SquarePen, Trash2 } from '@lucide/vue'
import type { TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'

/**
 * Le azioni di UNA nota, uguali in Lista e in Schede.
 *
 * ## Perché un menu e non cinque bottoni
 *
 * Perché sono cinque. Owner 10/09/2026, dopo aver visto cinque bottoni in fila
 * nella riga della Libreria: più di due azioni su un oggetto vogliono un menu
 * overflow, più il tasto destro. Qui il conto non è discutibile — aprire,
 * correggere, mettere in evidenza, esportare, eliminare — ed è lo stesso menu
 * che il mockup «Talos Calm» apre dai tre puntini della scheda.
 *
 * ## Perché l'elenco si costruisce qui e non dentro i due componenti
 *
 * Perché la scheda e la riga sono due DENSITÀ della stessa cosa, non due cose:
 * se le voci si scrivessero due volte, prima o poi una delle due ne avrebbe una
 * in più — ed è così che la stessa nota comincia a offrire poteri diversi a
 * seconda di come la si sta guardando.
 *
 * ## Perché «In evidenza» sta anche qui, pur avendo la sua puntina
 *
 * Perché la puntina c'è sulla scheda ma non sulla riga (là è solo un segno
 * accanto al titolo, come nel mockup), e perché chi arriva al menu deve trovare
 * tutto quello che si può fare — non tutto tranne la cosa che ha già toccato.
 * La voce dice cosa SUCCEDE se la si sceglie, non in che stato si è: «Metti in
 * evidenza» su una nota che non lo è, «Togli dall'evidenza» su una che lo è.
 */
export type TalosNoteActionId = 'open' | 'edit' | 'pin' | 'export' | 'delete'

export interface TalosNoteActionLabels {
    readonly open: string
    readonly edit: string
    readonly pinOn: string
    readonly pinOff: string
    readonly exportText: string
    readonly remove: string
    /** «Elimina nota {title}», già composta: il nome da solo non dice cosa si elimina. */
    readonly removeNamed: string
}

export function talosNoteRowActions(
    note: { readonly pinned: boolean },
    labels: TalosNoteActionLabels,
): TalosRowAction[] {
    return [
        { id: 'open', label: labels.open, icon: FileText, testId: 'talos-note-action-open' },
        { id: 'edit', label: labels.edit, icon: SquarePen, testId: 'talos-note-action-edit' },
        {
            id: 'pin',
            label: note.pinned ? labels.pinOff : labels.pinOn,
            icon: Pin,
            testId: 'talos-note-action-pin',
        },
        { id: 'export', label: labels.exportText, icon: Download, testId: 'talos-note-action-export' },
        {
            id: 'delete',
            label: labels.remove,
            // `danger` lo stacca sotto una riga e lo colora: il colore non è
            // mai l'unico segnale, la separazione lo accompagna.
            danger: true,
            icon: Trash2,
            ariaLabel: labels.removeNamed,
            testId: 'talos-note-action-delete',
        },
    ]
}
