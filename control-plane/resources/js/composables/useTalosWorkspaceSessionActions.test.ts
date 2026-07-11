// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useTalosWorkspaceSessionActions } from './useTalosWorkspaceSessionActions'
import type { TalosSession } from '../lib/talosTypes'

const session: TalosSession = {
    id: 'session-1',
    title: 'New chat',
    surface: 'chat',
    mode: 'verified_execution',
    persistence_mode: 'persistent',
    metadata: {},
    created_at: '2026-07-11T10:00:00Z',
    updated_at: '2026-07-11T10:00:00Z',
}

function dependencies() {
    const activeSession = ref<TalosSession | null>(session)
    const sessions = ref<TalosSession[]>([session])
    const messages = ref<{ id: string; role: 'user'; content: string }[]>([])
    const uiError = ref<string | null>(null)
    const feedback = vi.fn()
    const createSession = vi.fn(async () => session)
    const deleteSession = vi.fn(async () => undefined)
    const exportSession = vi.fn(async () => ({ schema_version: 1, report_type: 'json', export_status: 'ready' }))

    return {
        activeSession,
        sessions,
        messages,
        loadingMessages: ref(false),
        exportingSession: ref(false),
        sessionExportError: ref<string | null>(null),
        uiError,
        setFeedback: feedback,
        clearPrompt: vi.fn(),
        scrollChat: vi.fn(),
        restoreBrowseForActiveSession: vi.fn(async () => undefined),
        createSession,
        updateSessionTitle: vi.fn(async () => session),
        toggleSessionFavorite: vi.fn(async () => session),
        toggleManagedSessionSelected: vi.fn(async () => session),
        archiveSession: vi.fn(async () => session),
        moveSessionToFolder: vi.fn(async () => session),
        deleteSession,
        copySession: vi.fn(async () => session),
        selectSession: vi.fn(async () => undefined),
        exportSession,
    }
}

describe('useTalosWorkspaceSessionActions', () => {
    it('starts a new chat and resets composer and export state', async () => {
        const deps = dependencies()
        const actions = useTalosWorkspaceSessionActions(deps)

        actions.openSessionExportDialog()
        await actions.startNewChat()

        expect(deps.createSession).toHaveBeenCalledWith('New chat', 'persistent')
        expect(deps.clearPrompt).toHaveBeenCalledOnce()
        expect(actions.exportDialogOpen.value).toBe(false)
        expect(actions.sessionExportResult.value).toBeNull()
        expect(actions.creatingSession.value).toBe(false)
    })

    it('confirms a requested deletion and closes the pending dialog after success', async () => {
        const deps = dependencies()
        const actions = useTalosWorkspaceSessionActions(deps)

        actions.requestDeleteSession(session)
        await actions.confirmDeleteSession()

        expect(deps.deleteSession).toHaveBeenCalledWith('session-1')
        expect(actions.pendingDeleteSession.value).toBeNull()
        expect(deps.setFeedback).toHaveBeenCalledWith('Chat deleted.')
    })

    it('exports the active session and reports the export type', async () => {
        const deps = dependencies()
        const actions = useTalosWorkspaceSessionActions(deps)

        actions.openSessionExportDialog()
        await actions.runSessionExport('json')

        expect(deps.exportSession).toHaveBeenCalledWith('session-1', 'json')
        expect(actions.sessionExportResult.value?.report_type).toBe('json')
        expect(deps.setFeedback).toHaveBeenCalledWith('json exported.')
    })
})
