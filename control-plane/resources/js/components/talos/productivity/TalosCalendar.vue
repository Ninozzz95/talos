<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, CalendarClock, ShieldCheck } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import { useTalosProductivity, type TalosCreateCalendarDraftInput } from '../../../composables/useTalosProductivity'
import {
    buildMonthGrid,
    dateKey,
    draftsForDay,
    monthLabel,
    parseQuickAddEvent,
    TALOS_CALENDAR_QUICK_ADD_EXAMPLES,
    type TalosCalendarDay,
    type TalosCalendarViewMode,
} from '../../../lib/talosCalendar'
import type { TalosCalendarDraft } from '../../../lib/talosTypes'
import TalosCalendarEventEditor from './TalosCalendarEventEditor.vue'
import TalosCalendarEventList from './TalosCalendarEventList.vue'
import TalosCalendarGrid from './TalosCalendarGrid.vue'
import TalosCalendarQuickAdd from './TalosCalendarQuickAdd.vue'
import TalosCalendarToolbar from './TalosCalendarToolbar.vue'

const {
    calendarDrafts,
    loadingCalendarDrafts,
    creatingCalendarDraft,
    confirmingCalendarDraftId,
    productivityError,
    loadCalendarDrafts,
    createCalendarDraft,
    confirmCalendarDraft,
} = useTalosProductivity()

const today = new Date()
const currentMonth = ref(new Date(today.getFullYear(), today.getMonth(), 1))
const selectedDate = ref(today)
const viewMode = ref<TalosCalendarViewMode>('month')
const settingsOpen = ref(false)
const editorOpen = ref(false)
const quickAddText = ref('')
const quickAddError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const searchTerm = ref('')

const quickAddErrorMessage = `Could not parse quick add. Try "${TALOS_CALENDAR_QUICK_ADD_EXAMPLES[0]}", "${TALOS_CALENDAR_QUICK_ADD_EXAMPLES[1]}", or "${TALOS_CALENDAR_QUICK_ADD_EXAMPLES[2]}".`
const visibleError = computed(() => actionError.value || productivityError.value)
const monthDays = computed(() => buildMonthGrid(currentMonth.value))
const selectedDateKey = computed(() => dateKey(selectedDate.value))
const currentMonthLabel = computed(() => monthLabel(currentMonth.value))
const selectedDateLabel = computed(() => selectedDate.value.toLocaleDateString([], { dateStyle: 'full' }))

const eventsByDay = computed(() => calendarDrafts.value.reduce<Record<string, TalosCalendarDraft[]>>((events, draft) => {
    const key = dateKey(new Date(draft.starts_at))
    events[key] = [...(events[key] ?? []), draft]

    return events
}, {}))

const eventsForSelectedView = computed(() => {
    if (searchTerm.value.trim()) {
        return calendarDrafts.value
    }

    if (viewMode.value === 'agenda') {
        return [...calendarDrafts.value].sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())
    }

    if (viewMode.value === 'year') {
        return calendarDrafts.value.filter((draft) => new Date(draft.starts_at).getFullYear() === selectedDate.value.getFullYear())
    }

    if (viewMode.value === 'week') {
        const selected = selectedDate.value
        const weekStart = new Date(selected)
        weekStart.setDate(selected.getDate() - selected.getDay())
        weekStart.setHours(0, 0, 0, 0)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 7)

        return calendarDrafts.value.filter((draft) => {
            const startsAt = new Date(draft.starts_at)

            return startsAt >= weekStart && startsAt < weekEnd
        })
    }

    return draftsForDay(calendarDrafts.value, selectedDate.value)
})

const selectedListLabel = computed(() => {
    if (searchTerm.value.trim()) {
        return 'Search results'
    }

    if (viewMode.value === 'agenda') {
        return 'Agenda'
    }

    if (viewMode.value === 'year') {
        return `${selectedDate.value.getFullYear()} events`
    }

    if (viewMode.value === 'week') {
        return `Week containing ${selectedDateLabel.value}`
    }

    return `Events for ${selectedDateLabel.value}`
})

async function refreshDrafts() {
    actionError.value = null

    try {
        await loadCalendarDrafts()
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not refresh calendar drafts.'
    }
}

