import { describe, expect, it, vi } from 'vitest'
import { talosFailureMessage } from '@/lib/talosFailureMessage'
import { createTalosDocumentTools } from '@/lib/documents/documentTools'
import { TALOS_DEFAULT_TOOL_PERMISSIONS, executeTalosTool } from '@/lib/tools/executor'

/**
 * Owner 2026-07-26: "il fatto che l'errore si nomina da solo deve essere solo in
 * uno switch debug, spento come in produzione — deve mostrare un errore in
 * linguaggio naturale come prima."
 *
 * So there are two things to hold apart, and this file exists to keep them
 * apart. WHAT the user is shown depends on the switch. WHETHER the model tells
 * the truth does not, and must not — that is what produced the original defect,
 * where a save failed and the user was told it had worked.
 */
function tools(overrides: Record<string, unknown> = {}) {
    return createTalosDocumentTools({
        generate: vi.fn(async () => ({
            format: 'pdf' as const,
            fileName: 'Report.pdf',
            mediaType: 'application/pdf',
            bytes: new Uint8Array([1, 2, 3]),
        })),
        verify: vi.fn(async () => ({ ok: true, detail: '1 page' })),
        save: vi.fn(async () => { throw new Error('TALOS_ATTACHMENT_TYPE_MISMATCH') }),
        diagnostics: () => false,
        ...overrides,
    })
}

function deps() {
    return {
        permissions: { ...TALOS_DEFAULT_TOOL_PERMISSIONS, write: 'allow' as const },
        isToolEnabled: () => true,
        requestConsent: vi.fn(async () => true),
        audit: vi.fn(async () => {}),
        context: { sessionId: 's1' },
    }
}

describe('how a failure is worded', () => {
    it('production: plain words, no internal code', async () => {
        const result = await executeTalosTool(
            tools()[0]!, { format: 'pdf', title: 'Report' }, deps(),
        )
        expect(result.ok).toBe(false)
        expect(result.content).toMatch(/could not be stored/i)
        expect(result.content).not.toContain('TALOS_ATTACHMENT_TYPE_MISMATCH')
    })

    it('with diagnostics on: the same sentence, plus the code that names the step', async () => {
        const result = await executeTalosTool(
            tools({ diagnostics: () => true })[0]!, { format: 'pdf', title: 'Report' }, deps(),
        )
        expect(result.content).toMatch(/could not be stored/i)
        expect(result.content).toContain('TALOS_ATTACHMENT_TYPE_MISMATCH')
    })

    it('EITHER WAY the model is told it was not saved', async () => {
        // The switch decides how much detail is shown. It never decides whether
        // the user is told the truth — a failed save reported as a success is
        // the defect that started all of this.
        for (const diagnostics of [false, true]) {
            const result = await executeTalosTool(
                tools({ diagnostics: () => diagnostics })[0]!, { format: 'pdf', title: 'R' }, deps(),
            )
            expect(result.ok).toBe(false)
            expect(result.content).toMatch(/NOT saved/i)
            expect(result.content).toMatch(/do not invent a cause/i)
        }
    })
})

describe('talosFailureMessage', () => {
    it('returns the plain sentence untouched when diagnostics are off', () => {
        expect(talosFailureMessage('It could not be saved.', new Error('X_CODE'), false))
            .toBe('It could not be saved.')
    })

    it('appends the code when they are on', () => {
        expect(talosFailureMessage('It could not be saved.', new Error('X_CODE'), true))
            .toBe('It could not be saved. [X_CODE]')
    })

    it('does not repeat itself when the code IS the sentence', () => {
        expect(talosFailureMessage('X_CODE', new Error('X_CODE'), true)).toBe('X_CODE')
    })
})
