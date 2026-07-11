import { nextTick, ref, type Readonly, type Ref } from 'vue'
import { TALOS_WORKSPACE_COMMAND_TARGETS, TALOS_WORKSPACE_WINDOW_IDS, type TalosWorkspaceCommandRoute } from '../lib/talosWorkspaceCommandRoutes'
import type { TalosCommand } from '../lib/talosTypes'
import type { TalosWindowId } from '../lib/talosWindowRegistry'

type WindowSource = 'command' | 'sidebar'
type WindowEvent = MouseEvent | PointerEvent | undefined

export type TalosWorkspaceCommandActionDependencies = {
    workspaceCommands: Readonly<Ref<TalosCommand[]>>
    setFeedback: (message: string) => void
    openWindowFromSource: (id: TalosWindowId, event?: WindowEvent, source?: WindowSource) => void
    dockedWindowIds: Readonly<Ref<TalosWindowId[]>>
    toggleDock: (id: TalosWindowId) => void
    toggleBrowseMode: () => Promise<void>
    onNewSession: () => Promise<void>
    onSendChat: () => Promise<boolean | void>
    onOpenBrowse: () => Promise<void>
    onRunBenchmark: () => Promise<void>
    onOpenExport: () => void
    exportDisabledReason: Readonly<Ref<string>>
    clearPromptEnhancement?: () => void
}

function isWindowId(value: string): value is TalosWindowId {
    return TALOS_WORKSPACE_WINDOW_IDS.includes(value as TalosWindowId)
}

export function useTalosWorkspaceCommandActions(deps: TalosWorkspaceCommandActionDependencies) {
    const commandPaletteOpen = ref(false)
    const commandFeedback = ref('')
    const modelPopoverOpen = ref(false)
    const contextPopoverOpen = ref(false)
    const runtimeRequestedTab = ref<NonNullable<TalosWorkspaceCommandRoute['runtimeTab']>>('timeline')
    const runtimeRequestedTabRevision = ref(0)
    const settingsRequestedTab = ref<'models' | 'account'>('models')
    const settingsRequestedTabRevision = ref(0)
    const requestedWindowSections = ref<Partial<Record<TalosWindowId, string>>>({})
    const requestedWindowSectionRevision = ref(0)

    function setFeedback(message: string) {
        commandFeedback.value = message
    }

    function openSettings(tab: 'models' | 'account' = 'models', event?: WindowEvent) {
        settingsRequestedTab.value = tab
        settingsRequestedTabRevision.value += 1
        deps.openWindowFromSource('settings', event, event ? 'sidebar' : 'command')
    }

    function openModule(id: string, event?: MouseEvent | PointerEvent) {
        if (id === 'browse') {
            void deps.toggleBrowseMode()
            return
        }
        if (!isWindowId(id)) return
        if (id === 'settings') {
            openSettings('models', event)
            return
        }
        deps.openWindowFromSource(id, event, 'sidebar')
    }

    function closePopover() {
        modelPopoverOpen.value = false
        contextPopoverOpen.value = false
    }

    function toggleModelPopover() {
        modelPopoverOpen.value = !modelPopoverOpen.value
        contextPopoverOpen.value = false
        deps.clearPromptEnhancement?.()
    }

    function toggleContextPopover() {
        contextPopoverOpen.value = !contextPopoverOpen.value
        modelPopoverOpen.value = false
        deps.clearPromptEnhancement?.()
    }

    async function focusCommandRoute(route: TalosWorkspaceCommandRoute) {
        if (route.windowId === 'runtime' && route.runtimeTab) {
            runtimeRequestedTab.value = route.runtimeTab
            runtimeRequestedTabRevision.value += 1
        }
        if (route.windowSection) {
            requestedWindowSections.value = { ...requestedWindowSections.value, [route.windowId]: route.windowSection }
            requestedWindowSectionRevision.value += 1
        }
        deps.openWindowFromSource(route.windowId, undefined, 'command')
        if (deps.dockedWindowIds.value.includes(route.windowId)) deps.toggleDock(route.windowId)
        if (!route.sectionTestId || typeof document === 'undefined') return true
        await nextTick()
        const section = document.querySelector<HTMLElement>(`[data-testid="${route.sectionTestId}"]`)
        if (!section) return false
        section.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
        section.focus({ preventScroll: true })
        return true
    }

    async function selectCommand(commandId: TalosCommand['id']) {
        const command = deps.workspaceCommands.value.find((item) => item.id === commandId)
        const route = TALOS_WORKSPACE_COMMAND_TARGETS[commandId]
        if (commandId === 'new_session') {
            closeCommandPalette()
            await deps.onNewSession()
            deps.setFeedback('New session opened.')
            return
        }
        if (commandId === 'send_message') {
            closeCommandPalette()
            const sent = await deps.onSendChat()
            if (sent !== false) deps.setFeedback('Message sent through TALOS chat.')
            return
        }
        if (commandId === 'open_browse') {
            closeCommandPalette()
            await deps.onOpenBrowse()
            return
        }
        if (commandId === 'run_avm_compare') {
            closeCommandPalette()
            await deps.onRunBenchmark()
            return
        }
        if (commandId === 'export_report') {
            deps.onOpenExport()
            return
        }
        if (route) {
            closeCommandPalette()
            const focused = await focusCommandRoute(route)
            const feedback = focused
                ? `${command?.label ?? 'Command'} opened.`
                : `${command?.label ?? 'Command'} opened, but TALOS could not focus the requested section.`
            deps.setFeedback(feedback)
            return feedback
        }
        const feedback = command?.disabledReason || command?.description || 'Command selected.'
        deps.setFeedback(feedback)
        return feedback
    }

    function openCommandPalette() {
        commandPaletteOpen.value = true
    }

    function closeCommandPalette() {
        commandPaletteOpen.value = false
    }

    async function openAuditLogFromRuntime() {
        const route = TALOS_WORKSPACE_COMMAND_TARGETS.open_audit_log
        if (!route) {
            deps.setFeedback('Audit log route is not available.')
            return false
        }
        const focused = await focusCommandRoute(route)
        deps.setFeedback(focused ? 'Audit log opened.' : 'Audit log opened, but TALOS could not focus the audit section.')
        return focused
    }

    return {
        commandPaletteOpen,
        commandFeedback,
        setFeedback,
        modelPopoverOpen,
        contextPopoverOpen,
        runtimeRequestedTab,
        runtimeRequestedTabRevision,
        settingsRequestedTab,
        settingsRequestedTabRevision,
        requestedWindowSections,
        requestedWindowSectionRevision,
        openSettings,
        openAccountSettings: () => openSettings('account'),
        openModule,
        closePopover,
        toggleModelPopover,
        toggleContextPopover,
        focusCommandRoute,
        selectCommand,
        openCommandPalette,
        closeCommandPalette,
        openAuditLogFromRuntime,
    }
}
