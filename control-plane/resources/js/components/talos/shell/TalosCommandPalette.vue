<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search } from '@lucide/vue'
import type { TalosCommand } from '../../../lib/talosTypes'
import { isTalosCommandEnabled } from '../../../lib/commandRegistry'

const props = defineProps<{
    commands: TalosCommand[]
}>()

const emit = defineEmits<{
    selected: [id: TalosCommand['id']]
}>()

const query = ref('')

const filteredCommands = computed(() => {
    const normalizedQuery = query.value.trim().toLowerCase()

    if (!normalizedQuery) {
        return props.commands
    }

    return props.commands.filter((command) => [
        command.label,
        command.description,
        command.category,
        command.capability ?? '',
    ].some((value) => value.toLowerCase().includes(normalizedQuery)))
})

function selectCommand(command: TalosCommand) {
    if (!isTalosCommandEnabled(command)) {
        return
    }

    emit('selected', command.id)
}
</script>

<template>
    <section class="talos-command-palette talos-action-surface rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] shadow-lg shadow-[var(--talos-shadow)]">
        <div class="flex items-center gap-2 border-b border-[var(--talos-border)] px-3 py-2">
            <Search class="h-4 w-4 shrink-0 text-[var(--talos-muted)]" />
            <input
                v-model="query"
                type="search"
                class="h-9 min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)]"
                placeholder="Search TALOS commands"
                aria-label="Search TALOS commands"
            >
        </div>

        <div class="max-h-[420px] overflow-y-auto p-2" role="listbox" aria-label="TALOS commands">
            <button
                v-for="command in filteredCommands"
                :key="command.id"
                type="button"
                class="talos-command-row grid w-full gap-1 rounded-md px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--talos-accent)]"
                :class="isTalosCommandEnabled(command)
                    ? 'text-[var(--talos-text)] hover:bg-[var(--talos-active)]'
                    : 'cursor-not-allowed text-[var(--talos-muted)] opacity-70'"
                :aria-disabled="!isTalosCommandEnabled(command)"
                role="option"
                @click="selectCommand(command)"
            >
                <span class="flex min-w-0 items-center justify-between gap-3">
                    <span class="truncate text-sm font-semibold">{{ command.label }}</span>
                    <span class="shrink-0 rounded-sm border border-[var(--talos-border-strong)] bg-[var(--talos-panel-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-[var(--talos-text)]">
                        {{ command.category }}
                    </span>
                </span>
                <span class="text-xs leading-5 text-[var(--talos-muted)]">{{ command.description }}</span>
                <span v-if="command.disabledReason" class="text-xs leading-5 text-[var(--talos-warning)]">
                    {{ command.disabledReason }}
                </span>
            </button>

            <div v-if="filteredCommands.length === 0" class="px-3 py-8 text-center text-sm text-[var(--talos-muted)]">
                No commands match this search.
            </div>
        </div>
    </section>
</template>
