import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./TalosWorkspace.vue', import.meta.url), 'utf8')

describe('TalosWorkspace chat media ownership', () => {
    it('loads the media panel asynchronously and opens it from the chat surface', () => {
        expect(source).toMatch(/defineAsyncComponent\(\(\) => import\('\.\.\/chat\/TalosChatMediaPanel\.vue'\)\)/)
        expect(source).toContain('@open-chat-media="openChatMedia"')
        expect(source).toContain('<TalosChatMediaPanel')
    })

    it('loads active-session media from the owned API and closes on session change', () => {
        expect(source).toContain(':session-id="activeSession?.id ?? null"')
        expect(source).toContain(':owner-key="workspaceSettings?.id ?? null"')
        expect(source).toContain(':authenticated="authenticated"')
        expect(source).toMatch(/watch\(\(\) => activeSession\.value\?\.id \?\? null,[\s\S]*?chatMediaOpen\.value = false/)
    })
})
