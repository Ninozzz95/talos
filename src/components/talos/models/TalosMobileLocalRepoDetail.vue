<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { AlertTriangle, ChevronDown, Download, ShieldAlert } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosModelFitBar from '@/components/talos/models/TalosModelFitBar.vue'
import TalosMobileMessageContent from '@/components/chat/TalosMobileMessageContent.vue'
import { useTalosI18n } from '@/i18n'
import { talosModelCardMarkdown } from '@/lib/models/modelCardMarkdown'
import { talosEstimatedCapacity } from '@/lib/models/fit'
import { talosFitBadge } from '@/lib/models/fitBadge'
import {
    talosFailureKey,
    talosFitVerdict,
    talosFormatBytes,
    talosRetryAfterSeconds,
    talosSetWarnings,
} from '@/lib/models/presentation'
import { talosModelSpeaks } from '@/lib/models/modelLanguages'
import { talosReadmeSummary } from '@/lib/models/readmeSummary'
import { talosDiscardModelTransfer } from '@/services/modelTransfer'
import {
    talosCloseModelRepo,
    talosDescribeModelRepo,
    talosDownloadSet,
    talosExamineSet,
    talosLocalModels,
    talosOpenModelRepo,
    talosRefreshDeviceCapacity,
    talosRefreshHuggingFaceToken,
    talosRefreshLeftovers,
    talosSetLocalContext,
} from '@/stores/localModels'

const props = defineProps<{
    repoId: string
    revision: string
}>()

const { t, locale } = useTalosI18n()
const store = talosLocalModels
const refused = ref<string | null>(null)
const card = ref<{
    author: string | null
    license: string | null
    languages: readonly string[]
    readme: string
    updatedAt: string | null
} | null>(null)
let loadGeneration = 0

const repo = computed(() => store.repo?.id === props.repoId ? store.repo : null)
const summary = computed(() => talosReadmeSummary(card.value?.readme ?? ''))
const schedaAperta = ref(false)
const schedaLeggibile = computed(() => talosModelCardMarkdown(card.value?.readme ?? ''))
const cardTags = computed(() => [card.value?.author, card.value?.license]
    .filter((value): value is string => typeof value === 'string' && value.length > 0))

/**
 * Se questo modello dichiara di parlare la lingua dell'interfaccia.
 *
 * L'avviso si mostra QUI, sulla pagina del repository, perche' e' l'ultimo
 * momento prima di impegnare due gigabyte. Owner 2026-08-05: aveva scaricato un
 * modello coreano e gli aveva parlato italiano — e niente gliel'aveva detto.
 *
 * Solo `no` diventa un avviso: `unknown` non e' un'accusa, e `yes` non merita
 * una riga su ogni schermata.
 */
const lingua = computed(() => talosModelSpeaks(card.value?.languages, locale.value))
const freeMemory = computed(() => store.device?.availableRamBytes
    ? talosFormatBytes(store.device.availableRamBytes)
    : null)
const rows = computed(() => (repo.value?.sets ?? []).map((set) => {
    const fileBytes = set.incomplete ? null : set.totalBytes
    const capacity = talosEstimatedCapacity({
        fileBytes,
        workingBytes: fileBytes === null ? null : fileBytes * 1.25,
        device: store.device,
    })
    const badge = talosFitBadge(capacity)
    return {
        set,
        key: set.paths[0]!,
        size: talosFormatBytes(set.totalBytes),
        warnings: talosSetWarnings(set),
        verdict: set.examination.state === 'read'
            ? talosFitVerdict(set.examination.fit, store.context)
            : null,
        badge: {
            ...badge,
            delta: capacity.state === 'unknown'
                ? null
                : talosFormatBytes(Math.abs(capacity.availableBytes - capacity.needsBytes)),
            hasHeadroom: capacity.state === 'fits' || capacity.state === 'tight',
        },
    }
}))

function explain(reason: string): string {
    const key = talosFailureKey(reason)
    const seconds = talosRetryAfterSeconds(reason)
    if (key === null) return reason
    return seconds === null ? t(key) : `${t(key)} (${seconds}s)`
}

