import type { TalosCommand } from './talosTypes'
import { TALOS_WINDOW_IDS, type TalosWindowId } from './talosWindowRegistry'

export const TALOS_WORKSPACE_WINDOW_IDS: readonly TalosWindowId[] = TALOS_WINDOW_IDS

export type TalosWorkspaceCommandRoute = {
    windowId: TalosWindowId
    sectionTestId?: string
    windowSection?: string
    runtimeTab?: 'timeline' | 'dag' | 'replay' | 'recovery' | 'artifacts'
}

export const TALOS_WORKSPACE_COMMAND_TARGETS: Partial<Record<TalosCommand['id'], TalosWorkspaceCommandRoute>> = {
    attach_file: { windowId: 'library', windowSection: 'sources' },
    open_context_vault: { windowId: 'library', windowSection: 'sources' },
    open_trace_replay: { windowId: 'runtime', runtimeTab: 'replay' },
    open_benchmark_workbench: { windowId: 'compare' },
    open_model_center: { windowId: 'model_lab', windowSection: 'models' },
    open_doctor: { windowId: 'doctor', windowSection: 'doctor' },
    open_audit_log: { windowId: 'doctor', windowSection: 'audit', sectionTestId: 'talos-admin-section-audit' },
    open_policy_panel: { windowId: 'doctor', windowSection: 'policy', sectionTestId: 'talos-admin-section-policy' },
    open_shell_policy_panel: { windowId: 'doctor', windowSection: 'shell', sectionTestId: 'talos-admin-section-shell' },
    open_backup_panel: { windowId: 'doctor', windowSection: 'backup', sectionTestId: 'talos-admin-section-backup' },
    open_notes: { windowId: 'notes' },
    open_tasks: { windowId: 'tasks', windowSection: 'tasks' },
    open_calendar_drafts: { windowId: 'calendar' },
    open_email_triage: { windowId: 'tasks', windowSection: 'email', sectionTestId: 'talos-productivity-section-email-triage' },
}
