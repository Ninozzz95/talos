import { describe, expect, it } from 'vitest'
import {
    buildTalosMobileContextManifestExport,
    buildTalosMobileEvidencePack,
    buildTalosMobileMarkdownExport,
    buildTalosMobileBenchmarkReadiness,
    TALOS_MOBILE_EXPORT_FORMATS,
    type TalosMobileSessionExportInput,
} from '@/lib/chat/sessionExport'

// F4-#16 — desktop-parity chat export, generated LOCALLY (no control plane):
// same report_type strings and format set as TalosSessionExportService so an
// exported artifact reads identically across the products.

function input(overrides: Partial<TalosMobileSessionExportInput> = {}): TalosMobileSessionExportInput {
    return {
        session: {
            id: 'session-1',
            title: 'Analisi mercato',
            surface: 'chat',
            mode: 'answer_only',
            persistence_mode: 'persistent',
            active_model_profile_id: 'gemini:gemini-live',
            metadata: {},
            created_at: '2026-07-23T10:00:00.000Z',
            updated_at: '2026-07-23T10:05:00.000Z',
        },
        messages: [
            {
                id: 'm1', session_id: 'session-1', role: 'user', content: 'Analizza il mercato EV',
                state: 'persisted', model_profile_id: null, run_id: null, ordinal: 0,
                metadata: {}, created_at: '2026-07-23T10:00:10.000Z', updated_at: '2026-07-23T10:00:10.000Z',
            },
            {
                id: 'm2', session_id: 'session-1', role: 'assistant', content: 'Il mercato EV cresce.',
                state: 'persisted', model_profile_id: 'gemini:gemini-live', run_id: null, ordinal: 1,
                metadata: {}, created_at: '2026-07-23T10:00:20.000Z', updated_at: '2026-07-23T10:00:20.000Z',
            },
        ],
        activities: [{
            id: 'a1', session_id: 'session-1', message_id: 'm2', operation: 'navigate',
            status: 'succeeded', payload: {}, evidence: { contract: 'talos.mobile.browser.evidence.v1' },
            created_at: '2026-07-23T10:00:15.000Z', updated_at: '2026-07-23T10:00:16.000Z',
        }],
        attachments: [{
            id: 'b1', session_id: 'session-1', message_id: 'm1', vault_file_id: 'vault-9',
            grant_id: 'grant-9', display_name: 'report.pdf', media_type: 'application/pdf',
            size_bytes: 1024, permissions: ['model.read'], grant_status: 'active',
            created_at: '2026-07-23T10:00:05.000Z',
            sha256: 'c'.repeat(64),
        }],
        exported_at: '2026-07-23T11:00:00.000Z',
        ...overrides,
    }
}

describe('buildTalosMobileEvidencePack (F4-#16)', () => {
    it('produces the desktop-parity envelope with messages, activities, manifest and transcript', () => {
        const pack = buildTalosMobileEvidencePack(input())
        expect(pack.schema_version).toBe(1)
        expect(pack.report_type).toBe('talos_session_export')
        expect(pack.export_status).toBe('complete')
        expect(pack.exported_at).toBe('2026-07-23T11:00:00.000Z')
        expect(pack.available_formats).toEqual([...TALOS_MOBILE_EXPORT_FORMATS])
        expect(pack.session).toMatchObject({ id: 'session-1', title: 'Analisi mercato' })
        expect(pack.messages).toHaveLength(2)
        expect(pack.tool_activities).toEqual([
            expect.objectContaining({ id: 'a1', operation: 'navigate', status: 'succeeded' }),
        ])
        expect(pack.markdown_transcript).toContain('# TALOS Session Export')
        expect(pack.benchmark_readiness.ready).toBe(true)
    })

    it('never leaks storage paths in the context manifest', () => {
        const pack = buildTalosMobileEvidencePack(input())
        const serialized = JSON.stringify(pack.context_manifest)
        expect(serialized).toContain('report.pdf')
        expect(serialized).toContain('c'.repeat(64))
        expect(serialized).not.toContain('private_uri')
        expect(serialized).not.toContain('talos-vault')
    })
})

