<script setup lang="ts">
import type { TalosCalendarDay } from '../../../lib/talosCalendar'
import type { TalosCalendarDraft } from '../../../lib/talosTypes'

const props = defineProps<{
    days: TalosCalendarDay[]
    eventsByDay: Record<string, TalosCalendarDraft[]>
    selectedDateKey: string
}>()

const emit = defineEmits<{
    'select-day': [day: TalosCalendarDay]
}>()

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
</script>

<template>
    <section aria-label="Month grid" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
        <div class="flex items-center justify-between gap-3">
            <h4 class="text-sm font-semibold text-[var(--talos-text)]">Month grid</h4>
            <span class="text-xs text-[var(--talos-muted)]">Drafts require HMI approval before external writes.</span>
        </div>

        <div class="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-[var(--talos-muted)]">
            <div v-for="weekday in weekdays" :key="weekday" class="py-1">{{ weekday }}</div>
        </div>

        <div class="mt-1 grid grid-cols-7 gap-1">
            <button
                v-for="day in props.days"
                :key="day.key"
                type="button"
                class="min-h-[76px] rounded-md border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :class="[
                    day.key === props.selectedDateKey
                        ? 'border-[var(--talos-accent-border)] bg-[var(--talos-active)]'
                        : 'border-[var(--talos-border)] bg-[var(--talos-panel)] hover:bg-[var(--talos-panel-soft)]',
                    day.inCurrentMonth ? 'text-[var(--talos-text)]' : 'text-[var(--talos-muted)] opacity-60',
                ]"
                :aria-label="`Select ${day.key}`"
                @click="emit('select-day', day)"
            >
                <div class="flex items-center justify-between gap-1">
                    <span class="text-xs font-semibold">{{ day.dayNumber }}</span>
                    <span v-if="day.isToday" class="rounded border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--talos-success)]">Today</span>
                </div>
                <div class="mt-2 space-y-1">
                    <div v-if="(props.eventsByDay[day.key] ?? []).length" class="inline-flex items-center gap-1 rounded bg-[var(--talos-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--talos-text)]">
                        <span class="h-1.5 w-1.5 rounded-full bg-[var(--talos-accent)]" />
                        {{ (props.eventsByDay[day.key] ?? []).length }} draft{{ (props.eventsByDay[day.key] ?? []).length === 1 ? '' : 's' }}
                    </div>
                </div>
            </button>
        </div>
    </section>
</template>
