import { describe, expect, it } from 'vitest'
import { TALOS_MOBILE_COMMANDS } from '@/lib/mobileCommandRegistry'
import {
    filterTalosMobileSlashCommands,
    toTalosMobileSlashCommands,
} from '@/lib/mobileSlashCommands'

describe('mobile slash commands', () => {
    it('maps the frozen aliases and intentionally omits send and shell policy', () => {
        const commands = toTalosMobileSlashCommands(TALOS_MOBILE_COMMANDS)
        expect(commands.map((command) => command.slash)).toEqual([
            '/new',
            '/browse',
            '/file',
            '/context',
            '/compare',
            '/trace',
            '/recover',
            '/bench',
            '/model',
            '/doctor',
            '/audit',
            '/policy',
            '/backup',
            '/restore',
            '/export',
            '/notes',
            '/tasks',
            '/calendar',
            '/email',
            '/draft',
            '/send-email',
        ])
        expect(commands.some((command) => command.id === 'send_message')).toBe(false)
        expect(commands.some((command) => command.id === 'open_shell_policy_panel')).toBe(false)
    })

    it.each([
        ['model', 'open_model_center'],
        ['/MODEL', 'open_model_center'],
        ['provider profiles', 'open_model_center'],
        ['context', 'open_context_vault'],
        ['benchmark', 'run_avm_compare'],
        ['talos.browser.read', 'open_browse'],
        ['EMAIL', 'open_email_triage'],
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
