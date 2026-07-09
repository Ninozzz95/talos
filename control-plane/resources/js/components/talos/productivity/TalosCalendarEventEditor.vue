<script setup lang="ts">
import { computed, ref } from 'vue'
import { Loader2, Plus } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import type { TalosCreateCalendarDraftInput } from '../../../composables/useTalosProductivity'

defineProps<{
    creating: boolean
}>()

const emit = defineEmits<{
    create: [input: TalosCreateCalendarDraftInput]
}>()

const title = ref('')
const description = ref('')
const startsAt = ref('')
const endsAt = ref('')
const timezone = ref('Europe/Rome')

const canCreate = computed(() => title.value.trim().length > 0 && startsAt.value.length > 0 && endsAt.value.length > 0)

function submit() {
    if (!canCreate.value) {
        return
    }

    emit('create', {
        title: title.value.trim(),
        description: description.value.trim() || null,
        starts_at: startsAt.value,
        ends_at: endsAt.value,
        timezone: timezone.value.trim() || 'Europe/Rome',
        metadata: { source: 'talos_calendar_editor' },
    })

    title.value = ''
    description.value = ''
    startsAt.value = ''
    endsAt.value = ''
}
</script>

<template>
    <form class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3" @submit.prevent="submit">
        <div class="flex items-center justify-between gap-3">
            <h4 class="text-sm font-semibold text-[var(--talos-text)]">Create calendar draft</h4>
            <span class="text-xs text-[var(--talos-muted)]">External writes require confirmation.</span>
        </div>
        <div class="mt-3 grid gap-2 md:grid-cols-2">
            <input v-model="title" aria-label="Event title" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none" placeholder="Event title">
            <input v-model="timezone" aria-label="Event timezone" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none" placeholder="Timezone">
            <input v-model="startsAt" aria-label="Starts at" type="datetime-local" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none">
            <input v-model="endsAt" aria-label="Ends at" type="datetime-local" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none">
            <textarea v-model="description" aria-label="Event description" class="min-h-[72px] rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 text-sm text-[var(--talos-text)] outline-none md:col-span-2" placeholder="Description" />
        </div>
        <Button type="submit" size="sm" class="mt-3" :disabled="!canCreate || creating">
            <Loader2 v-if="creating" class="h-4 w-4 animate-spin" />
            <Plus v-else class="h-4 w-4" />
            Create draft
        </Button>
    </form>
</template>