async function load(): Promise<void> {
    const generation = ++loadGeneration
    refused.value = null
    card.value = null
    // Un altro modello è un'altra scheda: chiusa, come la si trova la prima volta.
    schedaAperta.value = false

    const description = Promise.resolve()
        .then(() => talosDescribeModelRepo(props.repoId))
        .catch(() => null)
    await Promise.all([
        talosOpenModelRepo(props.repoId, props.revision),
        Promise.allSettled([
            talosRefreshDeviceCapacity(),
            talosRefreshLeftovers(),
            talosRefreshHuggingFaceToken(),
        ]),
    ])
    const nextCard = await description
    if (generation === loadGeneration) card.value = nextCard
}

watch(() => [props.repoId, props.revision] as const, () => { void load() }, { immediate: true })

onUnmounted(() => {
    loadGeneration += 1
    if (store.repo?.id === props.repoId) talosCloseModelRepo()
})

async function start(key: string, label: string): Promise<void> {
    refused.value = null
    const result = await talosDownloadSet(key, label)
    if (result.ok) {
        return
    }
    refused.value = result.reason === 'already-running'
        ? t('localModels.alreadyRunning')
        : `${t('localModels.refused')} ${explain(result.reason)}`
}

async function acceptCounterOffer(key: string, context: number): Promise<void> {
    talosSetLocalContext(context)
    await talosExamineSet(key)
}

async function reclaim(): Promise<void> {
    for (const leftover of store.leftovers.items) await talosDiscardModelTransfer(leftover.path)
    await talosRefreshLeftovers()
}
</script>

