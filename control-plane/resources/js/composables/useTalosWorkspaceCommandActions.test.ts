// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useTalosWorkspaceCommandActions } from './useTalosWorkspaceCommandActions'
import type { TalosCommand } from '../lib/talosTypes'

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
})
