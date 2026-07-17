import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { talosFetch } from '../lib/api'
import { useTalosToolApprovals } from './useTalosToolApprovals'

vi.mock('../lib/api', async (importOriginal) => ({
    ...await importOriginal<typeof import('../lib/api')>(),
    talosFetch: vi.fn(),
}))

const talosFetchMock = vi.mocked(talosFetch)

function pendingApproval(overrides: Record<string, unknown> = {}) {
    return {
        id: 'call-1',
        turn_id: 'turn-1',
        run_id: 'run-1',
        tool_name: 'browser_click',
        risk: 'high',
        capability: 'browser.write',
        status: 'pending',
        actionable: true,
        stale_reason: null,
        plan_hash: `sha256:${'a'.repeat(64)}`,
        browser_session_id: 'browser-1',
        snapshot_artifact_id: 'artifact-1',
        snapshot_id: 'snapshot-1',
        state_version: 4,
        evidence_hash: `sha256:${'b'.repeat(64)}`,
        expected_effect: 'Dismiss the cookie banner.',
        target: {
            ref: 'r1',
            role: 'button',
            name: 'Accept all',
            visible: true,
        },
        url: 'https://example.com',
        title: 'Example',
        ...overrides,
    }
}

function uploadApproval(overrides: Record<string, unknown> = {}) {
    return pendingApproval({
        tool_name: 'browser_file_upload',
        risk: 'critical',
        capability: 'browser.upload',
        expected_effect: 'Upload the listed Vault files through the selected browser file control and capture verified post-action evidence.',
        target: {
            ref: 'r-upload',
            role: 'button',
            name: 'Upload resume',
            visible: true,
        },
        files: [{
            file_id: 'file-1',
            name: 'resume.pdf',
            mime_type: 'application/pdf',
            size_bytes: 2048,
            sha256: `sha256:${'c'.repeat(64)}`,
        }],
        ...overrides,
    })
}

describe('useTalosToolApprovals', () => {
    beforeEach(() => {
        talosFetchMock.mockReset()
    })

    it('hydrates exact pending approvals for the active chat without issuing a write', async () => {
        talosFetchMock.mockResolvedValue({ data: [pendingApproval()] } as never)
        const activeSessionId = ref<string | null>('session-1')
        const approvals = useTalosToolApprovals(activeSessionId)

        await approvals.hydratePendingApprovals()

        expect(talosFetchMock).toHaveBeenCalledWith('/api/talos/sessions/session-1/pending-tool-approvals')
        expect(approvals.pendingApprovals.value).toEqual([pendingApproval()])
        expect(approvals.approvalError.value).toBeNull()
    })

    it('normalizes sensitive browser upload approvals but rejects path-shaped file metadata', async () => {
        talosFetchMock.mockResolvedValue({
            data: [
                uploadApproval(),
                uploadApproval({
                    id: 'call-path',
                    files: [{
                        file_id: 'file-2',
                        name: '../secret.txt',
                        mime_type: 'text/plain',
                        size_bytes: 10,
                        sha256: `sha256:${'d'.repeat(64)}`,
                    }],
                }),
            ],
        } as never)
        const approvals = useTalosToolApprovals(ref('session-1'))

        await approvals.hydratePendingApprovals()

        expect(approvals.pendingApprovals.value).toEqual([uploadApproval()])
    })

    it('posts the exact plan hash and replaces pending state from the resume response', async () => {
        const approval = pendingApproval()
        const completedResponse = {
            text: 'The cookie banner was dismissed.',
            agent_turn: { id: 'turn-1', status: 'completed', failure_code: null },
            pending_approvals: [],
            assistant_message: {
                id: 'assistant-1',
                session_id: 'session-1',
                role: 'assistant',
                content: 'The cookie banner was dismissed.',
                created_at: '2026-07-14T12:00:00Z',
            },
        }
        talosFetchMock.mockResolvedValue(completedResponse as never)
        const approvals = useTalosToolApprovals(ref('session-1'))
        approvals.replacePendingApprovals([approval])

        const response = await approvals.decideToolApproval(approval, 'approve')

        expect(talosFetchMock).toHaveBeenCalledWith('/api/talos/agent-turns/turn-1/approvals/call-1', {
            method: 'POST',
            body: JSON.stringify({
                decision: 'approve',
                plan_hash: approval.plan_hash,
            }),
            validationMessage: 'TALOS could not apply this browser approval.',
        })
        expect(response).toEqual(completedResponse)
        expect(approvals.pendingApprovals.value).toEqual([])
        expect(approvals.decidingApprovalIds.value).toEqual([])
    })

    it('fails closed for malformed hydration and stale non-actionable approvals', async () => {
        talosFetchMock.mockResolvedValue({
            data: [
                pendingApproval({ plan_hash: 'not-a-digest' }),
                pendingApproval({
                    id: 'call-stale',
                    status: 'stale',
                    actionable: false,
                    stale_reason: 'TALOS_BROWSER_STALE_EVIDENCE',
                }),
            ],
        } as never)
        const approvals = useTalosToolApprovals(ref('session-1'))

        await approvals.hydratePendingApprovals()
        await nextTick()

        expect(approvals.pendingApprovals.value).toEqual([
            pendingApproval({
                id: 'call-stale',
                status: 'stale',
                actionable: false,
                stale_reason: 'TALOS_BROWSER_STALE_EVIDENCE',
            }),
        ])
        await expect(approvals.decideToolApproval(approvals.pendingApprovals.value[0]!, 'approve'))
            .rejects.toThrow('This browser approval is stale and cannot be executed.')
        expect(talosFetchMock).toHaveBeenCalledTimes(1)
    })

    it('does not project an approval response into a different chat selected mid-request', async () => {
        let resolveDecision!: (value: unknown) => void
        talosFetchMock.mockImplementation(() => new Promise((resolve) => {
            resolveDecision = resolve
        }) as never)
        const activeSessionId = ref<string | null>('session-1')
        const approvals = useTalosToolApprovals(activeSessionId)
        const current = pendingApproval()
        approvals.replacePendingApprovals([current])

        const decision = approvals.decideToolApproval(current, 'approve')
        activeSessionId.value = 'session-2'
        approvals.clearPendingApprovals()
        resolveDecision({ pending_approvals: [pendingApproval({ id: 'call-from-session-1' })] })
        await decision

        expect(approvals.pendingApprovals.value).toEqual([])
        expect(approvals.approvalError.value).toBeNull()
    })
})
