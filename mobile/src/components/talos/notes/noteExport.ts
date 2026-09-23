import { talosWithTimeout } from '@/lib/talosDeviceLog'
import { writeTalosClipboardText } from '@/services/clipboard'
import { talosNoteAsPlainText } from '@/components/talos/notes/noteShape'

/**
 * U-11 — «Esporta testo»: la nota esce dall'app per la porta di Android.
 *
 * ## Perché il foglio di sistema e non un file
 *
 * Perché la domanda vera non è «in che formato?» ma «a chi?», e a quella
 * risponde il telefono, non noi: il foglio di condivisione elenca ciò che la
 * persona ha davvero installato. È la stessa scelta già fatta per l'esportazione
 * di una conversazione (`services/sessionExportDelivery.ts`), e vuol dire che
 * chi ha imparato a mandare via una chat sa già mandare via una nota.
 *
 * Qui, a differenza di là, NON si scrive un file: un appunto è testo, e
 * `text` nel foglio di condivisione arriva dentro il messaggio invece che come
 * allegato da aprire. Salvare un `.txt` in cache per poi cancellarlo darebbe a
 * chi riceve un file da scaricare al posto di una frase da leggere.
 *
 * ## Il verso contrario: quando il foglio non c'è
 *
 * `canShare()` esiste proprio per questo — su web senza Web Share API, e su
 * qualunque ambiente in cui il plugin non risponde, il foglio non si apre. Il
 * ripiego non è un errore: è **copiare negli appunti**, che è l'altro modo in
 * cui un testo esce da un'app, e `@capacitor/clipboard` è già qui.
 *
 * Un annullamento NON è un ripiego: se il foglio si è aperto e la persona ha
 * cambiato idea, ha ottenuto quello che voleva. Copiare di nascosto in quel
 * momento metterebbe negli appunti una nota che nessuno ha chiesto di copiare —
 * e gli appunti di Android sono leggibili da altre app.
 *
 * Fonti (lette l'11/09/2026):
 * - API e opzioni: https://capacitorjs.com/docs/apis/share —
 *   `share({ title, text, url, files, dialogTitle })`, `dialogTitle` «only
 *   supported on Android»; `canShare() => Promise<CanShareResult>` con
 *   `{ value: boolean }`.
 * - L'annullamento è un RIFIUTO della promessa, non un esito: il plugin Android
 *   rigetta con «Share canceled» dall'`activityResult` —
 *   https://github.com/ionic-team/capacitor/discussions/5339
 */
export type TalosNoteExportOutcome = 'shared' | 'copied' | 'cancelled'

export interface TalosNoteExportPorts {
    canShare(): Promise<boolean>
    share(options: { title: string; text: string; dialogTitle: string }): Promise<void>
    copy(text: string): Promise<void>
}

/** Il foglio di Android, caricato solo quando serve davvero. */
async function nativePorts(): Promise<TalosNoteExportPorts> {
    // Con recinto temporale come nel Doctor: un `import()` che non torna mai
    // lascerebbe il pulsante «Esporta» girare a vuoto senza dire niente.
    const { Share } = await talosWithTimeout(import('@capacitor/share'), 5000, 'TALOS_NOTE_SHARE')
    return {
        canShare: async () => (await Share.canShare()).value === true,
        share: async (options) => { await Share.share(options) },
        copy: (text) => writeTalosClipboardText(text),
    }
}

/** Un annullamento dell'utente, riconosciuto dal messaggio del plugin. */
function isCancellation(cause: unknown): boolean {
    const message = cause instanceof Error ? cause.message : String(cause ?? '')
    // `canceled` (una L, come scrive il plugin) e `cancelled`: la stessa parola
    // si scrive nei due modi, e riconoscerne uno solo farebbe passare
    // l'annullamento per un guasto sull'altra piattaforma.
    return /cancell?ed/i.test(message)
}

export async function exportTalosNoteText(
    note: { title: string; content: string },
    dialogTitle: string,
    ports?: TalosNoteExportPorts,
): Promise<TalosNoteExportOutcome> {
    const text = talosNoteAsPlainText(note)
    const doors = ports ?? await nativePorts()

    let openable = false
    // Se persino la domanda fallisce, la risposta è «no»: si copia. Chiedere e
    // schiantarsi sarebbe il modo peggiore di scoprire che non si può condividere.
    try { openable = await doors.canShare() } catch { openable = false }

    if (openable) {
        try {
            await doors.share({ title: note.title, text, dialogTitle })
            return 'shared'
        } catch (cause) {
            if (isCancellation(cause)) return 'cancelled'
            // Il foglio c'era e si è rotto: resta il ripiego, non un vicolo cieco.
        }
    }

    await doors.copy(text)
    return 'copied'
}
