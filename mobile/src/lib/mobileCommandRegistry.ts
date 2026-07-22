export type TalosMobileCommandId =
    | 'new_session'
    | 'send_message'
    | 'open_browse'
    | 'attach_file'
    | 'open_context_vault'
    | 'run_avm_compare'
    | 'open_trace_replay'
    | 'recover_failed_node'
    | 'open_benchmark_workbench'
    | 'open_model_center'
    | 'open_doctor'
    | 'open_audit_log'
    | 'open_policy_panel'
    | 'open_shell_policy_panel'
    | 'open_backup_panel'
    | 'validate_backup_restore'
    | 'export_report'
    | 'open_notes'
    | 'open_tasks'
    | 'open_calendar_drafts'
    | 'open_email_triage'
    | 'create_email_draft'
    | 'send_email_draft'

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
        disabledReason: 'The local Vault ingestion bridge is not installed.',
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
        id: 'run_avm_compare',
        label: 'Run AVM compare',
        description: 'Run an AVM ON/OFF benchmark comparison with stored evidence.',
        category: 'benchmark',
        risk: 'medium',
        capability: 'talos.benchmarks.create',
        disabledReason: 'The local benchmark runtime and evidence store are not installed.',
    },
    {
        id: 'open_trace_replay',
        label: 'Open trace replay',
        description: 'Inspect replayable trace events for a persisted TALOS run.',
        category: 'run',
        risk: 'low',
        capability: 'talos.runs.replay',
        disabledReason: 'The local run trace and replay store are not installed.',
    },
    {
        id: 'recover_failed_node',
        label: 'Recover failed node',
        description: 'Request controlled HMI recovery for a failed AVM node.',
        category: 'run',
        risk: 'high',
        capability: 'talos.runs.recover',
        disabledReason: 'The local run recovery engine is not installed.',
    },
    {
        id: 'open_benchmark_workbench',
        label: 'Open benchmark workbench',
        description: 'Open the workbench for AVM evidence comparisons.',
        category: 'benchmark',
        risk: 'low',
        capability: 'talos.benchmarks.read',
        disabledReason: 'The local benchmark workbench is not installed.',
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
        disabledReason: 'Mobile Doctor services are not installed.',
    },
    {
        id: 'open_audit_log',
        label: 'Open audit log',
        description: 'Inspect persisted security and operator audit events.',
        category: 'system',
        risk: 'low',
        capability: 'talos.audit.read',
        disabledReason: 'The local audit service is not installed.',
    },
    {
        id: 'open_policy_panel',
        label: 'Open policy panel',
        description: 'Inspect default-deny capabilities and authorization state.',
        category: 'system',
        risk: 'low',
        capability: 'talos.policy.read',
        disabledReason: 'The sovereign mobile policy runtime is not installed.',
    },
    {
        id: 'open_shell_policy_panel',
        label: 'Open shell policy',
        description: 'Preview shell policy decisions without executing host commands.',
        category: 'system',
        risk: 'high',
        capability: 'talos.shell.preview',
        disabledReason: 'Host shell execution is not available in the standalone mobile app.',
    },
    {
        id: 'open_backup_panel',
        label: 'Open backup panel',
        description: 'Inspect backup domains and restore safety policy.',
        category: 'system',
        risk: 'medium',
        capability: 'talos.backup.read',
        disabledReason: 'The encrypted mobile backup service is not installed.',
    },
    {
        id: 'validate_backup_restore',
        label: 'Validate backup restore',
        description: 'Validate a TALOS backup manifest without restoring data.',
        category: 'system',
        risk: 'high',
        capability: 'talos.backup.restore',
        disabledReason: 'The encrypted mobile backup validator is not installed.',
    },
    {
        id: 'export_report',
        label: 'Export report',
        description: 'Export the active session as a redacted evidence pack or transcript.',
        category: 'report',
        risk: 'medium',
        capability: 'talos.reports.export',
        disabledReason: 'The local session export service is not installed.',
    },
    {
        id: 'open_notes',
        label: 'Open notes',
        description: 'Inspect and create untrusted workspace notes.',
        category: 'productivity',
        risk: 'low',
        capability: 'talos.notes.read',
        disabledReason: 'The local Notes repository is not installed.',
    },
    {
        id: 'open_tasks',
        label: 'Open tasks',
        description: 'Inspect run-linked TALOS tasks.',
        category: 'productivity',
        risk: 'low',
        capability: 'talos.tasks.read',
        disabledReason: 'The local Tasks repository is not installed.',
    },
    {
        id: 'open_calendar_drafts',
        label: 'Open calendar drafts',
        description: 'Inspect draft-only calendar actions that require confirmation.',
        category: 'productivity',
        risk: 'medium',
        capability: 'talos.calendar.read',
        disabledReason: 'No authorized mobile calendar connector is configured.',
    },
    {
        id: 'open_email_triage',
        label: 'Open email triage',
        description: 'Inspect read-only email context and draft replies.',
        category: 'email',
        risk: 'medium',
        capability: 'talos.email.read',
        disabledReason: 'No authorized mobile email connector is configured.',
    },
    {
        id: 'create_email_draft',
        label: 'Create email draft',
        description: 'Create a draft from selected email messages without sending it.',
        category: 'email',
        risk: 'medium',
        capability: 'talos.email.draft',
        disabledReason: 'No selected message or authorized mobile email connector is available.',
    },
    {
        id: 'send_email_draft',
        label: 'Send email draft',
        description: 'Send a reviewed email draft.',
        category: 'email',
        risk: 'critical',
        capability: 'talos.email.send',
        disabledReason: 'Email send is disabled until mobile confirmation, policy, and audit exist.',
    },
])

export function isTalosMobileCommandEnabled(command: TalosMobileCommand): boolean {
    return !command.disabledReason
}

export function findTalosMobileCommand(id: TalosMobileCommandId): TalosMobileCommand | undefined {
    return TALOS_MOBILE_COMMANDS.find((command) => command.id === id)
}
