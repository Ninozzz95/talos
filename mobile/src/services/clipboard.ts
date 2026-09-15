import { Capacitor } from '@capacitor/core'

export interface TalosClipboardWriter {
    writeText(value: string): Promise<void>
}

async function nativeWriter(): Promise<TalosClipboardWriter> {
    const { Clipboard } = await import('@capacitor/clipboard')
    return {
        async writeText(value: string): Promise<void> {
            await Clipboard.write({ string: value })
        },
    }
}

function webWriter(): TalosClipboardWriter {
    return {
        async writeText(value: string): Promise<void> {
            if (!navigator.clipboard?.writeText) throw new Error('TALOS_CLIPBOARD_UNAVAILABLE')
            await navigator.clipboard.writeText(value)
        },
    }
}

export async function writeTalosClipboardText(
    value: string,
    writer?: TalosClipboardWriter,
): Promise<void> {
    if (value.length === 0) throw new Error('TALOS_CLIPBOARD_TEXT_REQUIRED')
    const target = writer ?? (Capacitor.isNativePlatform() ? await nativeWriter() : webWriter())
    await target.writeText(value)
}
