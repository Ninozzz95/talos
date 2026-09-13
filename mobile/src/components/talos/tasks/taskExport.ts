import { exportTalosNoteText, type TalosNoteExportOutcome, type TalosNoteExportPorts } from '@/components/talos/notes/noteExport'
import { talosTaskAsPlainText } from '@/components/talos/tasks/taskShape'
import type { TalosLocalTask } from '@/repositories/chatRepository'

/**
 * U-13 — «Esporta testo»: l'attività esce dall'app per la porta di Android.
 *
 * ## ⛔ Perché questo file è quattro righe e non una seconda implementazione
 *
 * Perché la domanda è identica a quella delle note, e la risposta anche: il
 * foglio di condivisione di sistema quando c'è, gli appunti quando non c'è, e
 * un annullamento che NON è un ripiego. Riscriverla qui vorrebbe dire due
 * catene che si comportano quasi uguale — e «quasi» è il posto dove, fra sei
 * mesi, esportare un'attività copia negli appunti anche quando la persona ha
 * solo cambiato idea davanti al foglio aperto, mentre esportare una nota no.
 *
 * ⇒ La catena è una sola (`components/talos/notes/noteExport.ts`), con le sue
 * fonti e le sue prove; qui c'è solo la forma di testo che un'attività ha.
 *
 * Fonti della catena condivisa, rilette il 12/09/2026:
 * - `share({ title, text, url, files, dialogTitle })`, con `dialogTitle` «only
 *   supported on Android», e `canShare()` che risponde `{ value: boolean }`:
 *   https://capacitorjs.com/docs/apis/share
 * - l'annullamento arriva come RIFIUTO della promessa, non come esito:
 *   https://github.com/ionic-team/capacitor/discussions/5339
 */
export type TalosTaskExportOutcome = TalosNoteExportOutcome

export function exportTalosTaskText(
    task: Pick<TalosLocalTask, 'title' | 'description'>,
    dialogTitle: string,
    ports?: TalosNoteExportPorts,
): Promise<TalosTaskExportOutcome> {
    return exportTalosNoteText(talosTaskAsPlainText(task), dialogTitle, ports)
}
