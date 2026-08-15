import { describe, expect, it, vi } from 'vitest'
import { writeTalosClipboardText } from '@/services/clipboard'

describe('writeTalosClipboardText', () => {
    it('writes exact text through the injected upstream writer', async () => {
        const writer = { writeText: vi.fn().mockResolvedValue(undefined) }
        await writeTalosClipboardText('line 1\nline 2', writer)
        expect(writer.writeText).toHaveBeenCalledWith('line 1\nline 2')
    })

    it('rejects empty text without touching the clipboard', async () => {
        const writer = { writeText: vi.fn().mockResolvedValue(undefined) }
        await expect(writeTalosClipboardText('', writer)).rejects.toThrow('TALOS_CLIPBOARD_TEXT_REQUIRED')
        expect(writer.writeText).not.toHaveBeenCalled()
    })

    it('propagates the upstream clipboard failure', async () => {
        const writer = { writeText: vi.fn().mockRejectedValue(new Error('permission denied')) }
        await expect(writeTalosClipboardText('safe text', writer)).rejects.toThrow('permission denied')
    })
})
