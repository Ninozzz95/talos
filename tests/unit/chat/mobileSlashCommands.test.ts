import { describe, expect, it } from 'vitest'
import { TALOS_MOBILE_COMMANDS } from '@/lib/mobileCommandRegistry'
import {
    filterTalosMobileSlashCommands,
    toTalosMobileSlashCommands,
} from '@/lib/mobileSlashCommands'

describe('mobile slash commands', () => {
    it('maps only the aliases of commands that really run', () => {
        // Owner 2026-07-25 (defect #6): the alias list used to advertise 21
        // commands, 17 of them greyed out. What is left is what works.
        const commands = toTalosMobileSlashCommands(TALOS_MOBILE_COMMANDS)
        expect(commands.map((command) => command.slash)).toEqual([
            '/new',
            '/browse',
            '/file',
            '/context',
            '/model',
            '/doctor',
            '/export',
            '/notes',
            '/tasks',
        ])
        expect(commands.some((command) => command.id === 'send_message')).toBe(false)
        expect(commands.every((command) => command.disabledReason === undefined)).toBe(true)
    })

    it.each([
        ['model', 'open_model_center'],
        ['/MODEL', 'open_model_center'],
        ['provider profiles', 'open_model_center'],
        ['context', 'open_context_vault'],
        ['talos.browser.read', 'open_browse'],
        ['NOTES', 'open_notes'],
        ['/export', 'export_report'],
    ])('filters %s across alias label description category and capability', (query, expectedId) => {
        expect(filterTalosMobileSlashCommands(TALOS_MOBILE_COMMANDS, query).map((command) => command.id))
            .toContain(expectedId)
    })

    it('returns the complete ordered alias list for an empty query', () => {
        expect(filterTalosMobileSlashCommands(TALOS_MOBILE_COMMANDS, ' / ').map((command) => command.id))
            .toEqual(toTalosMobileSlashCommands(TALOS_MOBILE_COMMANDS).map((command) => command.id))
    })

    it('keeps Browse executable through the same slash-command registry', () => {
        const browse = filterTalosMobileSlashCommands(TALOS_MOBILE_COMMANDS, '/browse')[0]
        expect(browse).toMatchObject({ id: 'open_browse', slash: '/browse' })
        expect(browse?.disabledReason).toBeUndefined()
    })

    it('prioritizes exact and prefix aliases over incidental description matches', () => {
        const exact = filterTalosMobileSlashCommands(TALOS_MOBILE_COMMANDS, '/context')
        const prefix = filterTalosMobileSlashCommands(TALOS_MOBILE_COMMANDS, '/con')

        expect(exact[0]?.slash).toBe('/context')
        expect(prefix[0]?.slash).toBe('/context')
        expect(exact.some((command) => command.slash === '/file')).toBe(true)
    })
})
