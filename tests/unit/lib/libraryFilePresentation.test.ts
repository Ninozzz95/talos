import { describe, expect, it } from 'vitest'
import { talosLibraryFilePresentation } from '@/lib/libraryFilePresentation'

describe('talosLibraryFilePresentation', () => {
    it('classifies supported filename extensions into stable icon families', () => {
        const fixtures = [
            ['photo.jpeg', 'image/jpeg', 'image'],
            ['contract.pdf', 'application/pdf', 'pdf'],
            ['brief.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'word'],
            ['budget.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'spreadsheet'],
            ['deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'presentation'],
            ['worker.ts', 'text/plain', 'code'],
            ['payload.json', 'application/json', 'data'],
            ['notes.md', 'text/markdown', 'text'],
            ['backup.zip', 'application/zip', 'archive'],
            ['opaque.bin', 'application/octet-stream', 'file'],
        ] as const

        for (const [displayName, mediaType, iconKind] of fixtures) {
            expect(talosLibraryFilePresentation(displayName, mediaType).iconKind)
                .toBe(iconKind)
        }
    })

    it('keeps the actual normalized extension as the visible label', () => {
        expect(talosLibraryFilePresentation('CAMERA.JPEG', 'image/jpeg').extension).toBe('JPEG')
        expect(talosLibraryFilePresentation('README.markdown', 'text/markdown').extension).toBe('MARKDOWN')
        expect(talosLibraryFilePresentation('extensionless', 'application/pdf')).toEqual({
            extension: 'PDF',
            iconKind: 'pdf',
        })
        expect(talosLibraryFilePresentation('extensionless', 'application/octet-stream')).toEqual({
            extension: 'FILE',
            iconKind: 'file',
        })
    })
})
