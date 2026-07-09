import type { TalosWindowId } from '../composables/useTalosWindows'
import type { TalosCommand } from './talosTypes'

export const TALOS_WORKSPACE_WINDOW_IDS: TalosWindowId[] = ['runtime', 'search', 'brain', 'calendar', 'compare', 'model_lab', 'research', 'gallery', 'library', 'notes', 'tasks', 'settings', 'theme', 'doctor', 'tools']

export type TalosWorkspaceCommandRoute = {
    windowId: TalosWindowId
    sectionTestId?: string
    windowSection?: string
    runtimeTab?: 'timeline' | 'dag' | 'replay' | 'recovery' | 'artifacts'
}

export const TALOS_WORKSPACE_COMMAND_TARGETS: Partial<Record<TalosCommand['id'], TalosWorkspaceCommandRoute>> = {
    attach_file: { windowId: 'library', windowSection: 'context' },
    open_context_vault: { windowId: 'library', windowSection: 'context' },
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
