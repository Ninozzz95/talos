import { describe, expect, it } from 'vitest'
import {
    parseTalosLibraryPage,
    parseTalosLibraryRemoval,
    parseTalosSessionMedia,
} from './talosLibrary'

function item(overrides: Record<string, unknown> = {}) {
    return {
        id: '019fa97a-745e-71d4-b9e0-ad22300fd06b',
        source_type: 'file',
        source_id: '019fa97a-745e-71d4-b9e0-ad22300fd001',
        kind: 'image',
        origin: 'uploaded',
        title: 'Screenshot.png',
        mime_type: 'image/png',
        byte_size: 1024,
        checksum: 'a'.repeat(64),
        source_url: null,
        content_url: '/api/talos/files/019fa97a-745e-71d4-b9e0-ad22300fd001/content',
        trust_boundary: 'untrusted_upload',
        occurred_at: '2026-07-28T14:00:00.000000Z',
        metadata: { width: 1280, height: 800 },
        chat_count: 1,
        backlinks: [{
            session_id: '019fa97a-745e-71d4-b9e0-ad22300fd002',
            title: 'Research chat',
            relation: 'attachment',
            occurred_at: '2026-07-28T14:01:00.000000Z',
        }],
        can_attach: true,
        ...overrides,
    }
}

describe('talosLibrary contract parser', () => {
    it('accepts and freezes the exact Library page contract', () => {
        const parsed = parseTalosLibraryPage({
            data: [item()],
            meta: {
                count: 1,
                has_more: true,
                next_cursor: 'encrypted-cursor',
            },
        })

        expect(parsed.data[0]).toMatchObject({
            kind: 'image',
            title: 'Screenshot.png',
            canAttach: true,
        })
        expect(parsed.data[0].backlinks[0].title).toBe('Research chat')
        expect(parsed.meta.nextCursor).toBe('encrypted-cursor')
        expect(Object.isFrozen(parsed)).toBe(true)
        expect(Object.isFrozen(parsed.data[0].metadata)).toBe(true)
    })

    it.each([
        ['unknown envelope key', { data: [item()], meta: { count: 1, has_more: false, next_cursor: null }, extra: true }],
        ['private search text', { data: [item({ search_text: 'private' })], meta: { count: 1, has_more: false, next_cursor: null } }],
        ['unknown kind', { data: [item({ kind: 'video' })], meta: { count: 1, has_more: false, next_cursor: null } }],
        ['credentialed source URL', { data: [item({ source_url: 'https://user:secret@example.com/' })], meta: { count: 1, has_more: false, next_cursor: null } }],
        ['public content URL', { data: [item({ content_url: 'https://cdn.example.com/private.png' })], meta: { count: 1, has_more: false, next_cursor: null } }],
        ['duplicate backlink', { data: [item({ backlinks: [item().backlinks[0], item().backlinks[0]] })], meta: { count: 1, has_more: false, next_cursor: null } }],
        ['attach mismatch', { data: [item({ source_type: 'document', can_attach: true })], meta: { count: 1, has_more: false, next_cursor: null } }],
        ['count mismatch', { data: [item()], meta: { count: 2, has_more: false, next_cursor: null } }],
        ['missing cursor', { data: [item()], meta: { count: 1, has_more: true, next_cursor: null } }],
    ])('rejects %s', (_label, candidate) => {
        expect(() => parseTalosLibraryPage(candidate)).toThrow(TypeError)
    })

    it('parses the bounded session-media and removal contracts separately', () => {
        const media = parseTalosSessionMedia({
            data: [item()],
            meta: { count: 1, has_more: false },
        })
        const removal = parseTalosLibraryRemoval({
            data: { removed_count: 2 },
        })

        expect(media.meta.count).toBe(1)
        expect(removal.removedCount).toBe(2)
        expect(() => parseTalosSessionMedia({
            data: [item()],
            meta: { count: 1, has_more: false, next_cursor: null },
        })).toThrow(TypeError)
        expect(() => parseTalosLibraryRemoval({
            data: { removed_count: -1 },
        })).toThrow(TypeError)
    })
})
