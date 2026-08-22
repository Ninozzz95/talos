// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileBrowserInteractiveFrame from '@/components/chat/TalosMobileBrowserInteractiveFrame.vue'
import type { TalosMobileBrowserEvidenceArtifact } from '@/lib/browser/browserContracts'

const artifacts: TalosMobileBrowserEvidenceArtifact[] = [
    {
        id: 'artifact-1', type: 'screenshot', media_type: 'image/png',
        preview_uri: 'data:image/png;base64,iVBORw0KGgo=', sha256: 'a'.repeat(64),
        width: 1000, height: 500, source_url: 'https://example.com/one',
        created_at: '2026-07-22T12:00:00.000Z',
    },
    {
        id: 'artifact-2', type: 'screenshot', media_type: 'image/png',
        preview_uri: 'data:image/png;base64,iVBORw0KGgo=', sha256: 'b'.repeat(64),
        width: 1000, height: 500, source_url: 'https://example.com/two',
        created_at: '2026-07-22T12:00:01.000Z',
    },
]

describe('TalosMobileBrowserInteractiveFrame', () => {
    it('opens an accessible Dialog, navigates captures and clamps zoom', async () => {
        const wrapper = mount(TalosMobileBrowserInteractiveFrame, {
            attachTo: document.body,
            props: { artifacts, interactionAvailable: false, retryArtifactId: null },
        })
        wrapper.vm.openArtifact('artifact-1')
        await flushPromises()

        const frame = document.body.querySelector('[data-testid="talos-mobile-browser-frame"]')!
        expect(frame).not.toBeNull()
        expect(frame.textContent).toContain('Capture 1 of 2')
        expect(frame.textContent).toContain('Trusted interaction unavailable')

        const zoomIn = document.body.querySelector('[aria-label="Zoom browser capture in"]') as HTMLButtonElement
        for (let index = 0; index < 10; index += 1) zoomIn.click()
        await flushPromises()
        expect(frame.getAttribute('data-zoom')).toBe('4')
        ;(document.body.querySelector('[aria-label="Next browser capture"]') as HTMLButtonElement).click()
        await flushPromises()
        expect(frame.textContent).toContain('Capture 2 of 2')
        wrapper.unmount()
    })

    it('emits retry for the current verified frame and never pointer-interacts while locked', async () => {
        const wrapper = mount(TalosMobileBrowserInteractiveFrame, {
            attachTo: document.body,
            props: { artifacts, interactionAvailable: false, retryArtifactId: 'artifact-2' },
        })
        wrapper.vm.openArtifact('artifact-2')
        await flushPromises()
        ;(document.body.querySelector('[aria-label="Retry browser action on current frame"]') as HTMLButtonElement).click()
        ;(document.body.querySelector('[data-testid="talos-mobile-browser-frame-image"]') as HTMLImageElement)
            .dispatchEvent(new MouseEvent('click', { clientX: 10, clientY: 10, bubbles: true }))
        await flushPromises()

        expect(wrapper.emitted('retry')).toEqual([['artifact-2']])
        expect(wrapper.emitted('interact')).toBeUndefined()
        wrapper.unmount()
    })
})
