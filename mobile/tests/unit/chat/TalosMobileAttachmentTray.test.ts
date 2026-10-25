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

    it('K3-C Allegati A2 (Pad 16/10): the permissions line says only what the draft really has', () => {
        const wrapper = mount(TalosMobileAttachmentTray, {
            props: { items: [ready, { ...ready, id: 'draft-r4', vaultFileId: 'r4:abc', permissions: ['model.read'] }], busy: false, error: '' },
        })
        // the chat's drafts keep their line as it was
        expect(wrapper.get('[data-attachment-id="draft-ready"]').text()).toContain('4 KB · Model read · Browser upload')
        // an image held by the Code engine is read by the model and uploaded nowhere
        const r4 = wrapper.get('[data-attachment-id="draft-r4"]').text()
        expect(r4).toContain('4 KB · Model read')
        expect(r4).not.toContain('Browser upload')
    })

    it('Pad 16/10: the Italian consent without a provider name reads as a sentence («a chi fornisce», not «a il»)', async () => {
        const { TALOS_IT_MESSAGES } = await import('@/i18n/locales/it')
        const chat = TALOS_IT_MESSAGES.chat as unknown as Record<string, string>
        const frase = chat.imageConsentBody.replace('{provider}', chat.imageConsentProviderUnknown)
        expect(frase).toContain('TALOS la invia a chi fornisce il modello scelto.')
        expect(frase).not.toMatch(/\ba il\b/u)
    })

    it('does not render an empty decorative container', () => {
        const wrapper = mount(TalosMobileAttachmentTray, {
            props: { items: [], busy: false, error: '' },
        })
        expect(wrapper.html()).toBe('<!--v-if-->')
    })

    it('R5.13 F3: a file on its way to the PC says how far it is, and a paused one says it resumes by itself', () => {
        const sending: TalosMobileAttachmentDraft = { ...ready, id: 'draft-sending', status: 'ingesting', sizeBytes: 19_084_083, progress: { phase: 'sending', sent: 7_759_462, total: 19_084_083 } }
        const paused: TalosMobileAttachmentDraft = { ...ready, id: 'draft-paused', status: 'ingesting', progress: { phase: 'paused', sent: 262_144, total: 421_888 } }
        const wrapper = mount(TalosMobileAttachmentTray, { props: { items: [sending, paused], busy: true, error: null } })
        expect(wrapper.get('[data-attachment-id="draft-sending"]').text()).toContain('Sending to the PC · 7.4 of 18.2 MB')
        expect(wrapper.get('[data-attachment-id="draft-paused"]').text()).toContain('Paused · 256 of 412 KB · resumes when the connection is back')
        expect(wrapper.get('[data-attachment-id="draft-paused"]').html()).not.toContain('animate-spin')
        // dal Pad (25/10): la frase della pausa si legge intera, su due righe, mai tagliata a «ri…»
        const riga = wrapper.get('[data-attachment-id="draft-paused"]').findAll('p').find((p) => p.text().includes('Paused'))!
        expect(riga.classes()).toContain('line-clamp-2')
        expect(riga.classes()).not.toContain('truncate')
        expect(wrapper.get('[data-attachment-id="draft-sending"]').html()).toContain('animate-spin')
    })

    it('B9-3: a draft waiting for its turn says the computer is busy', () => {
        const waiting: TalosMobileAttachmentDraft = { ...ready, id: 'draft-waiting', status: 'ingesting', progress: { phase: 'waiting', sent: 0, total: 4096 } }
        const wrapper = mount(TalosMobileAttachmentTray, { props: { items: [waiting], busy: true, error: null } })
        // B10-4: mentre aspetta, una frase d'attesa (non «riprova fra poco»: l'app sta già riprovando)
        expect(wrapper.get('[data-attachment-id="draft-waiting"]').text()).toContain('The computer is busy with other files')
        expect(wrapper.get('[data-attachment-id="draft-waiting"]').text()).not.toContain('try again')
    })
})
