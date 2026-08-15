import { describe, expect, it } from 'vitest'
import {
    TALOS_DESKTOP_COMMAND_IDS,
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
    it('keeps the desktop set as a parity ledger while the MENU only offers what runs', () => {
        // Owner 2026-07-25 (defect #6): 17 of 21 entries were greyed out and
        // four of those lied about features that ship. The parity ledger stays
        // — it is how the gap is measured — but it is no longer menu content.
        expect([...TALOS_DESKTOP_COMMAND_IDS]).toEqual(frozenDesktopIds)
        expect(TALOS_MOBILE_COMMANDS.every(isTalosMobileCommandEnabled)).toBe(true)
        expect(TALOS_MOBILE_COMMANDS.map((command) => command.id)).toEqual([
            'new_session', 'send_message', 'open_browse', 'attach_file', 'open_context_vault',
            'open_model_center', 'open_doctor', 'export_report', 'open_notes', 'open_tasks',
        ])

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
