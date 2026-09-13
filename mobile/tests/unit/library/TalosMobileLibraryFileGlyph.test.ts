// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileLibraryFileGlyph from '@/components/talos/library/TalosMobileLibraryFileGlyph.vue'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

function file(displayName: string, mediaType: string): TalosLocalVaultFile {
    return {
        id: displayName,
        display_name: displayName,
        media_type: mediaType,
        size_bytes: 2048,
        private_uri: `talos-vault/files/${displayName}`,
        status: 'available',
        trust: 'untrusted',
        sha256: 'a'.repeat(64),
        extracted_text: null,
        failure_code: null,
        metadata: {},
        created_at: '2026-07-28T10:00:00.000Z',
        updated_at: '2026-07-28T10:00:00.000Z',
    }
}

describe('TalosMobileLibraryFileGlyph', () => {
    it('renders a distinct icon-kind hook and visible extension without a thumbnail', () => {
        const pdf = mount(TalosMobileLibraryFileGlyph, {
            props: { file: file('strategy.pdf', 'application/pdf') },
        })
        const sheet = mount(TalosMobileLibraryFileGlyph, {
            props: {
                file: file(
                    'budget.xlsx',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                ),
            },
        })

        expect(pdf.get('[data-talos-library-file-glyph]').attributes('aria-hidden')).toBe('true')
        expect(pdf.get('[data-talos-library-icon-kind]').attributes('data-talos-library-icon-kind')).toBe('pdf')
        expect(sheet.get('[data-talos-library-icon-kind]').attributes('data-talos-library-icon-kind')).toBe('spreadsheet')
        expect(pdf.get('[data-talos-library-extension]').text()).toBe('PDF')
        expect(pdf.get('[data-talos-library-extension]').classes()).toContain('text-3xs')
        expect(sheet.get('[data-talos-library-extension]').text()).toBe('XLSX')
    })

    it('keeps an image thumbnail and overlays its visible extension', () => {
        const wrapper = mount(TalosMobileLibraryFileGlyph, {
            props: {
                file: file('reference.png', 'image/png'),
                thumbnailUrl: 'blob:reference',
            },
        })

        expect(wrapper.get('img').attributes('src')).toBe('blob:reference')
        expect(wrapper.get('img').attributes('alt')).toBe('')
        expect(wrapper.get('[data-talos-library-icon-kind]').attributes('data-talos-library-icon-kind')).toBe('image')
        expect(wrapper.get('[data-talos-library-extension]').text()).toBe('PNG')
    })
})
