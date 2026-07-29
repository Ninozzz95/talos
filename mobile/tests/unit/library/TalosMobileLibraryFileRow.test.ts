// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileLibraryFileRow from '@/components/talos/library/TalosMobileLibraryFileRow.vue'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

const FILE: TalosLocalVaultFile = {
    id: 'file-1',
    display_name: 'strategy.pdf',
    media_type: 'application/pdf',
    size_bytes: 2048,
    private_uri: 'talos-vault/files/file-1.pdf',
    status: 'available',
    trust: 'untrusted',
    sha256: 'a'.repeat(64),
    extracted_text: 'strategy',
    failure_code: null,
    metadata: {},
    created_at: '2026-07-28T10:00:00.000Z',
    updated_at: '2026-07-28T10:00:00.000Z',
}

describe('TalosMobileLibraryFileRow', () => {
    it('renders the shared thumbnail, name, metadata, details, and action slots', async () => {
        const wrapper = mount(TalosMobileLibraryFileRow, {
            props: {
                file: FILE,
                thumbnailUrl: null,
                openLabel: 'Open strategy.pdf',
                testId: 'canonical-row',
            },
            slots: {
                meta: '<span>Modified today</span>',
                details: '<span>Any chat may read it</span>',
                actions: '<button type="button">Delete</button>',
            },
        })

        const row = wrapper.get('[data-talos-library-row]')
        expect(row.attributes('role')).toBe('listitem')
        expect(row.attributes('data-testid')).toBe('canonical-row')
        expect(row.get('[data-talos-library-thumbnail]').classes()).toContain('size-12')
        expect(row.findAll('button')[1]!.classes()).toContain('min-h-12')
        expect(row.get('[data-talos-library-name]').text()).toBe('strategy.pdf')
        expect(row.get('[data-talos-library-icon-kind]').attributes('data-talos-library-icon-kind')).toBe('pdf')
        expect(row.get('[data-talos-library-extension]').text()).toBe('PDF')
        expect(row.text()).toContain('Modified today')
        expect(row.text()).toContain('Any chat may read it')
        expect(row.text()).toContain('Delete')

        await row.get('[aria-label="Open strategy.pdf"]').trigger('click')
        expect(wrapper.emitted('open')).toHaveLength(1)
    })

    it('announces both selected row controls with the same pressed state', () => {
        const wrapper = mount(TalosMobileLibraryFileRow, {
            props: {
                file: FILE,
                selectionMode: true,
                selected: true,
                openLabel: 'Select strategy.pdf',
            },
        })

        const thumbnail = wrapper.get('[data-talos-library-thumbnail]')
        const name = wrapper.get('[data-talos-library-name-button]')
        expect(thumbnail.attributes('aria-label')).toBe('Select strategy.pdf')
        expect(name.attributes('aria-label')).toBe('Select strategy.pdf')
        expect(thumbnail.attributes('aria-pressed')).toBe('true')
        expect(name.attributes('aria-pressed')).toBe('true')
    })

    it('announces both unselected row controls as not pressed', () => {
        const wrapper = mount(TalosMobileLibraryFileRow, {
            props: {
                file: FILE,
                selectionMode: true,
                selected: false,
                openLabel: 'Select strategy.pdf',
            },
        })

        expect(wrapper.get('[data-talos-library-thumbnail]').attributes('aria-pressed')).toBe('false')
        expect(wrapper.get('[data-talos-library-name-button]').attributes('aria-pressed')).toBe('false')
    })

    it('keeps both row controls as ordinary buttons outside selection mode', () => {
        const wrapper = mount(TalosMobileLibraryFileRow, {
            props: {
                file: FILE,
                openLabel: 'Open strategy.pdf',
            },
        })

        const thumbnail = wrapper.get('[data-talos-library-thumbnail]')
        const name = wrapper.get('[data-talos-library-name-button]')
        expect(thumbnail.attributes('aria-label')).toBe('Open strategy.pdf')
        expect(name.attributes('aria-label')).toBe('Open strategy.pdf')
        expect(thumbnail.attributes('aria-pressed')).toBeUndefined()
        expect(name.attributes('aria-pressed')).toBeUndefined()
    })

    it('emits the canonical open or select event from the filename control', async () => {
        const wrapper = mount(TalosMobileLibraryFileRow, {
            props: {
                file: FILE,
                selectionMode: true,
                selected: false,
                openLabel: 'Select strategy.pdf',
            },
        })

        await wrapper.get('[data-talos-library-name-button]').trigger('click')
        expect(wrapper.emitted('open')).toHaveLength(1)
    })
})
