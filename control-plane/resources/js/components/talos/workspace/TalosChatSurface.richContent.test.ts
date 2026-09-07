// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import type { TalosChatViewportController } from '../../../composables/useTalosChatViewport'
import type { TalosMessageAttachment } from '../../../lib/talosMessageMetadata'
import type { TalosMessage } from '../../../lib/talosTypes'
import TalosChatSurface from './TalosChatSurface.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

async function settle() {
    for (let round = 0; round < 4; round += 1) {
        await nextTick()
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
}

function viewport(): TalosChatViewportController {
    return {
        atLiveEdge: ref(true),
        unseenCount: ref(0),
        composerHeight: ref(160),
        registerThread: vi.fn(),
        registerComposer: vi.fn(),
        centerMessage: vi.fn().mockResolvedValue(undefined),
        followLatest: vi.fn().mockResolvedValue(undefined),
        noteIncomingContent: vi.fn(),
    }
}

function richMessage(): TalosMessage {
    return {
        id: 'message-rich',
        session_id: 'session-1',
        role: 'assistant',
        content: 'Final verified answer.',
        run_id: null,
        metadata: {
            contract: 'talos.message.metadata.v2',
            visible_reasoning: {
                source: 'provider',
                provider: 'anthropic',
                text: 'Compared the allowed evidence.',
                duration_ms: 1250,
            },
            tool_activities: [{
                id: 'tool-1',
                name: 'Read source',
                status: 'succeeded',
                started_at: '2026-07-28T08:00:00Z',
                completed_at: '2026-07-28T08:00:02Z',
            }],
            attachments: [{
                file_id: 'image-1',
                name: 'evidence.png',
                mime_type: 'image/png',
                size_bytes: 128,
                content_url: '/api/talos/files/image-1/content',
            }, {
                file_id: 'document-1',
                name: 'report.pdf',
                mime_type: 'application/pdf',
                size_bytes: 256,
                content_url: '/api/talos/files/document-1/content',
            }],
        },
        created_at: '2026-07-28T08:00:03Z',
    }
}

function plainMessage(
    id: string,
    role: TalosMessage['role'],
    content: string,
): TalosMessage {
    return {
        id,
        session_id: 'session-1',
        role,
        content,
        run_id: null,
        metadata: {},
        created_at: '2026-07-28T08:00:03Z',
    }
}

function mountSurface(
    messages: TalosMessage[],
    onOpenChatMedia: (attachment: TalosMessageAttachment) => void = () => undefined,
) {
    const portal = document.createElement('div')
    portal.id = 'talos-portal-root'
    document.body.append(portal)
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp({
        render: () => h(TalosChatSurface, {
            uiError: null,
            sessionError: null,
            messageError: null,
            modelProfileError: null,
            contextSetError: null,
            loadingMessages: false,
            messages,
            logoUrl: '',
            selectedModelProfileIsUsable: true,
            contextSelected: false,
            contextSetsCount: 0,
            sessionReady: true,
            messageEvidenceReady: false,
            sending: false,
            benchmarkingRunId: null,
            expandedEvidenceMessageIds: [],
            welcomePromptId: null,
            showWelcomeMessage: false,
            showMissionPath: false,
            fullWidthChat: false,
            sensitiveBlur: false,
            messageScale: 1,
            messageStyle: 'sections',
            browserActivities: [],
            browserSnapshot: null,
            activeBrowserSession: null,
            browserInteractionPending: false,
            browserInteractionLocked: false,
            browserInteractionError: null,
            pendingBrowserInteractionApproval: null,
            browserRefFrame: null,
            browserRefTargetsLoading: false,
            browserRefTargetsError: null,
            pendingToolApprovals: [],
            decidingToolApprovalIds: [],
            browserTasks: [],
            browserTaskBusy: false,
            browserTaskError: null,
            browserTaskCommandTargetId: null,
            devBrowserEvidence: false,
            activeTalosSessionId: 'session-1',
            mobile: false,
            mobileWindowPresentation: 'drawer',
            viewport: viewport(),
            onOpenChatMedia,
        }),
    })
    apps.push(app)
    app.mount(container)

    return container
}

describe('TalosChatSurface rich message projection', () => {
    it('renders reasoning, independent tools, answer and authenticated image in order', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('image', {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
        }))
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
        const opened: TalosMessageAttachment[] = []
        const container = mountSurface(
            [richMessage()],
            (attachment) => opened.push(attachment),
        )
        await settle()

        const article = container.querySelector<HTMLElement>('[data-message-id="message-rich"]')!
        await vi.waitFor(() => {
            expect(article.querySelector('[data-testid="talos-reasoning-trigger"]')).not.toBeNull()
            expect(article.querySelector('[data-talos-tool-activity]')).not.toBeNull()
            expect(article.querySelector('[data-testid="talos-message-image"]')).not.toBeNull()
        })
        const reasoning = article.querySelector('[data-testid="talos-reasoning-trigger"]')!
        const tool = article.querySelector('[data-talos-tool-activity]')!
        const answer = article.querySelector('[data-testid="talos-message-content"]')!
        const image = article.querySelector<HTMLButtonElement>('[data-testid="talos-message-image"]')!
        const children = Array.from(article.querySelectorAll('*'))

        expect(children.indexOf(reasoning)).toBeLessThan(children.indexOf(tool))
        expect(children.indexOf(tool)).toBeLessThan(children.indexOf(answer))
        expect(children.indexOf(answer)).toBeLessThan(children.indexOf(image))
        expect(answer.textContent).toContain('Final verified answer.')
        expect(article.textContent).not.toContain('Compared the allowed evidence.')
        expect(article.textContent).toContain('report.pdf')

        image.click()
        await nextTick()
        expect(opened).toHaveLength(1)
        expect(opened[0]?.file_id).toBe('image-1')
    })

    it('groups consecutive same-role messages and renders metadata and actions only at the group end', async () => {
        const container = mountSurface([
            plainMessage('user-1', 'user', 'First detail.'),
            plainMessage('user-2', 'user', 'Second detail.'),
            plainMessage('assistant-1', 'assistant', 'Combined answer.'),
        ])
        await settle()

        const firstUser = container.querySelector<HTMLElement>('[data-message-id="user-1"]')!
        const secondUser = container.querySelector<HTMLElement>('[data-message-id="user-2"]')!
        const assistant = container.querySelector<HTMLElement>('[data-message-id="assistant-1"]')!

        expect(firstUser.dataset.grouped).toBeUndefined()
        expect(secondUser.dataset.grouped).toBe('true')
        expect(assistant.dataset.grouped).toBeUndefined()
        expect(firstUser.querySelector('.talos-message-meta')).toBeNull()
        expect(firstUser.querySelector('.talos-message-actions')).toBeNull()
        expect(secondUser.querySelector('.talos-message-meta')).not.toBeNull()
        expect(secondUser.querySelector('.talos-message-actions')).not.toBeNull()
        expect(assistant.querySelector('.talos-message-meta')).not.toBeNull()
        expect(assistant.querySelector('.talos-message-actions')).not.toBeNull()
        expect(container.querySelectorAll('.talos-message-meta')).toHaveLength(2)
        expect(container.querySelectorAll('.talos-message-actions')).toHaveLength(2)
    })
})
