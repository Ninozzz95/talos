<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2 } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import Button from '../../ui/Button.vue'
import type { TalosCalendarDraft } from '../../../lib/talosTypes'

const props = defineProps<{
    events: TalosCalendarDraft[]
    searchTerm: string
    selectedLabel: string
    confirmingDraftId: string | null
}>()

const emit = defineEmits<{
    'update:searchTerm': [value: string]
    confirm: [draft: TalosCalendarDraft]
}>()

const filteredEvents = computed(() => {
    const needle = props.searchTerm.trim().toLowerCase()
    if (!needle) {
        return props.events
    }

    return props.events.filter((event) => [
        event.title,
        event.description ?? '',
        event.status,
        event.timezone,
    ].join(' ').toLowerCase().includes(needle))
})

function formatRange(draft: TalosCalendarDraft) {
    const start = new Date(draft.starts_at)
    const end = new Date(draft.ends_at)

    return `${start.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} -> ${end.toLocaleTimeString([], { timeStyle: 'short' })}`
}
</script>

<template>
    <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
                <h4 class="text-sm font-semibold text-[var(--talos-text)]">{{ props.selectedLabel }}</h4>
                <p class="mt-1 text-xs text-[var(--talos-muted)]">Local drafts are visible before any external provider write.</p>
            </div>
            <label class="sr-only" for="talos-calendar-search">Search all events</label>
            <input
                id="talos-calendar-search"
                :value="props.searchTerm"
                aria-label="Search all events"
                class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:border-[var(--talos-ring)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring-soft)] md:w-56"
                placeholder="Search all events"
                @input="emit('update:searchTerm', ($event.target as HTMLInputElement).value)"
            >
        </div>

        <div v-if="!filteredEvents.length" class="mt-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-4 text-sm text-[var(--talos-muted)]">
            No calendar drafts match this view.
        </div>

        <div v-else class="mt-3 space-y-2">
            <article v-for="event in filteredEvents" :key="event.id" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                        <div class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ event.title }}</div>
                        <div class="mt-1 text-xs text-[var(--talos-muted)]">{{ formatRange(event) }} · {{ event.timezone }}</div>
                        <div class="mt-1 text-xs text-[var(--talos-muted)]">confirmation_required: {{ event.confirmation_required }}</div>
                    </div>
                    <div class="flex shrink-0 flex-wrap items-center gap-2">
                        <Badge :tone="event.status === 'confirmed' ? 'success' : 'warning'">{{ event.status }}</Badge>
                        <Button
                            v-if="event.confirmation_required"
                            type="button"
                            size="sm"
                            variant="outline"
                            :disabled="props.confirmingDraftId === event.id"
                            @click="emit('confirm', event)"
                        >
                            <CheckCircle2 class="h-4 w-4" />
                            Confirm draft
                        </Button>
                    </div>
                </div>
                <p v-if="event.description" class="mt-2 text-xs leading-5 text-[var(--talos-muted)]">{{ event.description }}</p>
            </article>
        </div>
    </section>
</template>
