<script setup lang="ts">
/**
 * The download centre — the "On device" section of the Model Lab.
 *
 * A section rather than a station of its own: the Model Lab is already where
 * someone goes to decide which model answers them, and a separate destination
 * would split one question across two places. Owner 2026-07-31, on economising
 * the surfaces that already exist.
 *
 * Every other app in this category shows a list of file names and a size and
 * lets the reader guess. This one answers the question they are actually
 * asking: does it run on THIS phone, how fast, and what will it cost me.
 *
 * The refusals carry their reason and, where one exists, a counter-offer — a
 * rejection that ends the conversation is a worse product than one that moves
 * it. Nothing here is disabled without saying why.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Search, Download, Pause, AlertTriangle, ChevronLeft, ShieldAlert, Cpu } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
    talosLocalModels,
    talosSearchLocalModels,
    talosOpenModelRepo,
    talosCloseModelRepo,
    talosExamineSet,
    talosDownloadSet,
    talosStopLocalDownload,
    talosRefreshTransfer,
    talosRefreshDeviceCapacity,
    talosRefreshLeftovers,
} from '@/stores/localModels'
import { talosFitVerdict, talosFormatBytes, talosSetWarnings } from '@/lib/models/presentation'

const { t } = useTalosI18n()

const query = ref('')
const refused = ref<string | null>(null)
let poller: ReturnType<typeof setInterval> | null = null

const store = talosLocalModels

onMounted(async () => {
    // Measured on every visit, not once at start: free memory, free space and
    // heat all move, and a fit answer from an hour ago is about a different
    // phone.
    await Promise.all([
        talosRefreshDeviceCapacity(),
        talosRefreshTransfer(),
        talosRefreshLeftovers(),
    ])
    poller = setInterval(() => { void talosRefreshTransfer() }, 1000)
})

// The bar is driven by the native side, which keeps running when this screen
// does not. Polling only while it is on screen costs nothing and stops cleanly.
onUnmounted(() => {
    if (poller !== null) clearInterval(poller)
    poller = null
})

const deviceLine = computed(() => {
    const device = store.device
    if (!device) return null
    // Composed here rather than through t(): `escapeParameter` would turn a
    // device model containing an apostrophe into an entity.
    return [
        device.deviceModel,
        `${talosFormatBytes(device.availableRamBytes)} ${t('localModels.ramFree')}`,
        `${talosFormatBytes(device.freeStorageBytes)} ${t('localModels.storageFree')}`,
    ].join(' · ')
})

async function search(): Promise<void> {
    refused.value = null
    await talosSearchLocalModels(query.value)
}

async function open(id: string): Promise<void> {
    refused.value = null
    await talosOpenModelRepo(id)
}

async function start(key: string, label: string): Promise<void> {
    refused.value = null
    const result = await talosDownloadSet(key, label)
    if (!result.ok) {
        refused.value = result.reason === 'already-running'
            ? t('localModels.alreadyRunning')
            : `${t('localModels.refused')} ${result.reason}`
    }
}

const progressPercent = computed(() => {
    const { haveBytes, totalBytes } = store.transfer
    if (totalBytes <= 0) return 0
    return Math.min(100, Math.round((haveBytes / totalBytes) * 100))
})

/**
 * Everything the list needs, worked out once.
 *
 * Computed here rather than called from the template: the warnings and the
 * verdict are each read three or four times per row, and a template that
 * recomputes them on every render is a list that stutters on the phone this
 * feature exists for.
 */
const rows = computed(() => (store.repo?.sets ?? []).map((set) => ({
    set,
    key: set.paths[0]!,
    size: talosFormatBytes(set.totalBytes),
    warnings: talosSetWarnings(set),
    verdict: set.examination.state === 'read'
        ? talosFitVerdict(set.examination.fit, store.context)
        : null,
})))
</script>

