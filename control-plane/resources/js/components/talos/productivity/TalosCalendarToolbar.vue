<script setup lang="ts">
import { CalendarPlus, ChevronLeft, ChevronRight, RefreshCw, Settings } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import type { TalosCalendarViewMode } from '../../../lib/talosCalendar'

const props = defineProps<{
    currentMonth: string
    viewMode: TalosCalendarViewMode
    loading: boolean
}>()

const emit = defineEmits<{
    previous: []
    today: []
    next: []
    refresh: []
    newEvent: []
    toggleSettings: []
    'update:viewMode': [mode: TalosCalendarViewMode]
}>()

const modes: Array<{ value: TalosCalendarViewMode, label: string }> = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' },
    { value: 'agenda', label: 'Agenda' },
]
</script>

<template>
    <div class="flex flex-col gap-3 border-b border-[var(--talos-border)] p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0">
                <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Current month</div>
                <div class="mt-1 truncate text-lg font-semibold text-[var(--talos-text)]">{{ props.currentMonth }}</div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="icon" aria-label="Previous month" @click="emit('previous')">
                    <ChevronLeft class="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="sm" @click="emit('today')">
                    Today
                </Button>
                <Button type="button" variant="outline" size="icon" aria-label="Next month" @click="emit('next')">
                    <ChevronRight class="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Settings" @click="emit('toggleSettings')">
                    <Settings class="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Refresh" :disabled="props.loading" @click="emit('refresh')">
                    <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': props.loading }" />
                </Button>
                <Button type="button" size="sm" @click="emit('newEvent')">
                    <CalendarPlus class="h-4 w-4" />
                    New event
                </Button>
            </div>
        </div>

        <div aria-label="Calendar view mode" class="inline-flex w-fit rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-1">
            <button
                v-for="mode in modes"
                :key="mode.value"
                type="button"
                class="rounded px-3 py-1.5 text-xs font-medium text-[var(--talos-muted)] transition-colors hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :class="props.viewMode === mode.value ? 'bg-[var(--talos-active)] text-[var(--talos-text)] shadow-sm' : ''"
                @click="emit('update:viewMode', mode.value)"
            >
                {{ mode.label }}
            </button>
        </div>
    </div>
</template>
