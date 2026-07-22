import { describe, expect, it } from 'vitest'
import {
    TALOS_MOBILE_COMMANDS,
    findTalosMobileCommand,
    isTalosMobileCommandEnabled,
    type TalosMobileCommandId,
} from '@/lib/mobileCommandRegistry'

const frozenDesktopIds: TalosMobileCommandId[] = [
    'new_session',
    'send_message',
    'open_browse',
    'attach_file',
    'open_context_vault',
    'run_avm_compare',
    'open_trace_replay',
    'recover_failed_node',
    'open_benchmark_workbench',
    'open_model_center',
    'open_doctor',
    'open_audit_log',
    'open_policy_panel',
    'open_shell_policy_panel',
    'open_backup_panel',
    'validate_backup_restore',
    'export_report',
    'open_notes',
    'open_tasks',
    'open_calendar_drafts',
    'open_email_triage',
    'create_email_draft',
    'send_email_draft',
]

describe('mobile command registry', () => {
    it('mirrors every frozen desktop command id and keeps only real mobile owners enabled', () => {
        expect(TALOS_MOBILE_COMMANDS.map((command) => command.id)).toEqual(frozenDesktopIds)
        expect(TALOS_MOBILE_COMMANDS.filter(isTalosMobileCommandEnabled).map((command) => command.id))
            .toEqual(['new_session', 'send_message', 'open_browse', 'open_context_vault', 'open_model_center'])

        for (const command of TALOS_MOBILE_COMMANDS.filter((candidate) => !isTalosMobileCommandEnabled(candidate))) {
            expect(command.disabledReason?.trim(), command.id).toBeTruthy()
            expect(command.disabledReason, command.id).not.toMatch(/coming soon/i)
        }
    })

    it('finds commands by stable id without manufacturing unknown entries', () => {
        expect(findTalosMobileCommand('open_model_center')?.label).toBe('Open model center')
        expect(findTalosMobileCommand('open_browse')?.disabledReason).toBeUndefined()
        expect(findTalosMobileCommand('open_browse')?.description).toMatch(/current chat/i)
        expect(findTalosMobileCommand('missing' as TalosMobileCommandId)).toBeUndefined()
    })
})