describe('markdown / manifest exports', () => {
    it('renders the markdown transcript with role headers in message order', () => {
        const markdown = buildTalosMobileMarkdownExport(input())
        expect(markdown.report_type).toBe('talos_session_markdown_export')
        expect(markdown.content_type).toBe('text/markdown')
        const content = markdown.content
        expect(content.indexOf('### USER')).toBeGreaterThan(-1)
        expect(content.indexOf('### USER')).toBeLessThan(content.indexOf('### ASSISTANT'))
        expect(content).toContain('Analizza il mercato EV')
    })

    it('exports the context manifest standalone', () => {
        const manifest = buildTalosMobileContextManifestExport(input())
        expect(manifest.report_type).toBe('talos_context_manifest_export')
        expect(manifest.session_id).toBe('session-1')
        expect(JSON.stringify(manifest.context_manifest)).toContain('report.pdf')
    })
})

describe('benchmark readiness', () => {
    it('is ready with prompt and reply present and carries deterministic hashes', () => {
        const readiness = buildTalosMobileBenchmarkReadiness(input())
        expect(readiness.ready).toBe(true)
        expect(readiness.missing).toEqual([])
        expect(readiness.scenario).toMatchObject({
            schema_version: 1,
            scenario_type: 'talos_session_benchmark_scenario',
            session_id: 'session-1',
            prompt: 'Analizza il mercato EV',
            model: 'gemini-live',
            provider: 'gemini',
        })
        expect(readiness.scenario?.prompt_hash).toMatch(/^[0-9a-f]{64}$/)
        expect(readiness.scenario?.context_hash).toMatch(/^[0-9a-f]{64}$/)
        expect(buildTalosMobileBenchmarkReadiness(input()).scenario?.prompt_hash)
            .toBe(readiness.scenario?.prompt_hash)
    })

    it('fails closed without a completed exchange', () => {
        const readiness = buildTalosMobileBenchmarkReadiness(input({
            messages: [{
                id: 'm1', session_id: 'session-1', role: 'user', content: 'Solo prompt',
                state: 'persisted', model_profile_id: null, run_id: null, ordinal: 0,
                metadata: {}, created_at: '2026-07-23T10:00:10.000Z', updated_at: '2026-07-23T10:00:10.000Z',
            }],
        }))
        expect(readiness.ready).toBe(false)
        expect(readiness.missing).toContain('assistant_reply')
        expect(readiness.scenario).toBeUndefined()
    })
})

/**
 * Defect #5 (owner decision): the reasoning is persisted with the message and
 * "entra anche nell'export" — an export that dropped it would carry half the
 * record, and the trace is the half that explains the answer.
 */
describe('reasoning in the export (defect #5)', () => {
    // Owner decision: the trace is persisted with the message and "entra anche
    // nell'export" — an export without it carries half the record, and the
    // missing half is the one that explains the answer.
    function withReasoning(): TalosMobileSessionExportInput {
        const base = input()
        return {
            ...base,
            messages: base.messages.map((message) => (message.role === 'assistant'
                ? { ...message, metadata: { reasoning: 'Prima ho valutato A.\nPoi ho scelto B.' } }
                : message)),
        }
    }

    it('carries the trace in the evidence pack and quotes it in the transcript', () => {
        const pack = buildTalosMobileEvidencePack(withReasoning())
        expect(pack.messages[1]).toMatchObject({ reasoning: 'Prima ho valutato A.\nPoi ho scelto B.' })
        const markdown = buildTalosMobileMarkdownExport(withReasoning()).content
        expect(markdown).toContain('> **Reasoning**')
        expect(markdown).toContain('> Prima ho valutato A.')
        expect(markdown).toContain('> Poi ho scelto B.')
    })

    it('says nothing about reasoning when the message has none', () => {
        const pack = buildTalosMobileEvidencePack(input())
        expect(pack.messages[1]).not.toHaveProperty('reasoning')
        expect(buildTalosMobileMarkdownExport(input()).content).not.toContain('Reasoning')
    })
})
