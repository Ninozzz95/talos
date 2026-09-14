<script setup lang="ts">
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import { useTalosI18n } from '@/i18n'
import { talosActivityToolName } from '@/lib/chat/turnActivities'
import type { TalosRunCost } from '@/lib/chat/runCost'
import type { TalosRunRecord } from '@/lib/chat/runDetails'
import { TALOS_TOOL_LABEL_KEYS, talosToolActivityDetail, talosToolActivityLabel } from '@/lib/tools/toolLabels'

/**
 * «Dettagli esecuzione» — owner 2026-09-13: token e costo, tempi, attrezzi usati e loro
 * esito (NON modello e provider).
 *
 * ⛔ Tre modi di non sapere, e ognuno ha la sua frase:
 * - un messaggio salvato prima della fase 1b non ha `run`: «non registrato per questo
 *   messaggio»;
 * - un conteggio che il fornitore non ha mandato: «non comunicato» — mai 0, che sarebbe
 *   un numero falso con l'aria di una misura;
 * - un costo senza prezzo nel listino: «non comunicato dal fornitore».
 */
interface RunActivity { id: string, operation: string, status: string, payload?: Record<string, unknown> }
const props = withDefaults(defineProps<{
    /** undefined = in lettura; 'unavailable' = non si e' potuto leggere, e il foglio non finge un elenco vuoto. */
    activities: readonly RunActivity[] | 'unavailable' | undefined
    /** null = non registrato (messaggio precedente alla misura). */
    run?: TalosRunRecord | null
    /** undefined = costo in calcolo (il listino si sta leggendo). */
    cost?: TalosRunCost
}>(), { run: null, cost: undefined })
const emit = defineEmits<{ close: [] }>()
const { t, locale } = useTalosI18n()

function activityLabel(activity: RunActivity): string {
    const name = talosActivityToolName(activity.operation)
    const key = TALOS_TOOL_LABEL_KEYS[name]
    // Lo stesso estrattore delle righe mentre il modello lavora: una query o un sito, mai l'oggetto intero.
    const input = activity.payload?.input
    const detail = input && typeof input === 'object' ? talosToolActivityDetail(name, JSON.stringify(input)) : null
    return talosToolActivityLabel({ name, detail }, key ? t(key) : undefined)
}

const STATUS_KEYS: Record<string, string> = {
    succeeded: 'chat.toolStatusSucceeded',
    failed: 'chat.toolStatusFailed',
    pending: 'chat.toolStatusPending',
    cancelled: 'chat.toolStatusCancelled',
    recovery_required: 'chat.toolStatusRecovery',
}
function statusLabel(status: string): string {
    const key = STATUS_KEYS[status]
    return key ? t(key) : status
}

const count = (value: number) => new Intl.NumberFormat(locale.value).format(value)
const tokens = (value: number | null) => (value === null ? t('chat.runNotReported') : count(value))
const seconds = (ms: number) => t('chat.runSeconds', { value: new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(ms / 1000) })
/** Dollari con tre cifre significative: un giro costa spesso frazioni di centesimo. */
const usd = (value: number) => new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD', maximumSignificantDigits: 3 }).format(value)
const giorno = (iso: string) => {
    const date = new Date(`${iso}T12:00:00Z`)
    return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short' }).format(date)
}

function costLabel(cost: TalosRunCost | undefined): string {
    if (cost === undefined) return t('chat.runDetailsLoading')
    switch (cost.kind) {
        case 'real': return usd(cost.usd)
        case 'free': return t('chat.runCostFree')
        case 'estimate': return t('chat.runCostEstimate', { amount: usd(cost.usd), date: giorno(cost.priceListDate) })
        default: return t('chat.runCostUnknown')
    }
}
</script>

