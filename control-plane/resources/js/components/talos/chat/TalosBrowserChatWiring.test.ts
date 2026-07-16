import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const chatSurface = readFileSync(fileURLToPath(new URL('../workspace/TalosChatSurface.vue', import.meta.url)), 'utf8')
const workspace = readFileSync(fileURLToPath(new URL('../workspace/TalosWorkspace.vue', import.meta.url)), 'utf8')
const browserCard = readFileSync(fileURLToPath(new URL('./TalosBrowserCard.vue', import.meta.url)), 'utf8')
const browserActivity = readFileSync(fileURLToPath(new URL('./TalosBrowserActivity.vue', import.meta.url)), 'utf8')

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
            'browserTasks: TalosBrowserTask[]',
            'browserTaskBusy: boolean',
            'browserTaskError: string | null',
            'browserTaskCommandTargetId: string | null',
            'devBrowserEvidence: boolean',
            'interactBrowserFrame: [frame: TalosBrowserPointerFrame]',
            "confirmBrowserFrameInteraction: [decision: 'approve' | 'reject']",
            "decideToolApproval: [approval: TalosPendingToolApproval, decision: 'approve' | 'reject']",
            'cancelBrowserTask: [taskId: string]',
            ':active-browser-session="activeBrowserSession"',
            ':interaction-locked="browserInteractionLocked"',
            '<TalosBrowserCard',
            'buildTalosBrowserCardPlacements',
            '@interact="emit(\'interactBrowserFrame\', $event)"',
            '@confirm="emit(\'confirmBrowserFrameInteraction\', $event)"',
            ':pending-tool-approvals="pendingApprovalsForPlacement(placement)"',
            ':deciding-tool-approval-ids="decidingToolApprovalIds"',
            ':task="placement.task"',
            ':browser-task-busy="placementOwnsTaskCommand(placement) && browserTaskBusy"',
            ':browser-task-error="placementOwnsTaskCommand(placement) ? browserTaskError : null"',
            ':browser-task-command-pending="browserTaskBusy"',
            '@cancel-task="emit(\'cancelBrowserTask\', $event)"',
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
            ':browser-tasks="browserTasks"',
            ':browser-task-busy="browserTaskBusy"',
            ':browser-task-error="browserTaskError"',
            ':browser-task-command-target-id="browserTaskCommandTargetId"',
            ':dev-browser-evidence="devBrowserEvidence"',
            '@interact-browser-frame="interactWithBrowserFrame"',
            '@confirm-browser-frame-interaction="confirmBrowserFrameInteraction"',
            '@decide-tool-approval="handleToolApprovalDecision"',
            '@cancel-browser-task="cancelBrowserTask"',
        ]) {
            expect(workspace).toContain(contract)
        }

        expect(chatSurface.match(/<TalosBrowserActivity\b/g)).toHaveLength(1)
        expect(chatSurface).toContain('data-browser-session-activity')
        expect(chatSurface).toContain('data-message-role="browser"')
        expect(chatSurface).toContain(':activities="unplacedCurrentBrowserActivities"')
        expect(chatSurface).toContain(':pending-tool-approvals="unplacedCurrentBrowserApprovals"')
        expect(chatSurface).toContain('unplacedBrowserActivities(')
        expect(chatSurface).toContain('unplacedBrowserApprovals(')
        expect(chatSurface).toContain('!messages.length && !hasUnplacedBrowserSessionActivity')
        expect(browserActivity).toContain('cancelTask: [taskId: string]')
        expect(browserActivity).toContain("@click=\"emit('cancelTask', browserTask.id)\"")
        expect(browserCard).toContain('cancelTask: [taskId: string]')
        expect(browserCard).toContain("@cancel-task=\"emit('cancelTask', $event)\"")
    })

    it('routes development evidence through the single collapsed activity disclosure only', () => {
        expect(chatSurface).toContain(':dev-browser-evidence="devBrowserEvidence"')
        expect(chatSurface).not.toContain('talos-browser-evidence-disclosure')
        expect(chatSurface).not.toContain('browserEvidence(message)')
    })

    it('routes one responsive authority and the persisted viewer presentation to every per-turn frame', () => {
        for (const contract of [
            'mobile: boolean',
            'mobileWindowPresentation: TalosMobileWindowPresentation',
            ':mobile="mobile"',
            ':mobile-window-presentation="mobileWindowPresentation"',
        ]) {
            expect(chatSurface).toContain(contract)
        }

        for (const contract of [
            'mobile?: boolean',
            'mobileWindowPresentation?: TalosMobileWindowPresentation',
            ':mobile="mobile"',
            ':mobile-window-presentation="mobileWindowPresentation"',
        ]) {
            expect(browserCard).toContain(contract)
            expect(browserActivity).toContain(contract)
        }

        expect(workspace).toContain(':mobile="breakpoint !== \'desktop\'"')
        expect(workspace).toContain(':mobile-window-presentation="mobileWindowPresentation"')
    })
})
