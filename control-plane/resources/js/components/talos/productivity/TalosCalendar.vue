<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, CalendarClock, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import Button from '../../ui/Button.vue'
import Surface from '../../ui/Surface.vue'
import { useTalosProductivity, type TalosCreateCalendarDraftInput } from '../../../composables/useTalosProductivity'
import { useTalosGoogle } from '../../../composables/useTalosGoogle'
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

const {
    accounts: googleAccounts,
    calendars: googleCalendars,
    loading: googleLoading,
    actionMessage: googleActionMessage,
    errorMessage: googleErrorMessage,
    loadAccounts: loadGoogleAccounts,
    loadCalendars: loadGoogleCalendars,
    syncCalendar,
    publishCalendarDraft,
} = useTalosGoogle()

const today = new Date()
const currentMonth = ref(new Date(today.getFullYear(), today.getMonth(), 1))
const selectedDate = ref(today)
const viewMode = ref<TalosCalendarViewMode>('month')
const settingsOpen = ref(false)
const editorOpen = ref(false)
const quickAddText = ref('')
const quickAddError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const selectedGoogleCalendarId = ref<string | null>(null)
const searchTerm = ref('')

const quickAddErrorMessage = `Could not parse quick add. Try "${TALOS_CALENDAR_QUICK_ADD_EXAMPLES[0]}", "${TALOS_CALENDAR_QUICK_ADD_EXAMPLES[1]}", or "${TALOS_CALENDAR_QUICK_ADD_EXAMPLES[2]}".`
const visibleError = computed(() => actionError.value || productivityError.value || googleErrorMessage.value)
const visibleActionMessage = computed(() => googleActionMessage.value)
const monthDays = computed(() => buildMonthGrid(currentMonth.value))
const selectedDateKey = computed(() => dateKey(selectedDate.value))
const currentMonthLabel = computed(() => monthLabel(currentMonth.value))
const selectedDateLabel = computed(() => selectedDate.value.toLocaleDateString([], { dateStyle: 'full' }))
const connectedGoogleAccount = computed(() => googleAccounts.value.find((account) => account.provider === 'google' && account.status === 'connected') ?? null)
const googleCalendarWriteGranted = computed(() => {
    const scopes = connectedGoogleAccount.value?.scopes ?? []

    return scopes.includes('https://www.googleapis.com/auth/calendar.events')
        || scopes.includes('https://www.googleapis.com/auth/calendar')
})
const externalGoogleEvents = computed(() => calendarDrafts.value.filter((draft) => {
    const metadata = draft.metadata && typeof draft.metadata === 'object' && !Array.isArray(draft.metadata)
        ? draft.metadata as Record<string, unknown>
        : {}

    return draft.external_provider === 'google_calendar' || metadata.external_provider === 'google_calendar'
}))
const publishDisabledReason = computed(() => googleCalendarWriteGranted.value
    ? 'Select a confirmed draft before publishing.'
    : 'External writes require confirmation.')

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

async function refreshGoogleCalendar() {
    try {
        const accounts = await loadGoogleAccounts()
        const account = accounts.find((item) => item.provider === 'google' && item.status === 'connected')
        if (!account) {
            return
        }

        const response = await loadGoogleCalendars(account.id)
        selectedGoogleCalendarId.value = response.calendars.find((calendar) => calendar.primary)?.id
            ?? response.calendars[0]?.id
            ?? null
    } catch {
        // The composable owns the user-facing error message.
    }
}

async function syncGoogleCalendar() {
    if (!connectedGoogleAccount.value) {
        actionError.value = 'Connect Google Workspace before syncing Calendar.'
        return
    }

    actionError.value = null

    try {
        const response = await syncCalendar(connectedGoogleAccount.value.id, selectedGoogleCalendarId.value)
        calendarDrafts.value = [
            ...response.events,
            ...calendarDrafts.value.filter((draft) => !response.events.some((event) => event.id === draft.id)),
        ]
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not sync Google Calendar.'
    }
}

