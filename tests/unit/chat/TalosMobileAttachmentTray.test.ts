// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileAttachmentTray from '@/components/chat/TalosMobileAttachmentTray.vue'
import type { TalosMobileAttachmentDraft } from '@/composables/useTalosMobileAttachments'

const ready: TalosMobileAttachmentDraft = {
    id: 'draft-ready',
    source: 'picker',
    displayName: 'architecture.pdf',
    mediaType: 'application/pdf',
    sizeBytes: 4096,
    status: 'authorized',
    vaultFileId: 'vault-ready',
    grantId: 'grant-ready',
    bindingId: 'binding-ready',
    permissions: ['browser.upload', 'model.read'],
    error: null,
}

describe('TalosMobileAttachmentTray', () => {
    it('renders compact status, size and explicit permissions without exposing private paths', () => {
        const wrapper = mount(TalosMobileAttachmentTray, {
            props: { items: [ready], busy: false, error: '' },
        })

        const item = wrapper.get('[data-attachment-id="draft-ready"]')
        expect(item.text()).toContain('architecture.pdf')
        expect(item.text()).toContain('4 KB')
        expect(item.text()).toContain('Model read')
        expect(item.text()).toContain('Browser upload')
        expect(item.text()).not.toContain('talos-vault')
        expect(wrapper.get('[aria-label="Remove architecture.pdf"]').classes()).toEqual(
            expect.arrayContaining(['min-h-touch', 'min-w-touch']),
        )
    })

    it('announces ingesting and failed states and forwards remove and dismiss actions', async () => {
        const failed: TalosMobileAttachmentDraft = {
            ...ready,
            id: 'draft-failed',
            displayName: 'spoofed.png',
            status: 'failed',
            vaultFileId: null,
            grantId: null,
            bindingId: null,
            permissions: [],
            // N1.5: the composable now maps to a FRIENDLY reason (never a raw code).
            error: 'The file contents do not match the declared file type.',
        }
        const wrapper = mount(TalosMobileAttachmentTray, {
            props: { items: [failed], busy: true, error: 'One file needs attention.' },
        })

        expect(wrapper.get('[role="status"]').text()).toContain('Adding files')
        expect(wrapper.get('[role="alert"]').text()).toContain('needs attention')
        expect(wrapper.get('[data-attachment-id="draft-failed"]').text()).toContain('Could not add file')
        // The human-readable reason is shown on the chip, never a raw TALOS_* code.
        expect(wrapper.get('[data-attachment-id="draft-failed"]').text()).toContain('The file contents do not match the declared file type.')
        expect(wrapper.get('[data-attachment-id="draft-failed"]').text()).not.toContain('TALOS_')

        await wrapper.get('[aria-label="Remove spoofed.png"]').trigger('click')
        await wrapper.get('[aria-label="Dismiss attachment error"]').trigger('click')
        expect(wrapper.emitted('remove')).toEqual([['draft-failed']])
        expect(wrapper.emitted('dismissError')).toHaveLength(1)
    })

    it('does not render an empty decorative container', () => {
        const wrapper = mount(TalosMobileAttachmentTray, {
            props: { items: [], busy: false, error: '' },
        })
        expect(wrapper.html()).toBe('<!--v-if-->')
    })
})
