<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, CalendarClock, Loader2, Plus, RefreshCw } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import { useTalosProductivity } from '../../../composables/useTalosProductivity'

const {
    calendarDrafts,
    loadingCalendarDrafts,
    creatingCalendarDraft,
    productivityError,
    loadCalendarDrafts,
    createCalendarDraft,
} = useTalosProductivity()

const title = ref('')
const startsAt = ref('')
const endsAt = ref('')
const actionError = ref<string | null>(null)
const visibleError = computed(() => actionError.value || productivityError.value)
const canCreate = computed(() => title.value.trim().length > 0 && startsAt.value && endsAt.value && !creatingCalendarDraft.value)

async function refreshDrafts() {
    actionError.value = null

    try {
        await loadCalendarDrafts()
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not refresh calendar drafts.'
    }
}

async function submitDraft() {
    if (!canCreate.value) {
        return
    }

    actionError.value = null

    try {
        await createCalendarDraft({
            title: title.value.trim(),
            starts_at: startsAt.value,
            ends_at: endsAt.value,
            timezone: 'Europe/Rome',
        })
        title.value = ''
        startsAt.value = ''
        endsAt.value = ''
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not create this calendar draft.'
    }
}

onMounted(() => {
    void refreshDrafts()
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <CalendarClock class="h-4 w-4 text-[var(--talos-accent)]" />
                        Calendar drafts
                    </div>
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Draft-only scheduling</h3>
                </div>
                <Button type="button" variant="ghost" size="sm" :disabled="loadingCalendarDrafts" @click="refreshDrafts">
                    <Loader2 v-if="loadingCalendarDrafts" class="h-4 w-4 animate-spin" />
                    <RefreshCw v-else class="h-4 w-4" />
                    Sync
                </Button>
            </div>
        </div>

        <div class="space-y-4 p-4">
            <div v-if="visibleError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <AlertCircle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ visibleError }}</span>
            </div>

            <div class="grid gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <input v-model="title" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none" placeholder="Calendar draft title">
                <input v-model="startsAt" type="datetime-local" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none">
                <input v-model="endsAt" type="datetime-local" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none">
                <Button type="button" size="sm" :disabled="!canCreate" @click="submitDraft">
                    <Loader2 v-if="creatingCalendarDraft" class="h-4 w-4 animate-spin" />
                    <Plus v-else class="h-4 w-4" />
                    Add draft
                </Button>
            </div>

            <div v-if="!calendarDrafts.length && !loadingCalendarDrafts" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                No calendar drafts returned by `/api/talos/calendar-drafts`.
            </div>

            <article v-for="draft in calendarDrafts" :key="draft.id" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                        <div class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ draft.title }}</div>
                        <div class="mt-1 text-xs text-[var(--talos-muted)]">confirmation_required: {{ draft.confirmation_required }}</div>
                    </div>
                    <Badge tone="warning">{{ draft.status }}</Badge>
                </div>
            </article>
        </div>
    </Surface>
</template>