async function publishFirstDraftToGoogle() {
    if (!connectedGoogleAccount.value || !googleCalendarWriteGranted.value) {
        return
    }

    const draft = calendarDrafts.value.find((item) => !item.external_event_id && item.confirmation_required === false)
    if (!draft) {
        actionError.value = 'Select a confirmed draft before publishing.'
        return
    }

    try {
        const published = await publishCalendarDraft(draft.id, connectedGoogleAccount.value.id, true, selectedGoogleCalendarId.value)
        calendarDrafts.value = [
            published,
            ...calendarDrafts.value.filter((item) => item.id !== published.id),
        ]
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not publish this calendar draft.'
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
    void refreshGoogleCalendar()
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

            <div v-if="visibleActionMessage" class="flex items-start gap-2 rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <CheckCircle2 class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-success)]" />
                <span>{{ visibleActionMessage }}</span>
            </div>

            <div v-if="settingsOpen" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex items-start gap-2 text-xs leading-5 text-[var(--talos-muted)]">
                    <ShieldCheck class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-success)]" />
                    <span>Provider policy: local confirmation updates TALOS drafts and emits an audit event. Google or CalDAV writes stay disabled until a connector policy is configured.</span>
                </div>
            </div>

            <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <div class="text-sm font-semibold text-[var(--talos-text)]">Google Calendar</div>
                        <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                            Synced events enter TALOS as untrusted drafts.
                        </p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <a
                            v-if="!connectedGoogleAccount"
                            href="/integrations/google/redirect"
                            class="inline-flex h-8 items-center justify-center rounded-md border border-[var(--talos-accent-border)] bg-[var(--talos-accent)] px-3 text-sm font-medium text-[var(--talos-accent-text)]"
                        >
                            Connect Google
                        </a>
                        <Button
                            v-if="connectedGoogleAccount"
                            type="button"
                            size="sm"
                            variant="secondary"
                            aria-label="Sync Google Calendar"
                            :disabled="googleLoading"
                            @click="syncGoogleCalendar"
                        >
                            <Loader2 v-if="googleLoading" class="h-4 w-4 animate-spin" />
                            <RefreshCw v-else class="h-4 w-4" />
                            Sync
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            :disabled="!googleCalendarWriteGranted || googleLoading"
                            :title="publishDisabledReason"
                            @click="publishFirstDraftToGoogle"
                        >
                            <ShieldCheck class="h-4 w-4" />
                            Publish to Google
                        </Button>
                    </div>
                </div>

                <div class="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,auto)]">
                    <div class="min-w-0 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                        <div v-if="connectedGoogleAccount" class="space-y-2">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ connectedGoogleAccount.email ?? connectedGoogleAccount.display_name ?? 'Google account' }}</span>
                                <Badge tone="success">{{ connectedGoogleAccount.status }}</Badge>
                                <Badge v-if="googleCalendarWriteGranted" tone="success">write scope</Badge>
                                <Badge v-else tone="warning">read only</Badge>
                            </div>
                            <label v-if="googleCalendars.length" class="block">
                                <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Calendar</span>
                                <select
                                    v-model="selectedGoogleCalendarId"
                                    class="mt-1 h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:border-[var(--talos-ring)]"
                                    aria-label="Google calendar selector"
                                >
                                    <option v-for="calendar in googleCalendars" :key="calendar.id" :value="calendar.id">
                                        {{ calendar.summary }}{{ calendar.primary ? ' - primary' : '' }}
                                    </option>
                                </select>
                            </label>
                        </div>
                        <p v-else class="text-sm leading-6 text-[var(--talos-muted)]">
                            No Google account returned by `/api/talos/google/accounts`.
                        </p>
                    </div>
                    <div class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] p-3 text-sm leading-6 text-[var(--talos-text)]">
                        {{ publishDisabledReason }}
                    </div>
                </div>

                <div v-if="externalGoogleEvents.length" class="mt-3 grid gap-2">
                    <article v-for="event in externalGoogleEvents" :key="event.id" class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2">
                        <span class="truncate text-sm text-[var(--talos-text)]">{{ event.title }}</span>
                        <Badge tone="warning">Google Calendar / untrusted</Badge>
                    </article>
                </div>
            </section>

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
