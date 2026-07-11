import { nextTick, ref, type Readonly, type Ref } from 'vue'
import type { TalosSessionPersistenceMode } from './useTalosSessions'
import { sessionChatState } from './useTalosSessions'
import type { TalosMessage, TalosSession, TalosSessionExportFormat, TalosSessionExportPayload } from '../lib/talosTypes'

export type TalosWorkspaceSessionActionDependencies = {
    activeSession: Readonly<Ref<TalosSession | null>>
    messages: Readonly<Ref<TalosMessage[]>>
    loadingMessages: Readonly<Ref<boolean>>
    exportingSession: Readonly<Ref<boolean>>
    sessionExportError: Readonly<Ref<string | null>>
    uiError: Ref<string | null>
    setFeedback: (message: string) => void
    clearPrompt: () => void
    scrollChat: () => void
    restoreBrowseForActiveSession: () => Promise<void>
    createSession: (title: string, persistenceMode: TalosSessionPersistenceMode) => Promise<TalosSession>
    updateSessionTitle: (sessionId: string, title: string) => Promise<TalosSession>
    toggleSessionFavorite: (session: TalosSession) => Promise<TalosSession>
    toggleManagedSessionSelected: (session: TalosSession) => Promise<TalosSession>
    archiveSession: (session: TalosSession) => Promise<TalosSession>
    moveSessionToFolder: (session: TalosSession, folder: string) => Promise<TalosSession>
    deleteSession: (sessionId: string) => Promise<void>
    copySession: (session: TalosSession) => Promise<TalosSession>
    selectSession: (session: TalosSession) => Promise<void>
    exportSession: (sessionId: string, format: TalosSessionExportFormat) => Promise<TalosSessionExportPayload>
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

function titleFromPrompt(value: string) {
    const title = value.trim().replace(/\s+/g, ' ')
    if (!title) return 'New chat'
    return title.length > 64 ? `${title.slice(0, 61)}...` : title
}

export function useTalosWorkspaceSessionActions(deps: TalosWorkspaceSessionActionDependencies) {
    const sessionPersistenceMode = ref<TalosSessionPersistenceMode>('persistent')
    const creatingSession = ref(false)
    const pendingDeleteSession = ref<TalosSession | null>(null)
    const deletingSession = ref(false)
    const exportDialogOpen = ref(false)
    const sessionExportResult = ref<TalosSessionExportPayload | null>(null)

    function resetExportState() {
        sessionExportResult.value = null
        exportDialogOpen.value = false
    }

    async function startNewChat() {
        if (creatingSession.value) return
        creatingSession.value = true
        deps.uiError.value = null
        try {
            await deps.createSession('New chat', sessionPersistenceMode.value)
            deps.clearPrompt()
            resetExportState()
            await nextTick()
            deps.scrollChat()
        } catch (error) {
            deps.uiError.value = errorMessage(error, 'TALOS could not create a chat session.')
        } finally {
            creatingSession.value = false
        }
    }

    async function chooseSession(session: TalosSession) {
        if (deps.activeSession.value?.id === session.id || deps.loadingMessages.value) return
        deps.uiError.value = null
        try {
            await deps.selectSession(session)
            await deps.restoreBrowseForActiveSession()
            sessionPersistenceMode.value = session.persistence_mode === 'temporary' ? 'temporary' : 'persistent'
            resetExportState()
            await nextTick()
            deps.scrollChat()
        } catch (error) {
            deps.uiError.value = errorMessage(error, 'TALOS could not load this session.')
        }
    }

    async function renameChatSession(session: TalosSession, title: string) {
        const nextTitle = title.trim()
        if (!nextTitle) {
            deps.uiError.value = 'Chat name cannot be empty.'
            return
        }
        try {
            deps.uiError.value = null
            await deps.updateSessionTitle(session.id, nextTitle)
            deps.setFeedback('Chat renamed.')
        } catch (error) {
            deps.uiError.value = errorMessage(error, 'TALOS could not rename this chat.')
        }
    }

    async function favoriteChatSession(session: TalosSession) {
        try {
            deps.uiError.value = null
            const updated = await deps.toggleSessionFavorite(session)
            deps.setFeedback(sessionChatState(updated).favorite ? 'Chat added to Favorites.' : 'Chat removed from Favorites.')
        } catch (error) {
            deps.uiError.value = errorMessage(error, 'TALOS could not update the favorite state.')
        }
    }

    async function toggleChatSelection(session: TalosSession) {
        try {
            deps.uiError.value = null
            await deps.toggleManagedSessionSelected(session)
            deps.setFeedback('Chat selection updated.')
        } catch (error) {
            deps.uiError.value = errorMessage(error, 'TALOS could not update the chat selection.')
        }
    }

    async function archiveChatSession(session: TalosSession) {
        try {
            deps.uiError.value = null
            await deps.archiveSession(session)
            deps.setFeedback('Chat archived.')
        } catch (error) {
            deps.uiError.value = errorMessage(error, 'TALOS could not archive this chat.')
        }
    }

    async function moveChatSession(session: TalosSession, folder: string) {
        try {
            deps.uiError.value = null
            await deps.moveSessionToFolder(session, folder)
            deps.setFeedback(folder.trim() ? `Chat moved to ${folder.trim()}.` : 'Chat moved to Recent.')
        } catch (error) {
            deps.uiError.value = errorMessage(error, 'TALOS could not move this chat.')
        }
    }

    async function deleteChatSession(session: TalosSession) {
        try {
            deps.uiError.value = null
            await deps.deleteSession(session.id)
            deps.setFeedback('Chat deleted.')
            return true
        } catch (error) {
            deps.uiError.value = errorMessage(error, 'TALOS could not delete this chat.')
            return false
        }
    }

    function requestDeleteSession(session: TalosSession) {
        pendingDeleteSession.value = session
    }

    async function confirmDeleteSession() {
        if (!pendingDeleteSession.value || deletingSession.value) return
        deletingSession.value = true
        if (await deleteChatSession(pendingDeleteSession.value)) pendingDeleteSession.value = null
        deletingSession.value = false
    }

    async function copyChatSession(session: TalosSession) {
        try {
            deps.uiError.value = null
            await deps.copySession(session)
            deps.setFeedback('Chat copied.')
        } catch (error) {
            deps.uiError.value = errorMessage(error, 'TALOS could not copy this chat.')
        }
    }

    async function ensureSessionForPrompt(message: string) {
        const desiredPersistenceMode = sessionPersistenceMode.value
        const activePersistenceMode = deps.activeSession.value?.persistence_mode ?? 'persistent'
        if (deps.activeSession.value && activePersistenceMode === desiredPersistenceMode) {
            if (deps.activeSession.value.title === 'New chat' && deps.messages.value.length === 0) {
                await deps.updateSessionTitle(deps.activeSession.value.id, titleFromPrompt(message))
            }
            return deps.activeSession.value
        }
        return deps.createSession(titleFromPrompt(message), desiredPersistenceMode)
    }

    function toggleTemporaryMode() {
        sessionPersistenceMode.value = sessionPersistenceMode.value === 'temporary' ? 'persistent' : 'temporary'
    }

    function openSessionExportDialog() {
        if (!deps.activeSession.value) {
            deps.setFeedback('Start or select a chat session before exporting evidence.')
            return
        }
        exportDialogOpen.value = true
        sessionExportResult.value = null
    }

    function closeSessionExportDialog() {
        exportDialogOpen.value = false
    }

    async function runSessionExport(format: TalosSessionExportFormat) {
        if (!deps.activeSession.value) {
            deps.setFeedback('Start or select a chat session before exporting evidence.')
            return
        }
        try {
            sessionExportResult.value = await deps.exportSession(deps.activeSession.value.id, format)
            deps.setFeedback(`${sessionExportResult.value.report_type} exported.`)
        } catch (error) {
            deps.setFeedback(errorMessage(error, 'TALOS could not export this session.'))
        }
    }

    return {
        sessionPersistenceMode,
        creatingSession,
        pendingDeleteSession,
        deletingSession,
        exportDialogOpen,
        sessionExportResult,
        startNewChat,
        chooseSession,
        renameChatSession,
        favoriteChatSession,
        toggleChatSelection,
        archiveChatSession,
        moveChatSession,
        requestDeleteSession,
        confirmDeleteSession,
        copyChatSession,
        ensureSessionForPrompt,
        toggleTemporaryMode,
        openSessionExportDialog,
        closeSessionExportDialog,
        runSessionExport,
        titleFromPrompt,
    }
}