<template>
    <div
        class="flex min-h-full flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
        data-testid="talos-models-section"
    >
        <p class="text-xs leading-5 text-[var(--talos-muted)]">{{ t('localModels.intro') }}</p>

        <!-- What this phone is, in its own words. The fit answers below are
             only as honest as this line. -->
        <p
            v-if="deviceLine"
            data-testid="talos-models-device"
            class="flex items-center gap-1.5 text-2xs text-[var(--talos-muted)]"
        >
            <Cpu class="size-3 shrink-0" aria-hidden="true" />
            {{ deviceLine }}
        </p>
        <p v-else class="text-xs text-[var(--talos-muted)]">{{ t('localModels.noDevice') }}</p>

        <!-- A download in flight, with the bar the native side is driving. -->
        <div
            v-if="store.transfer.active"
            data-testid="talos-models-transfer"
            class="flex flex-col gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
        >
            <div class="flex items-center justify-between gap-2">
                <span class="min-w-0 truncate text-sm text-[var(--talos-text)]">
                    {{ t('localModels.downloading') }} {{ store.transfer.modelName }}
                </span>
                <button
                    type="button"
                    data-testid="talos-models-stop"
                    :aria-label="t('localModels.stop')"
                    class="talos-pressable flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--talos-muted)]"
                    @click="talosStopLocalDownload()"
                >
                    <Pause class="size-4" aria-hidden="true" />
                </button>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-[var(--talos-active)]">
                <div
                    class="h-full rounded-full bg-[var(--talos-accent)] transition-[width] duration-300"
                    :style="{ width: `${progressPercent}%` }"
                />
            </div>
            <p class="text-2xs text-[var(--talos-muted)]">
                {{ t('localModels.progress', {
                    have: talosFormatBytes(store.transfer.haveBytes),
                    total: talosFormatBytes(store.transfer.totalBytes),
                }) }}
            </p>
            <!-- The caveat that costs money if it stays hidden. -->
            <p v-if="!store.transfer.networkBound" class="text-2xs text-[var(--talos-muted)]">
                {{ t('localModels.notNetworkBound') }}
            </p>
        </div>

        <!-- Space held by attempts nobody is watching. The reservation is taken
             up front, so an abandoned download still holds the whole file. -->
        <p
            v-if="store.leftovers.totalBytes > 0"
            data-testid="talos-models-leftovers"
            class="text-2xs text-[var(--talos-muted)]"
        >
            {{ t('localModels.leftovers', { size: talosFormatBytes(store.leftovers.totalBytes) }) }}
        </p>

        <p v-if="refused" role="alert" data-testid="talos-models-refused" class="text-xs text-[var(--talos-danger,#dc5b5b)]">
            {{ refused }}
        </p>

        <!-- Searching the Hub. -->
        <form v-if="!store.repo" class="flex gap-2" @submit.prevent="search">
            <input
                v-model="query"
                data-testid="talos-models-query"
                :aria-label="t('localModels.searchLabel')"
                :placeholder="t('localModels.searchPlaceholder')"
                class="min-h-11 flex-1 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            >
            <Button
                type="submit"
                data-testid="talos-models-search"
                :aria-label="t('localModels.searchLabel')"
                class="talos-pressable min-h-11 rounded-full bg-[var(--talos-accent,var(--primary))] px-4 text-[var(--talos-accent-contrast,var(--primary-foreground))]"
            >
                <Search class="size-4" aria-hidden="true" />
            </Button>
        </form>

        <p v-if="store.searching" class="py-6 text-center text-sm text-[var(--talos-muted)]">
            {{ t('localModels.searching') }}
        </p>

        <p v-else-if="store.searchFailure" role="alert" class="text-xs text-[var(--talos-danger,#dc5b5b)]">
            {{ store.searchFailure }}
        </p>

        <!-- Search results. -->
        <ul v-else-if="!store.repo && store.results.length" class="flex flex-col gap-2">
            <li v-for="model in store.results" :key="model.id">
                <button
                    type="button"
                    data-testid="talos-models-result"
                    :aria-label="`${t('localModels.open')} ${model.id}`"
                    class="talos-pressable w-full rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3 text-left"
                    @click="open(model.id)"
                >
                    <span class="block truncate text-sm font-semibold text-[var(--talos-text)]">{{ model.id }}</span>
                    <span class="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs text-[var(--talos-muted)]">
                        <span>{{ t('localModels.downloadsCount', { count: model.downloads }) }}</span>
                        <!-- Known from the search, so nobody picks a model,
                             reads a fit answer and then cannot have it. -->
                        <span
                            v-if="model.gated"
                            class="rounded-full bg-[var(--talos-active)] px-2 py-0.5 font-semibold uppercase tracking-wide"
                        >{{ t('localModels.gated') }}</span>
                    </span>
                </button>
            </li>
        </ul>

        <p
            v-else-if="!store.repo && store.query.trim() !== '' && !store.searching"
            class="py-6 text-center text-sm text-[var(--talos-muted)]"
        >
            {{ t('localModels.noResults') }}
        </p>

        <!-- One repository, as the models it actually holds. -->
        <template v-if="store.repo">
            <div class="flex items-center gap-2">
                <button
                    type="button"
                    data-testid="talos-models-back"
                    :aria-label="t('localModels.back')"
                    class="talos-pressable flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--talos-muted)]"
                    @click="talosCloseModelRepo()"
                >
                    <ChevronLeft class="size-4" aria-hidden="true" />
                </button>
                <span class="min-w-0 truncate text-sm font-semibold text-[var(--talos-text)]">{{ store.repo.id }}</span>
            </div>

            <p v-if="store.repo.loading" class="py-6 text-center text-sm text-[var(--talos-muted)]">
                {{ t('localModels.loadingFiles') }}
            </p>

            <p v-else-if="!store.repo.sets.length" class="py-6 text-center text-sm text-[var(--talos-muted)]">
                {{ t('localModels.emptyRepo') }}
            </p>

            <ul v-else class="flex flex-col gap-2">
                <li
                    v-for="row in rows"
                    :key="row.key"
                    data-testid="talos-models-set"
                    class="flex flex-col gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
                >
                    <div class="flex items-baseline justify-between gap-2">
                        <span class="text-sm font-semibold text-[var(--talos-text)]">{{ row.set.label }}</span>
                        <span class="text-2xs text-[var(--talos-muted)]">{{ row.size }}</span>
                    </div>

                    <!-- Cannot work at all: two of three shards is not a small
                         model, it is nothing. -->
                    <p
                        v-if="row.warnings.incomplete"
                        data-testid="talos-models-incomplete"
                        class="flex items-start gap-1.5 text-2xs text-[var(--talos-danger,#dc5b5b)]"
                    >
                        <AlertTriangle class="mt-px size-3 shrink-0" aria-hidden="true" />
                        {{ t('localModels.incompleteSet', {
                            missing: row.warnings.incomplete.missing,
                            total: row.warnings.incomplete.total,
                        }) }}
                    </p>

                    <p
                        v-if="row.warnings.flagged"
                        class="flex items-start gap-1.5 text-2xs text-[var(--talos-danger,#dc5b5b)]"
                    >
                        <ShieldAlert class="mt-px size-3 shrink-0" aria-hidden="true" />
                        {{ t('localModels.flagged') }} {{ row.warnings.flagged }}
                    </p>

                    <!-- The one download we cannot prove, said plainly rather
                         than left for the user to assume otherwise. -->
                    <p
                        v-if="row.warnings.unverifiable"
                        data-testid="talos-models-unverifiable"
                        class="text-2xs text-[var(--talos-muted)]"
                    >
                        {{ t('localModels.unverifiable') }}
                    </p>

                    <!-- The verdict: the answer no competitor gives. -->
                    <template v-if="row.verdict">
                        <p
                            data-testid="talos-models-verdict"
                            class="text-xs font-semibold"
                            :class="{
                                'text-[var(--talos-success,#4c9a6a)]': row.verdict.tone === 'good',
                                'text-[var(--talos-warning,#c08a3e)]': row.verdict.tone === 'warn',
                                'text-[var(--talos-danger,#dc5b5b)]': row.verdict.tone === 'bad',
                            }"
                        >
                            {{ t(row.verdict.bandKey) }}
                            <span class="font-normal text-[var(--talos-muted)]">
                                ·
                                {{ row.verdict.tokensPerSecond === null
                                    ? t('localModels.speedUnknown')
                                    : t('localModels.speed', { rate: row.verdict.tokensPerSecond }) }}
                            </span>
                        </p>
                        <p v-if="row.verdict.reasonKey" class="text-2xs text-[var(--talos-muted)]">
                            {{ t(row.verdict.reasonKey) }}
                        </p>
                        <!-- The counter-offer. A refusal that ends the
                             conversation is a worse product than one that
                             moves it. -->
                        <p
                            v-if="row.verdict.counterOfferContext"
                            data-testid="talos-models-counteroffer"
                            class="text-2xs text-[var(--talos-accent)]"
                        >
                            {{ t('localModels.counterOffer', { context: row.verdict.counterOfferContext }) }}
                        </p>
                    </template>

                    <p v-else-if="row.set.examination.state === 'reading'" class="text-2xs text-[var(--talos-muted)]">
                        {{ t('localModels.examining') }}
                    </p>

                    <p
                        v-else-if="row.set.examination.state === 'unreadable'"
                        class="text-2xs text-[var(--talos-muted)]"
                    >
                        {{ t('localModels.unreadable') }} {{ row.set.examination.reason }}
                    </p>

                    <div class="flex gap-2">
                        <Button
                            v-if="row.set.examination.state === 'unread'"
                            type="button"
                            data-testid="talos-models-examine"
                            class="talos-pressable min-h-11 flex-1 rounded-full border border-[var(--talos-border)] text-sm text-[var(--talos-text)]"
                            @click="talosExamineSet(row.key)"
                        >
                            {{ t('localModels.examine') }}
                        </Button>
                        <!-- Disabled ONLY for what cannot work. A model that
                             will not fit stays offered: the card has said so,
                             and it is the user's phone. -->
                        <Button
                            type="button"
                            data-testid="talos-models-download"
                            :disabled="row.set.incomplete"
                            class="talos-pressable min-h-11 flex-1 rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
                            @click="start(row.key, `${store.repo!.id.split('/').pop()} ${row.set.label}`)"
                        >
                            <Download class="size-4" aria-hidden="true" />
                            {{ t('localModels.download') }}
                        </Button>
                    </div>
                </li>
            </ul>
        </template>
    </div>
</template>
