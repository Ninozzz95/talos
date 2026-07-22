import { describe, expect, it, vi } from 'vitest'
import { createNativeFilePicker, type TalosFilePickerPort } from '@/services/nativeFilePicker'

describe('createNativeFilePicker', () => {
    it('AV-04 requests metadata-only files from the operating-system picker', async () => {
        const plugin: TalosFilePickerPort = {
            pickFiles: vi.fn().mockResolvedValue({
                files: [{
                    name: ' report.pdf ',
                    mimeType: 'application/pdf',
                    size: 125,
                    path: 'content://picker/report',
                }],
            }),
        }
        const picker = createNativeFilePicker({ plugin, platform: 'android' })

        await expect(picker.pickFiles()).resolves.toEqual([{
            name: 'report.pdf',
            declaredMediaType: 'application/pdf',
            sizeBytes: 125,
            source: { kind: 'native-uri', uri: 'content://picker/report' },
        }])
        expect(plugin.pickFiles).toHaveBeenCalledWith(expect.objectContaining({
            limit: 0,
            readData: false,
        }))
    })

    it('AV-04 treats an explicit picker cancellation as a no-op', async () => {
        const plugin: TalosFilePickerPort = {
            pickFiles: vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), {
                code: 'PICKER_CANCELED',
            })),
        }
        await expect(createNativeFilePicker({ plugin, platform: 'android' }).pickFiles())
            .resolves.toEqual([])
    })

    it('AV-04 rejects a native result without a readable URI', async () => {
        const plugin: TalosFilePickerPort = {
            pickFiles: vi.fn().mockResolvedValue({
                files: [{ name: 'report.pdf', mimeType: 'application/pdf', size: 125 }],
            }),
        }
        await expect(createNativeFilePicker({ plugin, platform: 'android' }).pickFiles())
            .rejects.toThrow('TALOS_ATTACHMENT_PICKER_RESULT_INVALID')
    })

    it('AV-04 rejects more than six results before exposing any source', async () => {
        const plugin: TalosFilePickerPort = {
            pickFiles: vi.fn().mockResolvedValue({
                files: Array.from({ length: 7 }, (_, index) => ({
                    name: `file-${index}.txt`,
                    mimeType: 'text/plain',
                    size: 1,
                    path: `content://picker/${index}`,
                })),
            }),
        }
        await expect(createNativeFilePicker({ plugin, platform: 'android' }).pickFiles())
            .rejects.toThrow('TALOS_ATTACHMENT_TOO_MANY_FILES')
    })
})
