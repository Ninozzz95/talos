import { describe, expect, it } from 'vitest'
import { TALOS_WORKSPACE_COMMAND_TARGETS } from './talosWorkspaceCommandRoutes'
import { TALOS_WINDOW_REGISTRY } from './talosWindowRegistry'

describe('TALOS workspace command routes', () => {
    it('routes file commands through the Library Sources tab', () => {
        const librarySections = TALOS_WINDOW_REGISTRY.library.sections.map((section) => section.id)

        expect(TALOS_WORKSPACE_COMMAND_TARGETS.attach_file).toEqual({
            windowId: 'library',
            windowSection: 'sources',
        })
        expect(TALOS_WORKSPACE_COMMAND_TARGETS.open_context_vault).toEqual({
            windowId: 'library',
            windowSection: 'sources',
        })
        expect(librarySections).toContain(TALOS_WORKSPACE_COMMAND_TARGETS.attach_file?.windowSection)
        expect(librarySections).toContain(TALOS_WORKSPACE_COMMAND_TARGETS.open_context_vault?.windowSection)
    })
})
