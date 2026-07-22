import { describe, expect, it } from 'vitest'
import { analyzeTalosMobileAttachment } from '@/lib/chat/attachmentAnalysis'
import { realDocxFixture, realPdfFixture } from '../../fixtures/attachmentDocuments'

describe('analyzeTalosMobileAttachment', () => {
    it('AV-05 accepts bounded UTF-8 text and returns a real SHA-256 digest', async () => {
        const analysis = await analyzeTalosMobileAttachment({
            bytes: new TextEncoder().encode('hello TALOS'),
            name: 'notes.txt',
            declaredMediaType: 'text/plain',
        })
        expect(analysis).toEqual({
            mediaType: 'text/plain',
            extension: 'txt',
            sha256: 'a48e86e183887f66f525acbef8cba3512de5d5dc7501c726370ca3185de4a5a3',
            extractedText: 'hello TALOS',
            pageCount: null,
        })
    })

    it('AV-05 rejects invalid UTF-8 instead of silently repairing it', async () => {
        await expect(analyzeTalosMobileAttachment({
            bytes: new Uint8Array([0xc3, 0x28]),
            name: 'broken.txt',
            declaredMediaType: 'text/plain',
        })).rejects.toThrow('TALOS_ATTACHMENT_TEXT_INVALID_UTF8')
    })

    it('AV-05 detects a PNG signature and rejects a spoofed declared PDF type', async () => {
        const png = new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
            0x89,
        ])
        await expect(analyzeTalosMobileAttachment({
            bytes: png,
            name: 'spoofed.pdf',
            declaredMediaType: 'application/pdf',
        })).rejects.toThrow('TALOS_ATTACHMENT_TYPE_MISMATCH')
    })

    it('AV-05 extracts bounded text and page count from a real PDF fixture', async () => {
        const analysis = await analyzeTalosMobileAttachment({
            bytes: realPdfFixture(),
            name: 'evidence.pdf',
            declaredMediaType: 'application/pdf',
        })

        expect(analysis.mediaType).toBe('application/pdf')
        expect(analysis.extension).toBe('pdf')
        expect(analysis.extractedText).toBe('TALOS PDF evidence')
        expect(analysis.pageCount).toBe(1)
        expect(analysis.sha256).toMatch(/^[a-f0-9]{64}$/)
    }, 15_000)

    it('AV-05 extracts bounded text from a real DOCX fixture', async () => {
        const analysis = await analyzeTalosMobileAttachment({
            bytes: realDocxFixture(),
            name: 'evidence.docx',
            declaredMediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })

        expect(analysis.mediaType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        expect(analysis.extension).toBe('docx')
        expect(analysis.extractedText?.trim()).toBe('TALOS DOCX evidence')
        expect(analysis.pageCount).toBeNull()
        expect(analysis.sha256).toMatch(/^[a-f0-9]{64}$/)
    })
})
