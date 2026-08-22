import type { TalosMobileCommand, TalosMobileCommandId } from '@/lib/mobileCommandRegistry'

export type TalosMobileSlashCommand = TalosMobileCommand & {
    slash: string
}

const slashCommandAliases: Partial<Record<TalosMobileCommandId, string>> = {
    new_session: '/new',
    open_browse: '/browse',
    attach_file: '/file',
    open_context_vault: '/context',
    open_model_center: '/model',
    open_doctor: '/doctor',
    export_report: '/export',
    open_notes: '/notes',
    open_tasks: '/tasks',
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
