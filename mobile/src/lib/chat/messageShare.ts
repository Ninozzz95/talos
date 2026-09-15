import { talosWithTimeout } from '@/lib/talosDeviceLog'
import { writeTalosClipboardText } from '@/services/clipboard'

/**
 * «Condividi» una risposta — owner 2026-09-13: il foglio di Android col testo in
 * MARKDOWN, una voce sola al posto di «Esporta» e «Condividi».
 *
 * Stesse porte di noteExport.ts, con una differenza voluta: la nota si condivide
 * in testo semplice, la risposta si condivide COM'E', perche' titoli, elenchi e
 * blocchi di codice sono il suo contenuto e l'app che la riceve sa leggerli.
 */
export type TalosMessageShareOutcome = 'shared' | 'copied' | 'cancelled'

export interface TalosMessageSharePorts {
    canShare(): Promise<boolean>
    share(options: { title: string, text: string, dialogTitle: string }): Promise<void>
    copy(text: string): Promise<void>
}

async function nativePorts(): Promise<TalosMessageSharePorts> {
    const { Share } = await talosWithTimeout(import('@capacitor/share'), 5000, 'TALOS_MESSAGE_SHARE')
    return {
        canShare: async () => (await Share.canShare()).value === true,
        share: async (options) => { await Share.share(options) },
        copy: (text) => writeTalosClipboardText(text),
    }
}

function isCancellation(cause: unknown): boolean {
    const message = cause instanceof Error ? cause.message : String(cause ?? '')
    return /cancell?ed/i.test(message)
}

/** Il titolo del foglio: la prima riga non vuota, senza i cancelletti di un titolo Markdown. */
export function talosMessageShareTitle(markdown: string): string {
    const first = markdown.split(String.fromCharCode(10)).map((line) => line.replace(/^#+[ \t]*/, '').trim()).find((line) => line.length > 0)
    return (first ?? '').slice(0, 80)
}

export async function shareTalosMessageMarkdown(
    markdown: string,
    dialogTitle: string,
    ports?: TalosMessageSharePorts,
): Promise<TalosMessageShareOutcome> {
    const doors = ports ?? await nativePorts()
    let openable = false
    try { openable = await doors.canShare() } catch { openable = false }
    if (openable) {
        try {
            await doors.share({ title: talosMessageShareTitle(markdown), text: markdown, dialogTitle })
            return 'shared'
        } catch (cause) {
            if (isCancellation(cause)) return 'cancelled'
        }
    }
    await doors.copy(markdown)
    return 'copied'
}