async function submitQuickAdd() {
    quickAddError.value = null
    actionError.value = null

    const parsed = parseQuickAddEvent(quickAddText.value, new Date(), 'Europe/Rome')
    if (!parsed) {
        quickAddError.value = quickAddErrorMessage
        return
    }

    try {
        await createCalendarDraft({
            ...parsed,
            attendees: [],
        })
        quickAddText.value = ''
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not create this calendar draft.'
    }
}

async function submitManualDraft(input: TalosCreateCalendarDraftInput) {
    actionError.value = null

    try {
        await createCalendarDraft(input)
        editorOpen.value = false
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not create this calendar draft.'
    }
}

async function confirmDraft(draft: TalosCalendarDraft) {
    actionError.value = null

    try {
        await confirmCalendarDraft(draft.id)
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not confirm this calendar draft.'
    }
}

function selectDay(day: TalosCalendarDay) {
    selectedDate.value = day.date
    if (day.date.getMonth() !== currentMonth.value.getMonth()) {
        currentMonth.value = new Date(day.date.getFullYear(), day.date.getMonth(), 1)
    }
}

function previousMonth() {
    const next = new Date(currentMonth.value)
    next.setMonth(next.getMonth() - 1)
    currentMonth.value = next
}

function nextMonth() {
    const next = new Date(currentMonth.value)
    next.setMonth(next.getMonth() + 1)
    currentMonth.value = next
}

function selectToday() {
    const now = new Date()
    currentMonth.value = new Date(now.getFullYear(), now.getMonth(), 1)
    selectedDate.value = now
}

onMounted(() => {
    void refreshDrafts()
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <CalendarClock class="h-4 w-4 text-[var(--talos-accent)]" />
                        Calendar
                    </div>
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Calendar V3</h3>
                    <p class="mt-1 max-w-2xl text-xs leading-5 text-[var(--talos-muted)]">
                        Draft-first scheduling with explicit HMI confirmation before external provider writes; new events keep confirmation_required true until reviewed.
                    </p>
                </div>
                <Badge tone="warning">draft-only external writes</Badge>
            </div>
        </div>

        <TalosCalendarToolbar
            :current-month="currentMonthLabel"
            :view-mode="viewMode"
            :loading="loadingCalendarDrafts"
            @previous="previousMonth"
            @today="selectToday"
            @next="nextMonth"
            @refresh="refreshDrafts"
            @new-event="editorOpen = !editorOpen"
            @toggle-settings="settingsOpen = !settingsOpen"
            @update:view-mode="viewMode = $event"
        />

        <div class="space-y-4 p-4">
            <div v-if="visibleError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <AlertCircle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ visibleError }}</span>
            </div>

            <div v-if="settingsOpen" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex items-start gap-2 text-xs leading-5 text-[var(--talos-muted)]">
                    <ShieldCheck class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-success)]" />
                    <span>Provider policy: local confirmation updates TALOS drafts and emits an audit event. Google or CalDAV writes stay disabled until a connector policy is configured.</span>
                </div>
            </div>

            <TalosCalendarQuickAdd
                v-model="quickAddText"
                :disabled="creatingCalendarDraft"
                :error="quickAddError"
                @submit="submitQuickAdd"
            />

            <TalosCalendarEventEditor
                v-if="editorOpen"
                :creating="creatingCalendarDraft"
                @create="submitManualDraft"
            />

            <div v-if="!calendarDrafts.length && !loadingCalendarDrafts" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                No calendar drafts returned by `/api/talos/calendar-drafts`.
            </div>

            <div class="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
                <TalosCalendarGrid
                    :days="monthDays"
                    :events-by-day="eventsByDay"
                    :selected-date-key="selectedDateKey"
                    @select-day="selectDay"
                />

                <TalosCalendarEventList
                    v-model:search-term="searchTerm"
                    :events="eventsForSelectedView"
                    :selected-label="selectedListLabel"
                    :confirming-draft-id="confirmingCalendarDraftId"
                    @confirm="confirmDraft"
                />
            </div>
        </div>
    </Surface>
</template>
