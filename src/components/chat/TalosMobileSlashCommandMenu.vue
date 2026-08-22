<script setup lang="ts">
import { computed, watch } from 'vue'
import { useTalosI18n } from '@/i18n'
import {
    isTalosMobileCommandEnabled,
    TALOS_MOBILE_COMMANDS,
    type TalosMobileCommand,
    type TalosMobileCommandId,
} from '@/lib/mobileCommandRegistry'
import { filterTalosMobileSlashCommands } from '@/lib/mobileSlashCommands'

const props = withDefaults(defineProps<{
    commands?: TalosMobileCommand[]
    query: string
    activeIndex: number
}>(), {
    commands: () => [...TALOS_MOBILE_COMMANDS],
})

const emit = defineEmits<{
    selected: [id: TalosMobileCommandId]
    filteredCount: [count: number]
}>()

const { t } = useTalosI18n()
const commandKeys: Record<TalosMobileCommandId, { label: string; description: string }> = {
    new_session: { label: 'commands.newSessionLabel', description: 'commands.newSessionDescription' },
    send_message: { label: 'commands.sendMessageLabel', description: 'commands.sendMessageDescription' },
    open_browse: { label: 'commands.openBrowseLabel', description: 'commands.openBrowseDescription' },
    attach_file: { label: 'commands.attachFileLabel', description: 'commands.attachFileDescription' },
    open_context_vault: { label: 'commands.openContextLabel', description: 'commands.openContextDescription' },
    open_model_center: { label: 'commands.openModelLabel', description: 'commands.openModelDescription' },
    open_doctor: { label: 'commands.openDoctorLabel', description: 'commands.openDoctorDescription' },
    export_report: { label: 'commands.exportReportLabel', description: 'commands.exportReportDescription' },
    open_notes: { label: 'commands.openNotesLabel', description: 'commands.openNotesDescription' },
    open_tasks: { label: 'commands.openTasksLabel', description: 'commands.openTasksDescription' },
}
const categoryKeys: Partial<Record<TalosMobileCommand['category'], string>> = {
    chat: 'commands.categoryChat',
    context: 'commands.categoryContext',
    model: 'commands.categoryModel',
    system: 'commands.categorySystem',
    report: 'commands.categoryReport',
    productivity: 'commands.categoryProductivity',
}
const localizedCommands = computed(() => props.commands.map((command) => ({
    ...command,
    label: t(commandKeys[command.id].label),
    description: t(commandKeys[command.id].description),
    category: (categoryKeys[command.category] ? t(categoryKeys[command.category]!) : command.category) as TalosMobileCommand['category'],
})))
const filteredCommands = computed(() => filterTalosMobileSlashCommands(localizedCommands.value, props.query))

function selectCommand(command: TalosMobileCommand): void {
    if (!isTalosMobileCommandEnabled(command)) return
    emit('selected', command.id)
}

function activateSelected(): void {
    const command = filteredCommands.value[props.activeIndex]
    if (command) selectCommand(command)
}

watch(() => filteredCommands.value.length, (count) => emit('filteredCount', count), { immediate: true })

defineExpose({ activateSelected })
</script>

<template>
    <section
        data-testid="talos-mobile-slash-command-menu"
        class="w-full max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-md border border-[var(--talos-border,var(--border))] bg-[var(--talos-card,var(--popover))] shadow-xl"
    >
        <div class="border-b border-[var(--talos-border,var(--border))] px-3 py-2 font-mono text-2xs font-semibold uppercase text-[var(--talos-muted,var(--muted-foreground))]">
            {{ $t('chat.slashCommands') }}
        </div>
        <div
            class="max-h-[min(18rem,48vh)] overflow-y-auto p-2"
            role="listbox"
            :aria-label="$t('chat.composerSlashCommands')"
        >
            <button
                v-for="(command, index) in filteredCommands"
                :key="command.id"
                type="button"
                role="option"
                :data-command-id="command.id"
                :aria-disabled="!isTalosMobileCommandEnabled(command)"
                :aria-selected="index === activeIndex"
                class="grid min-h-touch w-full gap-1 rounded-md px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--talos-accent,var(--ring))]"
                :class="[
                    isTalosMobileCommandEnabled(command)
                        ? 'text-[var(--talos-text,var(--foreground))] active:bg-[var(--talos-active,var(--accent))]'
                        : 'cursor-not-allowed text-[var(--talos-muted,var(--muted-foreground))] opacity-75',
                    index === activeIndex ? 'bg-[var(--talos-active,var(--accent))]' : '',
                ]"
                @mousedown.prevent
                @click="selectCommand(command)"
            >
                <span class="flex min-w-0 items-center justify-between gap-3">
                    <span class="min-w-0 truncate text-sm font-semibold">
                        <span class="font-mono text-[var(--talos-accent,var(--primary))]">{{ command.slash }}</span>
                        {{ command.label }}
                    </span>
                    <span class="shrink-0 rounded border border-[var(--talos-border-strong,var(--border))] px-1.5 py-0.5 font-mono text-3xs uppercase text-[var(--talos-muted,var(--muted-foreground))]">
                        {{ command.category }}
                    </span>
                </span>
                <span class="text-xs leading-5 text-[var(--talos-muted,var(--muted-foreground))]">
                    {{ command.description }}
                </span>
                <span
                    v-if="command.disabledReason"
                    class="text-xs leading-5 text-[var(--talos-warning,#d9a441)]"
                >
                    {{ command.disabledReason }}
                </span>
            </button>

            <p
                v-if="filteredCommands.length === 0"
                class="px-3 py-6 text-center text-sm text-[var(--talos-muted,var(--muted-foreground))]"
            >
                {{ $t('chat.noSlashMatches') }}
            </p>
        </div>
    </section>
</template>
