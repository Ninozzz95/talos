import { describe, expect, it } from 'vitest'
import {
    TALOS_MESSAGE_METADATA_CONTRACT,
    parseTalosMessageMetadata,
} from './talosMessageMetadata'

describe('parseTalosMessageMetadata', () => {
    it('projects canonical attachments, visible reasoning, tool clocks and metrics', () => {
        const parsed = parseTalosMessageMetadata({
            contract: TALOS_MESSAGE_METADATA_CONTRACT,
            attachments: [{
                file_id: 'file-1',
                name: 'evidence.png',
                mime_type: 'image/png',
                size_bytes: 128,
                content_url: '/api/talos/files/file-1/content',
            }],
            visible_reasoning: {
                source: 'provider',
                provider: 'openai',
                text: 'Compared the available evidence.',
                duration_ms: 420,
            },
            tool_activities: [{
                id: 'tool-1',
                name: 'Browser snapshot',
                status: 'succeeded',
                started_at: '2026-07-28T10:00:00Z',
                completed_at: '2026-07-28T10:00:01Z',
            }],
            usage: { input_tokens: 12, output_tokens: 8 },
            timing: { provider_ms: 420 },
            browser_activities: [{ id: 'browser-1' }],
            used_context: [{ file_id: 'context-1' }],
        })

        expect(parsed.contract).toBe(TALOS_MESSAGE_METADATA_CONTRACT)
        expect(parsed.attachments[0]).toEqual({
            file_id: 'file-1',
            name: 'evidence.png',
            mime_type: 'image/png',
            size_bytes: 128,
            content_url: '/api/talos/files/file-1/content',
        })
        expect(parsed.visibleReasoning?.text).toBe('Compared the available evidence.')
        expect(parsed.toolActivities[0]?.id).toBe('tool-1')
        expect(parsed.usage).toEqual({ input_tokens: 12, output_tokens: 8 })
        expect(parsed.browserActivities).toEqual([{ id: 'browser-1' }])
        expect(parsed.usedContext).toEqual([{ file_id: 'context-1' }])
        expect(Object.isFrozen(parsed)).toBe(true)
        expect(Object.isFrozen(parsed.attachments)).toBe(true)
    })

    it('fails closed per field without breaking legacy message metadata', () => {
        const parsed = parseTalosMessageMetadata({
            summary: 'legacy_summary',
            attachments: [
                { file_id: 'duplicate', name: 'first.png', content_url: '/api/talos/files/duplicate/content' },
                { file_id: 'duplicate', name: 'second.png', content_url: '/api/talos/files/duplicate/content' },
            ],
            visible_reasoning: {
                source: 'provider',
                text: '',
                duration_ms: -1,
            },
            tool_activities: [{
                id: 'tool-1',
                name: 'Invalid clock',
                status: 'succeeded',
                started_at: '2026-07-28T10:00:02Z',
                completed_at: '2026-07-28T10:00:01Z',
            }],
            usage: { input_tokens: -1 },
            browser_activities: [{ id: 'legacy-browser' }],
        })

        expect(parsed.contract).toBeNull()
        expect(parsed.attachments).toEqual([])
        expect(parsed.visibleReasoning).toBeNull()
        expect(parsed.toolActivities).toEqual([])
        expect(parsed.usage).toBeNull()
        expect(parsed.browserActivities).toEqual([{ id: 'legacy-browser' }])
        expect(parsed.raw.summary).toBe('legacy_summary')
    })

    it('never projects provider-private continuation fields as visible reasoning', () => {
        const parsed = parseTalosMessageMetadata({
            encrypted_content: 'opaque-openai-state',
            redacted_thinking: 'opaque-anthropic-state',
            signature: 'opaque-signature',
            thought_signature: 'opaque-gemini-state',
            provider_state: { reasoning_content: 'private continuation' },
        })

        expect(parsed.visibleReasoning).toBeNull()
        expect(JSON.stringify(parsed)).not.toContain('opaque-')
        expect(JSON.stringify(parsed)).not.toContain('private continuation')
    })

    it('returns an empty immutable projection for non-object metadata', () => {
        for (const value of [null, [], 'metadata', 3]) {
            const parsed = parseTalosMessageMetadata(value)
            expect(parsed.attachments).toEqual([])
            expect(parsed.visibleReasoning).toBeNull()
            expect(parsed.toolActivities).toEqual([])
            expect(parsed.raw).toEqual({})
            expect(Object.isFrozen(parsed)).toBe(true)
        }
    })
})
