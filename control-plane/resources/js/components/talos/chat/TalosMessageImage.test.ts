// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import TalosMessageImage from './TalosMessageImage.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

describe('TalosMessageImage', () => {
    it('loads the authenticated source and exposes a 44-pixel lightbox target', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('image', {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
        }))
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
        const opened: string[] = []
        const container = document.createElement('div')
        document.body.append(container)
        const app = createApp({
            render: () => h(TalosMessageImage, {
                attachment: {
                    file_id: 'file-1',
                    name: 'evidence.png',
                    mime_type: 'image/png',
                    size_bytes: 128,
                    content_url: '/api/talos/files/file-1/content',
                },
                onOpen: () => opened.push('open'),
            }),
        })
        apps.push(app)
        app.mount(container)
        await nextTick()
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
        await nextTick()

        const button = container.querySelector<HTMLButtonElement>('[data-testid="talos-message-image"]')
        const image = button?.querySelector<HTMLImageElement>('img')
        expect(button?.className).toContain('min-h-11')
        expect(button?.getAttribute('aria-label')).toContain('evidence.png')
        expect(image?.src).toContain('blob:image')
        expect(image?.alt).toBe('evidence.png')
        button?.click()
        expect(opened).toEqual(['open'])
    })

    it('shows a non-interactive fallback when media loading fails', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('missing', { status: 404 }))
        const container = document.createElement('div')
        document.body.append(container)
        const app = createApp({
            render: () => h(TalosMessageImage, {
                attachment: {
                    file_id: 'file-2',
                    name: 'missing.png',
                    mime_type: 'image/png',
                    content_url: '/api/talos/files/file-2/content',
                },
            }),
        })
        apps.push(app)
        app.mount(container)
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
        await nextTick()

        expect(container.querySelector('[role="status"]')?.textContent).toContain('missing.png')
        expect(container.querySelector('img')).toBeNull()
    })
})