<template>
    <div data-testid="talos-models-repo-detail" class="flex min-w-0 flex-col gap-[var(--talos-space-section)]">
        <h1 data-testid="talos-models-repo-title" class="break-words font-mono text-base font-semibold leading-snug text-[var(--talos-text)]">{{ repoId }}</h1>

        <section v-if="card" data-testid="talos-models-card" class="flex min-w-0 flex-col gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-[var(--talos-space-control)]">
            <div class="flex flex-wrap gap-[var(--talos-space-inline)]">
                <span v-for="tag in cardTags" :key="tag" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)] font-mono text-2xs text-[var(--talos-muted)]">{{ tag }}</span>
            </div>
            <!-- L'avviso di lingua. Solo quando il modello DICHIARA le sue
                 lingue e la tua non c'e': un «non si sa» qui sarebbe rumore, e
                 un «si» una riga inutile su ogni schermata. -->
            <p
                v-if="lingua === 'no'"
                role="status"
                data-testid="talos-models-language-warning"
                class="flex min-w-0 items-start gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] border border-[var(--talos-warning)]/40 bg-[var(--talos-warning)]/10 px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)] text-xs leading-5 text-[var(--talos-text)]"
            >{{ t('localModels.languageWarning', { languages: (card?.languages ?? []).join(', ') }) }}</p>
            <p v-if="summary" data-testid="talos-models-readme-summary" class="line-clamp-2 text-xs leading-5 text-[var(--talos-text)]">{{ summary }}</p>
            <!-- La scheda si legge, non si guarda in sorgente. Il contenuto si
                 monta solo quando il pannello è aperto: un README del Hub arriva
                 anche a centomila caratteri, e pagarne il rendering per chi non
                 lo apre sarebbe pagarlo sempre. -->
            <details
                v-if="schedaLeggibile"
                data-testid="talos-models-readme-full"
                class="border-t border-[var(--talos-border)] pt-[var(--talos-space-inline)]"
                @toggle="schedaAperta = ($event.target as HTMLDetailsElement).open"
            >
                <summary class="flex min-h-touch cursor-pointer items-center text-xs font-semibold text-[var(--talos-accent)]">{{ t('localModels.fullReadme') }}</summary>
                <TalosMobileMessageContent v-if="schedaAperta" class="text-xs" :content="schedaLeggibile" />
            </details>
        </section>

        <p v-if="repo?.sets.length" class="font-mono text-2xs uppercase tracking-wider text-[var(--talos-muted)]">
            {{ t('localModels.variants') }}<template v-if="freeMemory"> · {{ t('models.fitFree', { free: freeMemory }) }}</template>
        </p>

        <p v-if="!repo || repo.loading" class="py-[var(--talos-space-page)] text-center text-sm text-[var(--talos-muted)]">{{ t('localModels.loadingFiles') }}</p>
        <p v-else-if="repo.failure" role="alert" data-testid="talos-models-repo-failed" class="py-[var(--talos-space-page)] text-center text-sm text-[var(--talos-danger)]">{{ t('localModels.repoFailed') }} {{ explain(repo.failure) }}</p>
        <p v-else-if="!repo.sets.length" class="py-[var(--talos-space-page)] text-center text-sm text-[var(--talos-muted)]">{{ t('localModels.emptyRepo') }}</p>

        <ul
            v-else
            data-testid="talos-models-variant-list"
            class="min-w-0 overflow-hidden rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] divide-y divide-[var(--talos-border)]"
        >
            <li v-for="row in rows" :key="row.key" data-testid="talos-models-set" class="min-w-0 bg-[var(--talos-panel)] px-[var(--talos-space-control)] py-[var(--talos-space-inline)]">
                <div data-testid="talos-models-variant-primary" class="grid min-w-0 grid-cols-[minmax(0,1fr)_var(--talos-touch-target)] items-center gap-[var(--talos-space-inline)]">
                    <span data-testid="talos-models-variant-identity" class="flex min-w-0 flex-col justify-center">
                        <span class="flex min-w-0 items-center gap-[var(--talos-space-inline)]">
                            <span data-testid="talos-models-variant-label" class="truncate font-mono text-sm font-semibold text-[var(--talos-text)]">{{ row.set.label }}</span>
                            <AlertTriangle v-if="row.warnings.incomplete" class="size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-danger)]" aria-hidden="true" />
                            <ShieldAlert v-else-if="row.warnings.flagged" class="size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-danger)]" aria-hidden="true" />
                        </span>
                        <span data-testid="talos-models-variant-size" class="font-mono text-2xs tabular-nums text-[var(--talos-muted)]">{{ row.size }}</span>
                    </span>
                    <button
                        type="button"
                        data-testid="talos-models-download"
                        :aria-label="`${t('localModels.download')} ${row.set.label}`"
                        :disabled="row.set.incomplete"
                        class="talos-pressable inline-flex size-[var(--talos-touch-target)] items-center justify-center rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] text-[var(--talos-accent-text)] disabled:opacity-50"
                        @click="start(row.key, `${repoId.split('/').pop()} ${row.set.label}`)"
                    >
                        <Download class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                    </button>
                </div>

                <TalosModelFitBar class="mt-[var(--talos-space-inline)]" :tone="row.badge.tone" :ratio="row.badge.ratio" :label="t(row.badge.labelKey)" />

                <p v-if="row.verdict" data-testid="talos-models-verdict" class="mt-[calc(var(--talos-space-inline)/2)] text-xs font-semibold" :class="{ 'text-[var(--talos-success)]': row.verdict.tone === 'good', 'text-[var(--talos-warning)]': row.verdict.tone === 'warn', 'text-[var(--talos-danger)]': row.verdict.tone === 'bad' }">
                    {{ t(row.verdict.bandKey) }}
                    <span class="font-normal text-[var(--talos-muted)]"> · {{ row.verdict.tokensPerSecond === null ? t('localModels.speedUnknown') : t('localModels.speed', { rate: row.verdict.tokensPerSecond }) }}</span>
                </p>
                <p v-else-if="row.set.examination.state === 'reading'" class="mt-[calc(var(--talos-space-inline)/2)] text-2xs text-[var(--talos-muted)]">{{ t('localModels.examining') }}</p>

                <details data-testid="talos-models-variant-details" class="group mt-[calc(var(--talos-space-inline)/2)] border-t border-[var(--talos-border)]">
                    <summary class="flex min-h-touch cursor-pointer items-center justify-between gap-[var(--talos-space-inline)] text-2xs font-semibold text-[var(--talos-accent)]">
                        {{ t('localModels.variantDetails') }}
                        <ChevronDown class="size-[var(--talos-icon-size)] shrink-0 transition-transform duration-[var(--talos-motion-duration-disclosure)] group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                    </summary>
                    <div class="flex min-w-0 flex-col gap-[var(--talos-space-inline)] pb-[var(--talos-space-inline)]">
                        <p class="text-2xs leading-4 text-[var(--talos-muted)]">{{ t(row.badge.reasonKey, row.badge.delta === null ? {} : (row.badge.hasHeadroom ? { left: row.badge.delta } : { missing: row.badge.delta })) }}</p>
                        <p v-if="row.warnings.incomplete" data-testid="talos-models-incomplete" class="flex items-start gap-[var(--talos-space-inline)] text-2xs text-[var(--talos-danger)]">
                            <AlertTriangle class="size-[var(--talos-icon-size)] shrink-0" aria-hidden="true" />
                            {{ t('localModels.incompleteSet', { missing: row.warnings.incomplete.missing, total: row.warnings.incomplete.total }) }}
                        </p>
                        <p v-if="row.warnings.flagged" class="flex items-start gap-[var(--talos-space-inline)] text-2xs text-[var(--talos-danger)]">
                            <ShieldAlert class="size-[var(--talos-icon-size)] shrink-0" aria-hidden="true" /> {{ t('localModels.flagged') }} {{ row.warnings.flagged }}
                        </p>
                        <p v-if="row.warnings.unverifiable" data-testid="talos-models-unverifiable" class="text-2xs text-[var(--talos-muted)]">{{ t('localModels.unverifiable') }}</p>
                        <template v-if="row.verdict">
                            <p v-if="row.verdict.reasonKey" class="text-2xs text-[var(--talos-muted)]">{{ t(row.verdict.reasonKey) }}</p>
                            <p data-testid="talos-models-context" class="text-3xs text-[var(--talos-muted)]">{{ t('localModels.contextExplain', { context: store.context }) }}</p>
                            <button v-if="row.verdict.counterOfferContext" type="button" data-testid="talos-models-counteroffer" class="talos-pressable min-h-touch text-left text-2xs text-[var(--talos-accent)] underline" @click="acceptCounterOffer(row.key, row.verdict.counterOfferContext)">{{ t('localModels.counterOffer', { context: row.verdict.counterOfferContext }) }}</button>
                        </template>
                        <p v-else-if="row.set.examination.state === 'unreadable'" class="text-2xs text-[var(--talos-muted)]">{{ t('localModels.unreadable') }} {{ explain(row.set.examination.reason) }}</p>
                        <Button v-if="row.set.examination.state !== 'reading'" type="button" data-testid="talos-models-examine" class="talos-pressable min-h-touch self-start rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-control)] text-xs text-[var(--talos-text)]" @click="talosExamineSet(row.key)">{{ row.set.examination.state === 'unread' ? t('localModels.examine') : t('localModels.recheck') }}</Button>
                    </div>
                </details>
            </li>
        </ul>

        <div v-if="store.leftovers.totalBytes > 0" data-testid="talos-models-leftovers" class="flex flex-wrap items-center gap-[var(--talos-space-inline)] text-2xs text-[var(--talos-muted)]">
            <span>{{ t('localModels.leftovers', { size: talosFormatBytes(store.leftovers.totalBytes) }) }}</span>
            <button type="button" data-testid="talos-models-reclaim" class="talos-pressable min-h-touch rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-control)] text-[var(--talos-text)]" @click="reclaim">{{ t('localModels.reclaim') }}</button>
        </div>
        <p v-if="refused" role="alert" data-testid="talos-models-refused" class="text-xs text-[var(--talos-danger)]">{{ refused }}</p>
    </div>
</template>
