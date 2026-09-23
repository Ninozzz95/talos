import {
    CheckSquare, Download, ListChecks, Pause, Play, SquarePen, Trash2,
} from '@lucide/vue'
import type { TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import { talosTaskIsScheduled } from '@/components/talos/tasks/taskShape'
import type { TalosLocalTask } from '@/repositories/chatRepository'

/**
 * Le azioni di UNA attività, uguali in Schede e in Lista.
 *
 * ## Perché un menu e non una fila di bottoni
 *
 * Owner 10/09/2026, dopo aver visto cinque bottoni in fila nella riga della
 * Libreria: più di due azioni su un oggetto vogliono un menu overflow. Qui il
 * conto non è discutibile — aprire, correggere, metterla in corso, fermarla,
 * esportarla, sceglierla, eliminarla — e affiancarne anche solo tre
 * rifarebbe quel difetto in una schermata nuova.
 *
 * Sulla scheda restano quindi due sole cose toccabili accanto al titolo: la
 * casella, che completa, e i tre puntini, che aprono tutto il resto.
 *
 * ## Perché l'elenco si costruisce qui e non dentro i due componenti
 *
 * Perché scheda e riga sono due DENSITÀ della stessa cosa, non due cose: se le
 * voci si scrivessero due volte, prima o poi una delle due ne avrebbe una in
 * più, e la stessa attività offrirebbe poteri diversi a seconda di come la si
 * sta guardando.
 *
 * ## ⛔ Perché «Metti in pausa» compare solo su alcune
 *
 * Perché su un'attività senza ricorrenza non c'è niente da fermare. Una voce
 * che si può scegliere e non fa niente è peggio di una voce assente: chi la
 * tocca conclude che l'app è rotta, e non ha modo di sapere che invece è la
 * domanda a non avere senso su questa riga.
 *
 * Le voci dicono cosa SUCCEDE se le si sceglie, non in che stato si è: «Metti
 * in pausa» su una che sta girando, «Riprendi» su una ferma.
 */
export type TalosTaskActionId =
    | 'open' | 'edit' | 'doing' | 'pause' | 'export' | 'select' | 'delete'

export interface TalosTaskActionLabels {
    readonly open: string
    readonly edit: string
    /** «Segnala in corso» / «Riportala da fare»: dipende da dov'è adesso. */
    readonly markDoing: string
    readonly markTodo: string
    readonly pause: string
    readonly resume: string
    readonly exportText: string
    readonly select: string
    readonly remove: string
    /** «Elimina attività {title}», già composta: il verbo da solo non dice cosa. */
    readonly removeNamed: string
}

export function talosTaskRowActions(
    task: TalosLocalTask,
    labels: TalosTaskActionLabels,
): TalosRowAction[] {
    const pianificata = talosTaskIsScheduled(task)
    return [
        { id: 'open', label: labels.open, icon: ListChecks, testId: 'talos-tasks-action-open' },
        { id: 'edit', label: labels.edit, icon: SquarePen, testId: 'talos-tasks-action-edit' },
        {
            // ⛔ «In corso» vive QUI e non sulla scheda (decisione dell'owner,
            // 12/09/2026): la casella fa una cosa sola — completa — e un
            // controllo che gira su tre stati costringe a toccarlo due volte
            // per tornare dov'era.
            id: 'doing',
            label: task.status === 'doing' ? labels.markTodo : labels.markDoing,
            icon: CheckSquare,
            testId: 'talos-tasks-action-doing',
        },
        ...(pianificata
            ? [{
                id: 'pause',
                label: task.paused ? labels.resume : labels.pause,
                icon: task.paused ? Play : Pause,
                testId: 'talos-tasks-action-pause',
            } satisfies TalosRowAction]
            : []),
        { id: 'export', label: labels.exportText, icon: Download, testId: 'talos-tasks-action-export' },
        { id: 'select', label: labels.select, icon: CheckSquare, testId: 'talos-tasks-action-select' },
        {
            id: 'delete',
            label: labels.remove,
            // `danger` lo stacca sotto una riga e lo colora: il colore non è
            // mai l'unico segnale, la separazione lo accompagna.
            danger: true,
            icon: Trash2,
            ariaLabel: labels.removeNamed,
            testId: 'talos-tasks-action-delete',
        },
    ]
}