<template>
    <TalosMobileComposerSheet :title="$t('chat.runDetails')" testid="talos-run-details-sheet" @close="emit('close')">
        <section class="talos-run-section" data-testid="talos-run-usage">
            <h3 class="talos-run-heading">{{ $t('chat.runDetailsUsage') }}</h3>
            <p v-if="!props.run" class="talos-run-muted">{{ $t('chat.runDetailsNotRecorded') }}</p>
            <dl v-else class="talos-run-list">
                <div class="talos-run-row" data-testid="talos-run-input">
                    <dt class="talos-run-tool">{{ $t('chat.runTokensInput') }}</dt>
                    <dd class="talos-run-value">
                        {{ tokens(props.run.tokens.input) }}
                        <small v-if="props.run.tokens.cached !== null && props.run.tokens.cached > 0" class="talos-run-note">{{ $t('chat.runTokensCached', { count: count(props.run.tokens.cached) }) }}</small>
                    </dd>
                </div>
                <div class="talos-run-row" data-testid="talos-run-output">
                    <dt class="talos-run-tool">{{ $t('chat.runTokensOutput') }}</dt>
                    <dd class="talos-run-value">
                        {{ tokens(props.run.tokens.output) }}
                        <small v-if="props.run.tokens.reasoning !== null && props.run.tokens.reasoning > 0" class="talos-run-note">{{ $t('chat.runTokensReasoning', { count: count(props.run.tokens.reasoning) }) }}</small>
                    </dd>
                </div>
                <div class="talos-run-row" data-testid="talos-run-cost" :data-cost="props.cost?.kind ?? 'loading'">
                    <dt class="talos-run-tool">{{ $t('chat.runCost') }}</dt>
                    <dd class="talos-run-value">{{ costLabel(props.cost) }}</dd>
                </div>
            </dl>
        </section>
        <section class="talos-run-section" data-testid="talos-run-timings">
            <h3 class="talos-run-heading">{{ $t('chat.runDetailsTimings') }}</h3>
            <p v-if="!props.run || props.run.totalMs === null" class="talos-run-muted">{{ $t('chat.runDetailsNotRecorded') }}</p>
            <dl v-else class="talos-run-list">
                <div v-if="props.run.firstChunkMs !== null" class="talos-run-row" data-testid="talos-run-first-chunk">
                    <dt class="talos-run-tool">{{ $t('chat.runTimingFirst') }}</dt>
                    <dd class="talos-run-value">{{ seconds(props.run.firstChunkMs) }}</dd>
                </div>
                <div class="talos-run-row" data-testid="talos-run-total">
                    <dt class="talos-run-tool">{{ $t('chat.runTimingTotal') }}</dt>
                    <dd class="talos-run-value">{{ seconds(props.run.totalMs) }}</dd>
                </div>
                <div v-if="props.run.rounds > 1" class="talos-run-row" data-testid="talos-run-rounds">
                    <dt class="talos-run-tool">{{ $t('chat.runTimingRounds') }}</dt>
                    <dd class="talos-run-value">{{ count(props.run.rounds) }}</dd>
                </div>
            </dl>
        </section>
        <section class="talos-run-section" data-testid="talos-run-tools">
            <h3 class="talos-run-heading">{{ $t('chat.runDetailsTools') }}</h3>
            <p v-if="props.activities === undefined" class="talos-run-muted" role="status">{{ $t('chat.runDetailsLoading') }}</p>
            <p v-else-if="props.activities === 'unavailable'" class="talos-run-muted">{{ $t('chat.runDetailsToolsUnavailable') }}</p>
            <p v-else-if="props.activities.length === 0" class="talos-run-muted">{{ $t('chat.runDetailsNoTools') }}</p>
            <ul v-else class="talos-run-list" role="list">
                <li v-for="activity in props.activities" :key="activity.id" class="talos-run-row" :data-status="activity.status">
                    <span class="talos-run-tool">{{ activityLabel(activity) }}</span>
                    <span class="talos-run-status">{{ statusLabel(activity.status) }}</span>
                </li>
            </ul>
        </section>
    </TalosMobileComposerSheet>
</template>

<style scoped>
.talos-run-section { display: flex; flex-direction: column; gap: 0.25rem; padding-block: 0.25rem; }
.talos-run-heading { font-size: var(--text-sm); font-weight: 600; color: var(--talos-text); }
.talos-run-muted { font-size: var(--text-sm); color: var(--talos-muted); }
.talos-run-list { display: flex; flex-direction: column; margin: 0; }
.talos-run-row { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; min-height: 2.5rem; padding-block: 0.5rem; font-size: var(--text-sm); color: var(--talos-text); }
.talos-run-tool { min-width: 0; overflow-wrap: anywhere; }
.talos-run-value { flex: none; margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
.talos-run-note { display: block; color: var(--talos-muted); font-size: var(--text-xs); }
.talos-run-status { flex: none; color: var(--talos-muted); }
/* La coppia di pericolo (talosContrast.ts): il solo colore su fondo neutro era quasi bianco sul Pad. */
.talos-run-row[data-status='failed'] .talos-run-status { padding: 0.0625rem 0.5rem; border-radius: 999px; background: var(--talos-danger-soft); color: var(--talos-danger); }
</style>
