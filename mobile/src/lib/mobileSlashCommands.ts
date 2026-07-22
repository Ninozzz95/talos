import type { TalosMobileCommand, TalosMobileCommandId } from '@/lib/mobileCommandRegistry'

export type TalosMobileSlashCommand = TalosMobileCommand & {
    slash: string
}

const slashCommandAliases: Partial<Record<TalosMobileCommandId, string>> = {
    new_session: '/new',
    open_browse: '/browse',
    attach_file: '/file',
    open_context_vault: '/context',
    run_avm_compare: '/compare',
    open_trace_replay: '/trace',
    recover_failed_node: '/recover',
    open_benchmark_workbench: '/bench',
    open_model_center: '/model',
    open_doctor: '/doctor',
    open_audit_log: '/audit',
    open_policy_panel: '/policy',
    open_backup_panel: '/backup',
    validate_backup_restore: '/restore',
    export_report: '/export',
    open_notes: '/notes',
    open_tasks: '/tasks',
    open_calendar_drafts: '/calendar',
    open_email_triage: '/email',
    create_email_draft: '/draft',
    send_email_draft: '/send-email',
}

export function toTalosMobileSlashCommands(
    commands: readonly TalosMobileCommand[],
): TalosMobileSlashCommand[] {
    return commands.flatMap((command) => {
        const slash = slashCommandAliases[command.id]
        return slash ? [{ ...command, slash }] : []
    })
}

export function filterTalosMobileSlashCommands(
    commands: readonly TalosMobileCommand[],
    query: string,
): TalosMobileSlashCommand[] {
    const slashCommands = toTalosMobileSlashCommands(commands)
    const normalizedQuery = query.trim().toLowerCase().replace(/^\//, '')
    if (!normalizedQuery) return slashCommands

    return slashCommands.filter((command) => [
        command.slash.replace(/^\//, ''),
        command.label,
        command.description,
        command.category,
        command.capability ?? '',
    ].some((value) => value.toLowerCase().includes(normalizedQuery)))
        .sort((left, right) => {
            const rank = (command: TalosMobileSlashCommand): number => {
                const alias = command.slash.slice(1).toLowerCase()
                if (alias === normalizedQuery) return 0
                if (alias.startsWith(normalizedQuery)) return 1
                return 2
            }
            return rank(left) - rank(right)
        })
}
