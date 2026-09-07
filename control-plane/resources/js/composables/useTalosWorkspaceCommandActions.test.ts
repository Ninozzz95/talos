// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const toastMock = vi.hoisted(() => ({
    info: vi.fn(() => 'id-info'),
    success: vi.fn(() => 'id-success'),
    warning: vi.fn(() => 'id-warning'),
    error: vi.fn(() => 'id-error'),
}))
vi.mock('vue-sonner', () => ({ toast: toastMock }))

import { useTalosWorkspaceCommandActions } from './useTalosWorkspaceCommandActions'
import TalosSonnerToastContent from '../components/ui/sonner/TalosSonnerToastContent.vue'
import type { TalosCommand } from '../lib/talosTypes'

function baseDeps() {
    return {
        workspaceCommands: commands,
        setFeedback: vi.fn(),
        openWindowFromSource: vi.fn(),
        dockedWindowIds: ref([]),
        toggleDock: vi.fn(),
        toggleBrowseMode: vi.fn(async () => undefined),
        onNewSession: vi.fn(async () => undefined),
        onSendChat: vi.fn(async () => undefined),
        onOpenBrowse: vi.fn(async () => undefined),
        onRunBenchmark: vi.fn(async () => undefined),
        onOpenExport: vi.fn(),
        exportDisabledReason: ref(''),
    }
}

const commands = ref<TalosCommand[]>([
    { id: 'open_trace_replay', label: 'Trace replay', description: 'Open replay', category: 'run', risk: 'low' },
    { id: 'open_browse', label: 'Browse', description: 'Open Browse', category: 'chat', risk: 'low' },
])

describe('useTalosWorkspaceCommandActions', () => {
    it('routes a command to a window and focuses its requested section', async () => {
        const openWindowFromSource = vi.fn()
        const section = document.createElement('div')
        section.dataset.testid = 'talos-admin-section-audit'
        section.tabIndex = 0
        section.scrollIntoView = vi.fn()
        document.body.append(section)
        const actions = useTalosWorkspaceCommandActions({
            workspaceCommands: commands,
            setFeedback: vi.fn(),
            openWindowFromSource,
            dockedWindowIds: ref([]),
            toggleDock: vi.fn(),
            toggleBrowseMode: vi.fn(async () => undefined),
            onNewSession: vi.fn(async () => undefined),
            onSendChat: vi.fn(async () => undefined),
            onOpenBrowse: vi.fn(async () => undefined),
            onRunBenchmark: vi.fn(async () => undefined),
            onOpenExport: vi.fn(),
            exportDisabledReason: ref(''),
        })

        await actions.focusCommandRoute({ windowId: 'doctor', windowSection: 'audit', sectionTestId: 'talos-admin-section-audit' })

        expect(openWindowFromSource).toHaveBeenCalledWith('doctor', undefined, 'command')
        expect(section.scrollIntoView).toHaveBeenCalled()
        expect(document.activeElement).toBe(section)
        section.remove()
    })

    it('publishes only the latest window-section request with a monotonic revision', async () => {
        const actions = useTalosWorkspaceCommandActions(baseDeps())

        await actions.focusCommandRoute({ windowId: 'library', windowSection: 'sources' })

        expect(actions.requestedWindowSections.value).toEqual({ library: 'sources' })
        expect(actions.requestedWindowSectionRevision.value).toBe(1)

        await actions.focusCommandRoute({ windowId: 'doctor', windowSection: 'audit' })

        expect(actions.requestedWindowSections.value).toEqual({ doctor: 'audit' })
        expect(actions.requestedWindowSectionRevision.value).toBe(2)
    })

    it('keeps model and context popovers mutually exclusive', () => {
        const actions = useTalosWorkspaceCommandActions({
            workspaceCommands: commands,
            setFeedback: vi.fn(),
            openWindowFromSource: vi.fn(),
            dockedWindowIds: ref([]),
            toggleDock: vi.fn(),
            toggleBrowseMode: vi.fn(async () => undefined),
            onNewSession: vi.fn(async () => undefined),
            onSendChat: vi.fn(async () => undefined),
            onOpenBrowse: vi.fn(async () => undefined),
            onRunBenchmark: vi.fn(async () => undefined),
            onOpenExport: vi.fn(),
            exportDisabledReason: ref(''),
        })

        actions.toggleModelPopover()
        expect(actions.modelPopoverOpen.value).toBe(true)
        actions.toggleContextPopover()
        expect(actions.modelPopoverOpen.value).toBe(false)
        expect(actions.contextPopoverOpen.value).toBe(true)
    })

    it('routes setFeedback through one command-feedback native toast', async () => {
        toastMock.info.mockClear()
        const actions = useTalosWorkspaceCommandActions(baseDeps())

        actions.setFeedback('New session opened.')
        actions.setFeedback('Chat archived.')
        // vue-sonner is loaded lazily; flush the dynamic-import microtask.
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(actions).not.toHaveProperty('commandFeedback')
        expect(toastMock.info).toHaveBeenCalledTimes(2)
        expect(toastMock.info).toHaveBeenNthCalledWith(1, TalosSonnerToastContent, expect.objectContaining({ id: 'command-feedback', componentProps: { message: 'New session opened.', tone: 'info' } }))
        expect(toastMock.info).toHaveBeenNthCalledWith(2, TalosSonnerToastContent, expect.objectContaining({ id: 'command-feedback', componentProps: { message: 'Chat archived.', tone: 'info' } }))
    })
})
