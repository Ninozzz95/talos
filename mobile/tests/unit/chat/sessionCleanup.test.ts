import { describe, expect, it } from 'vitest'
import {
    describeTalosCleanup,
    planTalosSessionCleanup,
    talosCleanupCount,
} from '@/lib/chat/sessionCleanup'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

/**
 * Owner 2026-07-26: deleting a chat left its documents in the Library.
 *
 * Keeping them is a defensible default — a report you asked for may well outlive
 * the conversation that produced it — but it has to be a CHOICE, and it was not
 * even mentioned. The pages a web search collected are different again: nobody
 * wants fifteen sources from a research they have just deleted.
 *
 * The plan is computed by the same code that does the deleting, because a dialog
 * that says "3 files" and then removes 5 is worse than one that says nothing.
 */
function file(id: string, metadata: Record<string, unknown>): TalosLocalVaultFile {
    return {
        id,
        display_name: `${id}.txt`,
        media_type: 'text/plain',
        size_bytes: 1,
        private_uri: `file://${id}`,
        status: 'available',
        trust: 'untrusted',
        sha256: null,
        extracted_text: '',
        failure_code: null,
        metadata,
        created_at: '2026-07-26T10:00:00.000Z',
        updated_at: '2026-07-26T10:00:00.000Z',
    } as TalosLocalVaultFile
}

const FILES = [
    file('doc-here', { origin: 'generated', origin_session_id: 's1' }),
    file('upload-here', { origin: 'uploaded', origin_session_id: 's1' }),
    file('source-here', { origin: 'generated', origin_session_id: 's1', kind: 'web_source' }),
    file('doc-elsewhere', { origin: 'generated', origin_session_id: 's2' }),
    file('orphan', {}),
]

describe('what a deleted chat takes with it', () => {
    it('separates the documents from the pages a search collected', () => {
        const plan = planTalosSessionCleanup(FILES, 's1')
        expect(plan.documents.map((entry) => entry.id).sort()).toEqual(['doc-here', 'upload-here'])
        expect(plan.sources.map((entry) => entry.id)).toEqual(['source-here'])
        expect(talosCleanupCount(plan)).toBe(3)
    })

    it('never touches another conversation, whatever it is', () => {
        const plan = planTalosSessionCleanup(FILES, 's1')
        const ids = [...plan.documents, ...plan.sources].map((entry) => entry.id)
        expect(ids).not.toContain('doc-elsewhere')
        // A file with no origin belongs to nobody, so deleting a chat has no
        // claim on it either.
        expect(ids).not.toContain('orphan')
    })

    it('a file merely ATTACHED here still belongs to the chat that made it', () => {
        // Picking a document from the Library into this conversation must not
        // let deleting this conversation take it from the other one.
        const plan = planTalosSessionCleanup(FILES, 's1', ['doc-elsewhere'])
        expect([...plan.documents, ...plan.sources].map((entry) => entry.id))
            .not.toContain('doc-elsewhere')
    })

    it('describes what will go in plain words', () => {
        expect(describeTalosCleanup(planTalosSessionCleanup(FILES, 's1')))
            .toBe('2 documents and 1 saved page')
    })

    it('says nothing when there is nothing to say', () => {
        const empty = planTalosSessionCleanup(FILES, 'session-with-nothing')
        expect(talosCleanupCount(empty)).toBe(0)
        expect(describeTalosCleanup(empty)).toBe('')
    })

    it('gets the singular right, because "1 documents" reads like a bug', () => {
        const one = planTalosSessionCleanup([FILES[0]!], 's1')
        expect(describeTalosCleanup(one)).toBe('1 document')
    })
})
