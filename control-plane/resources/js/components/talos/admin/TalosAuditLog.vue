<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertCircle, ClipboardList, Loader2, Search } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import Surface from '../../ui/Surface.vue'
import { useTalosAdmin } from '../../../composables/useTalosAdmin'
import { resolveTalosCollectionState } from '../../../lib/talosCollectionState'

const props = defineProps<{
    token: string
}>()

const {
    auditEvents,
    loadingAdmin,
    adminError,
    loadAuditEvents,
} = useTalosAdmin()

const eventType = ref('')
const localError = ref<string | null>(null)
const auditRequested = ref(false)
const visibleError = computed(() => localError.value || adminError.value)
const auditState = computed(() => resolveTalosCollectionState({
    itemCount: auditEvents.value.length,
    loading: loadingAdmin.value,
    error: visibleError.value,
    requested: auditRequested.value,
}))

async function refreshAudit() {
    auditRequested.value = true
    localError.value = null

    try {
        await loadAuditEvents(props.token, eventType.value)
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not load audit events.'
    }
}
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <ClipboardList class="h-4 w-4 text-[var(--talos-accent)]" />
                        Audit log
                    </div>
                    <div class="mt-1 flex items-center gap-1.5">
                        <h3 class="text-base font-semibold text-[var(--talos-text)]">Redacted security events</h3>
                        <TalosGuideInfoButton guide-id="doctor.audit" compact side="bottom" />
                    </div>
                </div>
                <div class="flex gap-2">
                    <input v-model="eventType" aria-label="Audit event type filter" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none" placeholder="event_type">
                    <Button type="button" variant="ghost" size="sm" aria-label="Search audit events" title="Search audit events" :disabled="loadingAdmin || !token" @click="refreshAudit">
                        <Loader2 v-if="loadingAdmin" class="h-4 w-4 animate-spin" />
                        <Search v-else class="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>

        <div class="space-y-3 p-4">
            <div v-if="visibleError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <AlertCircle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ visibleError }}</span>
            </div>

            <div v-if="auditState === 'idle'" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                Enter an admin token and run Search to load persisted audit events.
            </div>

            <div v-if="auditState === 'loading'" role="status" class="flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm text-[var(--talos-muted)]">
                <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                Loading audit events
            </div>

            <div v-if="auditState === 'empty'" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                No persisted audit events returned by `/api/talos/admin/audit-events`.
            </div>

            <article v-for="event in auditEvents" :key="event.id" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                        <div class="font-mono text-xs font-semibold text-[var(--talos-text)]">{{ event.event_type }}</div>
                        <div class="mt-1 font-mono text-[11px] text-[var(--talos-muted)]">{{ event.subject_type }} / {{ event.subject_id }}</div>
                    </div>
                    <Badge tone="neutral">event_type</Badge>
                </div>
                <pre class="mt-3 max-h-[160px] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-[11px] leading-5 text-[var(--talos-muted)]">{{ JSON.stringify(event.payload, null, 2) }}</pre>
            </article>
        </div>
    </Surface>
</template>
