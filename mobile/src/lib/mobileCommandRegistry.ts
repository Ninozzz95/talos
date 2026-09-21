/**
 * Owner 2026-07-25 (defect #6): the menu that opens with "/" advertised 21
 * commands, 17 of them permanently greyed out — and four of THOSE claimed the
 * feature was "not installed" while it shipped and worked (Doctor, export chat,
 * notes, tasks). A product that understates itself is as dishonest as one that
 * overstates itself, so the four are live and everything that does not exist is
 * gone rather than displayed as a promise.
 */
export type TalosMobileCommandId =
    | 'attach_file'
    | 'export_report'
    | 'new_session'
    | 'open_browse'
    | 'open_context_vault'
    | 'open_doctor'
    | 'open_model_center'
    | 'open_notes'
    | 'open_tasks'
    | 'send_message'

export type TalosMobileCommandRisk = 'low' | 'medium' | 'high' | 'critical'
export type TalosMobileCommandCategory =
    | 'chat'
    | 'context'
    | 'run'
    | 'benchmark'
    | 'model'
    | 'system'
    | 'report'
    | 'productivity'
    | 'email'

export interface TalosMobileCommand {
    id: TalosMobileCommandId
    label: string
    description: string
    category: TalosMobileCommandCategory
    risk: TalosMobileCommandRisk
    capability?: string
    disabledReason?: string
}

/**
 * The desktop command set, frozen, kept as a PARITY LEDGER rather than as menu
 * content: it is what the mobile surface is measured against, and dropping it
 * would hide the gap instead of closing it. What the user sees is
 * TALOS_MOBILE_COMMANDS below — only commands that really run.
 */
export const TALOS_DESKTOP_COMMAND_IDS = Object.freeze([
    'new_session', 'send_message', 'open_browse', 'attach_file', 'open_context_vault',
    'run_avm_compare', 'open_trace_replay', 'recover_failed_node', 'open_benchmark_workbench',
    'open_model_center', 'open_doctor', 'open_audit_log', 'open_policy_panel',
    'open_shell_policy_panel', 'open_backup_panel', 'validate_backup_restore', 'export_report',
    'open_notes', 'open_tasks', 'open_calendar_drafts', 'open_email_triage', 'create_email_draft',
    'send_email_draft',
] as const)

/** Commands the mobile app can actually execute today. */
export const TALOS_MOBILE_COMMANDS: readonly TalosMobileCommand[] = Object.freeze([
    {
        id: 'new_session',
        label: 'New session',
        description: 'Start a clean chat session in the current TALOS surface.',
        category: 'chat',
        risk: 'low',
        capability: 'talos.chat.session.create',
    },
    {
        id: 'send_message',
        label: 'Send message',
        description: 'Send the current composer message through the selected mobile provider.',
        category: 'chat',
        risk: 'low',
        capability: 'talos.chat.message.create',
    },
    {
        id: 'open_browse',
        label: 'Open Browse',
        description: 'Enable manual local browsing inside the current chat.',
        category: 'chat',
        risk: 'low',
        capability: 'talos.browser.read',
    },
    {
        id: 'attach_file',
        label: 'Attach file',
        description: 'Upload a local file into the Context Vault.',
        category: 'context',
        risk: 'medium',
        capability: 'talos.files.upload',
    },
    {
        id: 'open_context_vault',
        label: 'Open Context Vault',
        description: 'Open local files, chunks, and context sets.',
        category: 'context',
        risk: 'low',
        capability: 'talos.context.read',
    },
    {
        id: 'open_model_center',
        label: 'Open model center',
        description: 'Manage provider profiles and model probes.',
        category: 'model',
        risk: 'medium',
        capability: 'talos.models.read',
    },
    {
        id: 'open_doctor',
        label: 'Open doctor',
        description: 'Inspect TALOS readiness checks and degraded dependencies.',
        category: 'system',
        risk: 'low',
        capability: 'talos.doctor.read',
    },
    {
        id: 'export_report',
        label: 'Export report',
        description: 'Export the active session as a redacted evidence pack or transcript.',
        category: 'report',
        risk: 'medium',
        capability: 'talos.reports.export',
    },
    {
        id: 'open_notes',
        label: 'Open notes',
        description: 'Inspect and create untrusted workspace notes.',
        category: 'productivity',
        risk: 'low',
        capability: 'talos.notes.read',
    },
    {
        id: 'open_tasks',
        label: 'Open tasks',
        description: 'Inspect run-linked TALOS tasks.',
        category: 'productivity',
        risk: 'low',
        capability: 'talos.tasks.read',
    },
])

export function isTalosMobileCommandEnabled(command: TalosMobileCommand): boolean {
    return !command.disabledReason
}

export function findTalosMobileCommand(id: TalosMobileCommandId): TalosMobileCommand | undefined {
    return TALOS_MOBILE_COMMANDS.find((command) => command.id === id)
}
