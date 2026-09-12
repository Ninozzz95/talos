import { describe, expect, it, vi } from 'vitest'
import { exportTalosNoteText } from '@/components/talos/notes/noteExport'

const nota = { title: 'Idee per il rilascio', content: 'Rivedere il percorso della chat.' }

function porte(overrides: Partial<Parameters<typeof exportTalosNoteText>[2]> = {}) {
    return {
        canShare: vi.fn(async () => true),
        share: vi.fn(async () => undefined),
        copy: vi.fn(async () => undefined),
        ...overrides,
    } as NonNullable<Parameters<typeof exportTalosNoteText>[2]>
}

/**
 * U-11 — «Esporta testo». Le prove interessanti sono tutte al VERSO CONTRARIO:
 * il caso felice è una riga sola, i tre modi in cui può non andare sono quelli
 * che decidono se la persona resta con la nota in mano o a mani vuote.
 */
describe('U-11 exporting a note as text', () => {
    it('hands title and body to the system share sheet', async () => {
        const doors = porte()

        await expect(exportTalosNoteText(nota, 'Esporta testo', doors)).resolves.toBe('shared')

        expect(doors.share).toHaveBeenCalledWith({
            title: 'Idee per il rilascio',
            text: 'Idee per il rilascio\n\nRivedere il percorso della chat.',
            // `dialogTitle` esiste solo su Android; passarlo altrove è innocuo.
            dialogTitle: 'Esporta testo',
        })
        expect(doors.copy).not.toHaveBeenCalled()
    })

    /**
     * ⛔ Il ripiego chiesto dall'owner: senza foglio di condivisione, negli
     * appunti. Non è un errore — è l'altro modo in cui un testo esce da un'app.
     */
    it('copies to the clipboard when the device has no share sheet', async () => {
        const doors = porte({ canShare: vi.fn(async () => false) })

        await expect(exportTalosNoteText(nota, 'Esporta testo', doors)).resolves.toBe('copied')

        expect(doors.share).not.toHaveBeenCalled()
        expect(doors.copy).toHaveBeenCalledWith('Idee per il rilascio\n\nRivedere il percorso della chat.')
    })

    /** Se persino la domanda si schianta, la risposta è «no»: si copia. */
    it('copies when asking whether sharing is possible throws', async () => {
        const doors = porte({ canShare: vi.fn(async () => { throw new Error('no bridge') }) })

        await expect(exportTalosNoteText(nota, 'Esporta testo', doors)).resolves.toBe('copied')
        expect(doors.copy).toHaveBeenCalled()
    })

    /**
     * ⛔ Un ANNULLAMENTO non è un ripiego. Il foglio si è aperto e la persona ha
     * cambiato idea: copiare di nascosto in quel momento metterebbe negli
     * appunti — leggibili da altre app — una nota che nessuno ha chiesto di
     * copiare. Il plugin Android rigetta con «Share canceled»
     * (ionic-team/capacitor#5339, letto l'11/09/2026).
     */
    it('does not copy anything when the person cancels the share sheet', async () => {
        const doors = porte({ share: vi.fn(async () => { throw new Error('Share canceled') }) })

        await expect(exportTalosNoteText(nota, 'Esporta testo', doors)).resolves.toBe('cancelled')
        expect(doors.copy).not.toHaveBeenCalled()
    })

    it('recognises the double-L spelling of the same word', async () => {
        const doors = porte({ share: vi.fn(async () => { throw new Error('Share cancelled') }) })

        await expect(exportTalosNoteText(nota, 'Esporta testo', doors)).resolves.toBe('cancelled')
        expect(doors.copy).not.toHaveBeenCalled()
    })

    /** Il foglio c'era e si è rotto davvero: resta il ripiego, non un vicolo cieco. */
    it('falls back to the clipboard when the share sheet fails for a real reason', async () => {
        const doors = porte({ share: vi.fn(async () => { throw new Error('Activity not found') }) })

        await expect(exportTalosNoteText(nota, 'Esporta testo', doors)).resolves.toBe('copied')
        expect(doors.copy).toHaveBeenCalled()
    })

    /** Quando non resta nemmeno il ripiego, l'errore esce: chi chiama lo dice. */
    it('lets the failure through when the clipboard is gone too', async () => {
        const doors = porte({
            canShare: vi.fn(async () => false),
            copy: vi.fn(async () => { throw new Error('TALOS_CLIPBOARD_UNAVAILABLE') }),
        })

        await expect(exportTalosNoteText(nota, 'Esporta testo', doors))
            .rejects.toThrow('TALOS_CLIPBOARD_UNAVAILABLE')
    })
})
