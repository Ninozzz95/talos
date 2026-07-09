<script setup lang="ts">
import { computed } from 'vue'
import type { TalosCommand } from '../../../lib/talosTypes'
import { isTalosCommandEnabled } from '../../../lib/commandRegistry'
import { filterTalosSlashCommands } from '../../../lib/talosSlashCommands'

const props = defineProps<{
    commands: TalosCommand[]
    query: string
    activeIndex: number
}>()

const emit = defineEmits<{
    selected: [id: TalosCommand['id']]
}>()

const filteredCommands = computed(() => filterTalosSlashCommands(props.commands, props.query))

function selectCommand(command: TalosCommand) {
    if (!isTalosCommandEnabled(command)) {
        return
    }

    emit('selected', command.id)
}
</script>

<template>
    <section
        data-testid="talos-slash-command-menu"
        class="talos-composer-popover talos-slash-command-menu rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] shadow-xl shadow-[var(--talos-shadow)]"
    >
        <div class="border-b border-[var(--talos-border)] px-3 py-2 text-[11px] font-semibold uppercase text-[var(--talos-muted)]">
            Slash commands
        </div>
        <div class="max-h-72 overflow-y-auto p-2" role="listbox" aria-label="Composer slash commands">
            <button
                v-for="(command, index) in filteredCommands"
                :key="command.id"
                type="button"
                role="option"
                class="grid w-full gap-1 rounded-md px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--talos-accent)]"
                :class="[
                    isTalosCommandEnabled(command)
                        ? 'text-[var(--talos-text)] hover:bg-[var(--talos-active)]'
                        : 'cursor-not-allowed text-[var(--talos-muted)] opacity-70',
                    index === activeIndex ? 'bg-[var(--talos-active)]' : '',
                ]"
                :aria-disabled="!isTalosCommandEnabled(command)"
                :aria-selected="index === activeIndex"
                @mousedown.prevent
                @click="selectCommand(command)"
            >
                <span class="flex min-w-0 items-center justify-between gap-3">
                    <span class="truncate text-sm font-semibold">{{ command.slash }} {{ command.label }}</span>
                    <span class="shrink-0 rounded-sm border border-[var(--talos-border-strong)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--talos-muted)]">
                        {{ command.category }}
                    </span>
                </span>
                <span class="text-xs leading-5 text-[var(--talos-muted)]">{{ command.description }}</span>
                <span v-if="command.disabledReason" class="text-xs leading-5 text-[var(--talos-warning)]">
                    {{ command.disabledReason }}
                </span>
            </button>

            <div v-if="filteredCommands.length === 0" class="px-3 py-6 text-center text-sm text-[var(--talos-muted)]">
                No slash commands match this input.
            </div>
        </div>
    </section>
</template>
