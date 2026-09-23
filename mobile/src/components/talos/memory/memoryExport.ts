import {
    exportTalosNoteText,
    type TalosNoteExportOutcome,
    type TalosNoteExportPorts,
} from '@/components/talos/notes/noteExport'

/**
 * U-13 — «Esporta testo»: la memoria esce dall'app per la porta di Android.
 *
 * ## ⛔ Perché questo file DELEGA invece di rifare il lavoro
 *
 * Perché la catena è già scritta, provata e verificata sul dispositivo per le
 * Note: foglio di condivisione di sistema se c'è (`Share.canShare()`), copia
 * negli appunti se non c'è, e un annullamento NON è un ripiego — se il foglio
 * si è aperto e la persona ha cambiato idea, ha ottenuto quello che voleva, e
 * copiare di nascosto in quel momento metterebbe negli appunti un testo che
 * nessuno ha chiesto di copiare.
 *
 * Riscriverla qui vorrebbe dire avere DUE cure per lo stesso caso limite: la
 * prossima volta che il plugin cambia il nome dell'annullamento, una delle due
 * lo saprebbe e l'altra no.
 *
 * ⇒ Resta un file, e non una `import` diretta dalle Note dentro le schermate
 * della Memoria, per due ragioni: qui il nome dice **memoria** (chi legge
 * `MemoryItemScreen` non deve chiedersi perché sta chiamando una funzione che
 * si chiama «nota»), e il giorno in cui la funzione condivisa si sposterà in un
 * posto neutro cambierà **questa riga sola**.
 *
 * 🔜 Debito dichiarato: il posto giusto di `exportTalosNoteText` è un modulo
 * comune — si chiama «nota» per l'ordine in cui le due stazioni sono state
 * fatte, non perché sappia qualcosa delle note (prende `{ title, content }` e
 * basta). Questo giro di lavoro aveva il permesso di toccare solo la Memoria, e
 * rinominare un file delle Note mentre un'altra sessione ci lavora sarebbe un
 * conflitto gratuito.
 *
 * Fonti (rilette il 12/09/2026):
 * - `Share.share({ title, text, url, dialogTitle })` e
 *   `canShare() => Promise<{ value: boolean }>`; `dialogTitle` è solo Android —
 *   https://capacitorjs.com/docs/apis/share
 * - L'annullamento arriva come RIFIUTO della promessa, non come esito —
 *   https://github.com/ionic-team/capacitor/discussions/5339
 */
export type TalosMemoryExportOutcome = TalosNoteExportOutcome
export type TalosMemoryExportPorts = TalosNoteExportPorts

export function exportTalosMemoryText(
    memory: { title: string; content: string },
    dialogTitle: string,
    ports?: TalosMemoryExportPorts,
): Promise<TalosMemoryExportOutcome> {
    // Titolo, riga vuota, contenuto: la forma minima che resta leggibile in
    // qualunque cosa la riceva. Niente intestazioni nostre e niente firma —
    // quello che esce è quello che la persona ha scritto.
    return exportTalosNoteText(memory, dialogTitle, ports)
}
