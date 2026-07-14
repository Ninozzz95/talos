import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const chatSurface = readFileSync(fileURLToPath(new URL('../workspace/TalosChatSurface.vue', import.meta.url)), 'utf8')
const workspace = readFileSync(fileURLToPath(new URL('../workspace/TalosWorkspace.vue', import.meta.url)), 'utf8')

describe('TALOS browser evidence chat wiring', () => {
    it('connects current browser state and HMI events through the primary chat surface', () => {
        for (const contract of [
            'activeBrowserSession: TalosBrowserSession | null',
            'browserInteractionPending: boolean',
            'browserInteractionLocked: boolean',
            'browserInteractionError: string | null',
            'pendingBrowserInteractionApproval: TalosBrowserHmiChallenge | null',
            'pendingToolApprovals: TalosPendingToolApproval[]',
            'decidingToolApprovalIds: string[]',
            'devBrowserEvidence: boolean',
            'interactBrowserFrame: [frame: TalosBrowserPointerFrame]',
            "confirmBrowserFrameInteraction: [decision: 'approve' | 'reject']",
            "decideToolApproval: [approval: TalosPendingToolApproval, decision: 'approve' | 'reject']",
            ':active-browser-session="activeBrowserSession"',
            ':interaction-locked="browserInteractionLocked"',
            ':current-frame-activity="currentBrowserScreenshotActivity"',
            '@interact="emit(\'interactBrowserFrame\', $event)"',
            '@confirm="emit(\'confirmBrowserFrameInteraction\', $event)"',
            ':pending-tool-approvals="pendingToolApprovals"',
            ':deciding-tool-approval-ids="decidingToolApprovalIds"',
            '@decide-tool-approval="(approval, decision) => emit(\'decideToolApproval\', approval, decision)"',
        ]) {
            expect(chatSurface).toContain(contract)
        }

        for (const contract of [
            ':active-browser-session="activeBrowserSession"',
            ':browser-interaction-pending="browserInteractionPending"',
            ':browser-interaction-locked="browserMode.status === \'recovery_required\'"',
            ':pending-browser-interaction-approval="pendingBrowserInteractionApproval"',
            ':pending-tool-approvals="pendingToolApprovals"',
            ':deciding-tool-approval-ids="decidingApprovalIds"',
            ':dev-browser-evidence="devBrowserEvidence"',
            '@interact-browser-frame="interactWithBrowserFrame"',
            '@confirm-browser-frame-interaction="confirmBrowserFrameInteraction"',
            '@decide-tool-approval="handleToolApprovalDecision"',
        ]) {
            expect(workspace).toContain(contract)
        }
    })

    it('routes development evidence through the single collapsed activity disclosure only', () => {
        expect(chatSurface).toContain(':dev-browser-evidence="devBrowserEvidence"')
        expect(chatSurface).not.toContain('talos-browser-evidence-disclosure')
        expect(chatSurface).not.toContain('browserEvidence(message)')
    })
})
