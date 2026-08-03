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
import { Search, Download, Pause, AlertTriangle, ChevronLeft, ShieldAlert, Cpu, LayoutGrid, List, FolderOpen } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
    talosLocalModels,
    talosSearchLocalModels,
    talosOpenModelRepo,
    talosCloseModelRepo,
    talosExamineSet,
    talosSetLocalContext,
    talosDownloadSet,
    talosStopLocalDownload,
    talosRefreshTransfer,
    talosRefreshLeftovers,
    talosRefreshHuggingFaceToken,
    talosLoadLocalCatalogue,
    talosSetHuggingFaceToken,
    talosForgetHuggingFaceToken,
} from '@/stores/localModels'
import { talosDiscardModelTransfer } from '@/services/modelTransfer'
import {
    talosLocalEngineStatus,
    talosLocalInstalledModels,
    type TalosLocalEngineStatus,
    type TalosLocalModelFile,
} from '@/services/localEngine'
import {
    talosInstalledModelsView,
    talosModelSize,
    TALOS_INSTALLED_MODEL_SORTS,
    TALOS_INSTALLED_MODEL_SORT_DEFAULT,
    type TalosInstalledModelSort,
} from '@/lib/models/installedModels'
import TalosThemedFilter from '@/components/talos/ui/TalosThemedFilter.vue'
import TalosRowActions from '@/components/talos/ui/TalosRowActions.vue'
import { useSettingsStore } from '@/stores/settings'
import {
    talosModelImportFailure,
    talosOnModelImportProgress,
    talosPickModelFromDevice,
} from '@/services/modelImport'
import type { TalosCatalogueRecommendation } from '@/lib/models/catalogue'
import { talosGroupModelsByProvider, talosProviderOptions } from '@/lib/models/providerGrouping'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import {
    talosFailureKey,
    talosFitVerdict,
    talosFormatBytes,
    talosModelInitials,
    talosRetryAfterSeconds,
    talosSetWarnings,
} from '@/lib/models/presentation'

const { t, locale } = useTalosI18n()
const settings = useSettingsStore()

/**
 * The SAME choice the Library and the research station store.
 *
 * Owner 2026-08-03 on this list: «lo stile deve essere quello della libreria
 * della ricerca etc, rendilo coerente al massimo, chip filtri etc, mi
 * raccomando e critico». Coherence is not only how a thing is drawn: somebody
 * who chose the list layout once should not choose it again in every room, so
 * this reads and writes `shell.library_view` instead of owning a third
 * preference nobody asked for.
 */
const layout = computed(() => settings.state.shell.library_view)
function chooseLayout(next: 'grid' | 'list'): void {
    void settings.setShell({ library_view: next })
}

async function copyPath(path: string): Promise<void> {
    // «Dove sta» was half the owner's question. The path is on the row, but a
    // forty-character address nobody can select is an address nobody can use.
    try {
        await navigator.clipboard.writeText(path)
    } catch {
        // No clipboard permission: the path stays readable where it is.
    }
}

const query = ref('')
const refused = ref<string | null>(null)

/**
 * The models already on this phone.
 *
 * Owner 2026-08-03, minutes after a download finished: «ho appena scaricato un
 * modello ma non ho idea di dove sia … NON VA BENE». The app knew — the same
 * listing already ranks judges for a research — and showed nobody. The panel
 * was entirely about ACQUIRING models and had nothing about HAVING them.
 */
const installed = ref<readonly TalosLocalModelFile[]>([])
const unreadable = ref<readonly { path: string, reason: string }[]>([])
const installedQuery = ref('')
const installedSort = ref<TalosInstalledModelSort>(TALOS_INSTALLED_MODEL_SORT_DEFAULT)
const installedLoading = ref(true)

const installedView = computed(() => talosInstalledModelsView(installed.value, {
    query: installedQuery.value,
    sort: installedSort.value,
}))

const sortItems = computed(() => TALOS_INSTALLED_MODEL_SORTS.map((value) => ({
    value,
    label: t(`localModels.sort.${value}`),
    testId: `talos-models-installed-sort-${value}`,
})))

/**
 * The pill, drawn the way the research station draws it.
 *
 * A radiogroup whose selected option looks like the others is a control that
 * refuses to say what it is doing — and the first render of this section was
 * exactly that: three words in a row, no fill, no state.
 */
function sortOptionClass(selected: boolean): string {
    const base = 'talos-pressable min-h-11 shrink-0 rounded-full px-3 text-sm transition-colors'
    return selected
        ? `${base} bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,var(--primary-foreground))]`
        : `${base} border border-[var(--talos-border)] text-[var(--talos-muted)]`
}

function installedDate(at: number): string {
    // Zero means the filesystem refused to say. Printing 1 January 1970 would
    // be the list lying confidently rather than admitting a gap.
    if (!at) return t('localModels.dateUnknown')
    return new Intl.DateTimeFormat(locale.value === 'it' ? 'it-IT' : 'en-US', { dateStyle: 'medium' })
        .format(new Date(at))
}

/**
 * A model already on the phone, handed over.
 *
 * Owner 2026-08-03: «nessuna possibilità di usare modelli caricati direttamente
 * dalla memoria, NON VA BENE». The file is copied into the same root the
 * downloader uses, so an imported model is not a second class of model — it
 * shows up in the list above, in the fit maths and in the chat picker without
 * one more line of plumbing.
 */
const importing = ref(false)
const importCopied = ref(0)
const importTotal = ref(0)
const importError = ref<string | null>(null)
let stopImportProgress: (() => void) | null = null

const importPercent = computed(() => (importTotal.value > 0
    ? Math.min(100, Math.round((importCopied.value / importTotal.value) * 100))
    : 0))

async function importFromDevice(): Promise<void> {
    if (importing.value) return
    importing.value = true
    importError.value = null
    importCopied.value = 0
    importTotal.value = 0
    stopImportProgress = talosOnModelImportProgress((copied, total) => {
        importCopied.value = copied
        importTotal.value = total
    })
    try {
        const picked = await talosPickModelFromDevice()
        // Cancelling the picker is not a failure and must not leave a red line
        // behind: the person changed their mind, which is allowed.
        if (picked.imported) await loadInstalled()
    } catch (failure) {
        const code = failure instanceof Error ? failure.message : String(failure)
        importError.value = t(talosModelImportFailure(code))
    } finally {
        stopImportProgress?.()
        stopImportProgress = null
        importing.value = false
    }
}

onUnmounted(() => { stopImportProgress?.() })

async function loadInstalled(): Promise<void> {
    installedLoading.value = true
    try {
        const listing = await talosLocalInstalledModels()
        installed.value = listing.models
        unreadable.value = listing.unreadable
    } catch {
        // A refusal here is not the same as "no models": the list stays as it
        // was and the empty state below never claims the phone is bare.
        installed.value = []
    } finally {
        installedLoading.value = false
    }
}
let poller: ReturnType<typeof setInterval> | null = null

const store = talosLocalModels

// The bar is driven by the native side, which keeps running when this screen
// does not. Polling only while it is on screen costs nothing and stops cleanly.
let mounted = true

onMounted(async () => {
    // Started BEFORE the probes, not after them.
    //
    // It was created after four awaits, so a section unmounted while they were
    // still resolving ran its cleanup against a null timer — and then the
    // interval was created anyway, with nothing left to clear it: a 1 Hz call
    // into the native layer for the rest of the process's life, once per visit.
    // Found by an adversarial review, 2026-08-01.
    poller = setInterval(() => { void talosRefreshTransfer() }, 1000)

    // Measured on every visit, not once at start: free memory, free space and
    // heat all move, and a fit answer from an hour ago is about a different
    // phone.
    await Promise.all([
        // The opening move: measure, then show the list. Everything else on
        // this screen is about a device, so nothing is worth showing until the
        // device has been looked at.
        talosLoadLocalCatalogue(),
        talosRefreshTransfer(),
        talosRefreshLeftovers(),
        talosRefreshHuggingFaceToken(),
    ])
    if (!mounted) stopPolling()
})

/** The device strip: what every verdict below is an answer about. */
const device = computed(() => {
    const measured = store.device
    if (!measured) return null
    return {
        name: measured.deviceModel,
        ram: talosFormatBytes(measured.availableRamBytes),
        storage: talosFormatBytes(measured.freeStorageBytes),
        bandwidth: measured.memoryBandwidthBytesPerSecond === null
            ? null
            : `${Math.round(measured.memoryBandwidthBytesPerSecond / 1024 ** 3)} GB/s`,
        thermal: measured.thermal,
        // How much of the phone's memory is free, for the strip's own bar.
        share: Math.max(0, Math.min(100, Math.round(
            (measured.availableRamBytes / Math.max(1, measured.totalRamBytes)) * 100))),
    }
})

/**
 * Whether the engine that would RUN these models is actually on board.
 *
 * The strip above measures the phone; this measures the app. They are different
 * questions and the screen was only asking one of them — it could say a model
 * fits and run comfortably at eleven tokens a second while carrying no engine
 * able to run anything, which is a promise made by arithmetic alone.
 *
 * Asked once on mount. It cannot change while the screen is open: the native
 * library is either in the APK or it is not.
 */
const engine = ref<TalosLocalEngineStatus | null>(null)
onMounted(async () => { engine.value = await talosLocalEngineStatus() })
onMounted(() => { void loadInstalled() })

/** One catalogue row, worked out once rather than four times per render. */
function rowOf(item: Readonly<TalosCatalogueRecommendation>) {
    return {
        key: item.entry.id,
        initials: talosModelInitials(item.entry.family),
        entry: item.entry,
        size: talosFormatBytes(item.entry.fileBytes),
        working: talosFormatBytes(item.entry.ramWorkingBytes),
        missing: talosFormatBytes(Math.abs(item.headroomBytes)),
        fits: item.fits,
        speed: item.entry.referenceSpeed[0]?.tokensPerSecond ?? null,
    }
}

const recommended = computed(() => store.catalogue.recommended.map(rowOf))
const rejected = computed(() => store.catalogue.rejected.map(rowOf))
/** The search door opens only when asked for: the list is the screen. */
const searching = ref(false)

function stopPolling(): void {
    if (poller !== null) clearInterval(poller)
    poller = null
}

onUnmounted(() => {
    mounted = false
    stopPolling()
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
    if (result.ok) {
        started.value = { key, label }
        paused.value = null
        return
    }
    refused.value = result.reason === 'already-running'
        ? t('localModels.alreadyRunning')
        : `${t('localModels.refused')} ${explain(result.reason)}`
}

/**
 * Take the counter-offer.
 *
 * "At 8192 tokens of context it fits" was a sentence with nothing behind it:
 * the context was hard-coded and no control could change it, so the app made an
 * offer the user had no way to accept. Now it does — and the model is re-checked
 * at that context, because the verdict is only true of the number it was
 * computed at.
 */
async function acceptCounterOffer(key: string, context: number): Promise<void> {
    talosSetLocalContext(context)
    await talosExamineSet(key)
}

/**
 * Give the space back.
 *
 * Nothing is dropped without the native side agreeing it is ours: the plugin
 * accepts only paths under its own root that end in the partial suffix.
 */
async function reclaim(): Promise<void> {
    for (const leftover of store.leftovers.items) {
        await talosDiscardModelTransfer(leftover.path)
    }
    await talosRefreshLeftovers()
}

/** A slug turned into a sentence, or left as itself when we have no words. */
function explain(reason: string): string {
    const key = talosFailureKey(reason)
    const seconds = talosRetryAfterSeconds(reason)
    if (key === null) return reason
    return seconds === null ? t(key) : `${t(key)} (${seconds}s)`
}

const tokenDraft = ref('')

/**
 * Grouped by whoever published the GGUF.
 *
 * On this screen every row is a stranger's upload, and the people who quantise
 * models are a small recognisable set — `unsloth`, `bartowski` and the rest —
 * so "who made this one" is most of what a reader uses to judge it. The same
 * shape the Catalog tab already uses for remote providers, so the two halves of
 * the Model Lab read alike.
 *
 * The publishers are DERIVED from the results, never a list in the app: who
 * publishes GGUF changes every few months, and a list compiled into an APK is
 * wrong by the time somebody installs it.
 */
const providerFilter = ref('')

const providerGroups = computed(() => talosGroupModelsByProvider(store.results))
const providerItems = computed(() => talosProviderOptions(providerGroups.value))
const visibleGroups = computed(() => providerFilter.value === ''
    ? providerGroups.value
    : providerGroups.value.filter((group) => group.provider === providerFilter.value))

/**
 * What was paused, so it can be started again.
 *
 * Pause used to be a one-way door: the block is the transfer's only control and
 * it hid on `active`, so pausing erased the download from the screen entirely
 * while the copy promised it would carry on. Remembering the set is what makes
 * the promise true — resuming costs one request, because every byte and its
 * hash are already on disk.
 */
const paused = ref<{ key: string; label: string } | null>(null)
/** Recorded when the download STARTS — never guessed from the list afterwards. */
const started = ref<{ key: string; label: string } | null>(null)

async function pause(): Promise<void> {
    paused.value = started.value
    await talosStopLocalDownload()
}

async function resume(): Promise<void> {
    const target = paused.value
    paused.value = null
    if (target) await start(target.key, target.label)
}

async function saveToken(): Promise<void> {
    const value = tokenDraft.value.trim()
    if (value === '') return
    await talosSetHuggingFaceToken(value)
    // Out of the field the moment it is in the Keystore: a token left in a
    // bound input is a token in a component's state and in any snapshot of it.
    tokenDraft.value = ''
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

        <!--
            What is ALREADY here, before anything about getting more.

            Owner 2026-08-03: «ho appena scaricato un modello ma non ho idea di
            dove sia». This panel was entirely about acquiring models and had
            nothing whatsoever about having them — the download finished, and
            the only trace was a file nobody could reach.

            The shape is the Library's, and the research station rebuilt on the
            same day is the thing being copied rather than a new design: search,
            one ordering picked from a radiogroup, a row per file with its size
            and when it arrived.
        -->
        <section data-testid="talos-models-installed" class="flex flex-col gap-3">
            <div class="flex items-baseline justify-between gap-2">
                <h3 class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                    {{ t('localModels.installedTitle') }}
                </h3>
                <span v-if="installedView.total" class="text-2xs tabular-nums text-[var(--talos-muted)]">
                    {{ t('localModels.installedCount', { count: installedView.total }) }}
                </span>
            </div>

            <template v-if="installedView.total > 0">
                <!-- The Library's search field to the pixel: same rounding, same
                     inset icon, same height. A third shape for the same job is a
                     third thing to learn. -->
                <label class="relative block">
                    <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--talos-muted)]" aria-hidden="true" />
                    <input
                        v-model="installedQuery"
                        type="search"
                        inputmode="search"
                        data-testid="talos-models-installed-search"
                        :placeholder="t('localModels.installedSearch')"
                        :aria-label="t('localModels.installedSearch')"
                        class="min-h-12 w-full rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                    >
                </label>

                <div class="flex items-center gap-2">
                    <TalosThemedFilter
                        class="min-w-0 flex-1"
                        group-class="flex gap-1 overflow-x-auto"
                        :model-value="installedSort"
                        :options="sortItems"
                        :group-label="t('localModels.sortLabel')"
                        :option-class="sortOptionClass"
                        @update:model-value="installedSort = $event as TalosInstalledModelSort"
                    />
                    <button
                        type="button"
                        data-testid="talos-models-installed-layout"
                        :aria-label="t(layout === 'grid' ? 'research.showAsList' : 'research.showAsGrid')"
                        class="talos-pressable inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--talos-border)] text-[var(--talos-muted)]"
                        @click="chooseLayout(layout === 'grid' ? 'list' : 'grid')"
                    >
                        <List v-if="layout === 'grid'" class="size-4" aria-hidden="true" />
                        <LayoutGrid v-else class="size-4" aria-hidden="true" />
                    </button>
                </div>
            </template>

            <p v-if="installedLoading" class="text-xs text-[var(--talos-muted)]">{{ t('localModels.installedLoading') }}</p>

            <!-- «Nessuno» and «nessuno che corrisponde» are different sentences,
                 and saying the first when the second is true sends somebody to
                 download a model they already have. -->
            <p
                v-else-if="installedView.total === 0"
                data-testid="talos-models-installed-empty"
                class="rounded-xl border border-[var(--talos-border)] p-3 text-xs leading-5 text-[var(--talos-muted)]"
            >{{ t('localModels.installedEmpty') }}</p>
            <p
                v-else-if="installedView.models.length === 0"
                class="text-xs text-[var(--talos-muted)]"
            >{{ t('localModels.installedNoMatch') }}</p>

            <ul
                v-else
                data-testid="talos-models-installed-list"
                :data-layout="layout"
                class="min-w-0"
                :class="layout === 'grid' ? 'grid grid-cols-2 gap-2 sm:grid-cols-3' : 'flex flex-col gap-2'"
            >
                <li
                    v-for="file in installedView.models"
                    :key="file.path"
                    data-testid="talos-models-installed-row"
                    class="relative min-w-0 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 pr-12"
                >
                    <!-- Outside the row body and never nested in a button: two
                         hit areas that overlap mean one swallows the other. -->
                    <div class="absolute right-1 top-1 z-10">
                        <TalosRowActions
                            :test-id="`talos-models-installed-menu-${file.name}`"
                            :label="t('localModels.actionsFor', { name: file.name })"
                            :items="[{ id: 'copy', label: t('localModels.copyPath') }]"
                            @select="() => copyPath(file.path)"
                        />
                    </div>
                    <p class="truncate text-sm text-[var(--talos-text)]">{{ file.name }}</p>
                    <p class="mt-1 flex flex-wrap gap-x-2 text-2xs tabular-nums text-[var(--talos-muted)]">
                        <span>{{ talosModelSize(file.bytes, locale) }}</span>
                        <span aria-hidden="true">·</span>
                        <span>{{ installedDate(file.modifiedAt) }}</span>
                    </p>
                    <p class="mt-1 break-all font-mono text-3xs leading-4 text-[var(--talos-muted)]">{{ file.path }}</p>
                </li>
            </ul>

            <!--
                The door that opens inward.

                A phone can already hold a `.gguf` — put there over USB, or
                downloaded outside TALOS — and until today the app had no way to
                be given it. For something local-first, that is «open a file»
                missing.
            -->
            <div class="flex flex-col gap-1">
                <Button
                    data-testid="talos-models-import"
                    variant="outline"
                    class="w-full"
                    :disabled="importing"
                    @click="importFromDevice()"
                >
                    <FolderOpen class="size-4" aria-hidden="true" />
                    {{ importing ? t('localModels.importing') : t('localModels.importFromDevice') }}
                </Button>
                <!-- A determinate bar because the denominator is a real file
                     size, not a guess — and a 3 GB copy without one looks hung. -->
                <div
                    v-if="importing && importTotal > 0"
                    class="h-1 overflow-hidden rounded-full bg-[var(--talos-border)]"
                    role="progressbar"
                    :aria-valuemin="0"
                    :aria-valuemax="100"
                    :aria-valuenow="importPercent"
                >
                    <div class="h-full rounded-full bg-[var(--talos-accent)] transition-[width] duration-300" :style="{ width: `${importPercent}%` }" />
                </div>
                <p class="text-2xs leading-4 text-[var(--talos-muted)]">{{ t('localModels.importNote') }}</p>
                <p v-if="importError" role="alert" data-testid="talos-models-import-error" class="text-2xs leading-5 text-[var(--talos-danger,#dc5b5b)]">
                    {{ importError }}
                </p>
            </div>

            <!-- A folder that refused to open makes the list above PARTIAL, and
                 silence there reads as "you have no models". -->
            <p
                v-if="unreadable.length"
                data-testid="talos-models-installed-unreadable"
                class="text-2xs leading-5 text-[var(--talos-danger,#dc5b5b)]"
            >{{ t('localModels.installedUnreadable', { count: unreadable.length }) }}</p>
        </section>

        <!-- The device strip. Every verdict below is an answer ABOUT this, so
             it stays at the top rather than hiding in a settings panel: the
             reader can see what the answers were computed from. -->
        <div
            v-if="device"
            data-testid="talos-models-device"
            class="flex flex-col gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
        >
            <div class="flex items-center justify-between gap-2">
                <span class="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-[var(--talos-text)]">
                    <Cpu class="size-3.5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    {{ device.name }}
                </span>
                <span
                    v-if="device.thermal"
                    class="shrink-0 font-mono text-3xs uppercase tracking-wider"
                    :class="device.thermal === 'none' || device.thermal === 'light'
                        ? 'text-[var(--talos-accent)]'
                        : 'text-[var(--talos-warning,#c08a3e)]'"
                >{{ t(`localModels.thermal_${device.thermal}`) }}</span>
            </div>

            <div class="grid grid-cols-3 gap-2">
                <div class="flex flex-col">
                    <b class="font-mono text-sm font-semibold tabular-nums text-[var(--talos-text)]">{{ device.ram }}</b>
                    <span class="text-3xs text-[var(--talos-muted)]">{{ t('localModels.ramFree') }}</span>
                </div>
                <div class="flex flex-col">
                    <b class="font-mono text-sm font-semibold tabular-nums text-[var(--talos-text)]">{{ device.storage }}</b>
                    <span class="text-3xs text-[var(--talos-muted)]">{{ t('localModels.storageFree') }}</span>
                </div>
                <div class="flex flex-col">
                    <b class="font-mono text-sm font-semibold tabular-nums text-[var(--talos-text)]">
                        {{ device.bandwidth ?? '—' }}
                    </b>
                    <span class="text-3xs text-[var(--talos-muted)]">{{ t('localModels.bandwidthMeasured') }}</span>
                </div>
            </div>

            <div class="h-1 overflow-hidden rounded-full bg-[var(--talos-active)]">
                <div class="h-full rounded-full bg-[var(--talos-accent)]" :style="{ width: `${device.share}%` }" />
            </div>

            <!-- The engine, beside the phone it would run on. Until now this
                 strip answered "does it fit" and left "can we run it at all"
                 unasked, which is how a screen ends up promising eleven tokens a
                 second while carrying nothing able to produce one. -->
            <p
                v-if="engine"
                data-testid="talos-local-engine-status"
                class="mt-2 font-mono text-3xs text-[var(--talos-muted)]"
            >
                {{ engine.available
                    ? t('localModels.engineReady', { backends: engine.backends || '—' })
                    : t('localModels.engineMissing') }}
            </p>
        </div>

        <!-- Measuring. A skeleton rather than an empty screen: the list is
             coming, and saying so is different from showing nothing. -->
        <div
            v-else-if="store.catalogue.state === 'measuring'"
            data-testid="talos-models-measuring"
            class="flex flex-col items-center gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-6 text-center"
        >
            <span class="size-8 animate-spin rounded-full border-2 border-[var(--talos-active)] border-t-[var(--talos-accent)]" aria-hidden="true" />
            <b class="text-sm font-semibold text-[var(--talos-text)]">{{ t('localModels.measuring') }}</b>
            <span class="text-2xs text-[var(--talos-muted)]">{{ t('localModels.measuringWhat') }}</span>
        </div>

        <p v-else class="text-xs text-[var(--talos-muted)]">{{ t('localModels.noDevice') }}</p>

        <!-- THE LIST. The screen is this, not a search box: the reader arrives
             and the models are already there, ranked for the phone above. -->
        <template v-if="store.catalogue.state === 'ready' && !store.repo">
            <div v-if="recommended.length" class="flex items-baseline justify-between gap-2 px-1">
                <h5 class="text-xs font-bold uppercase tracking-wider text-[var(--talos-text)]">
                    {{ t('localModels.recommendedHere') }}
                </h5>
                <span class="font-mono text-2xs tabular-nums text-[var(--talos-muted)]">{{ recommended.length }}</span>
            </div>

            <article
                v-for="(row, index) in recommended"
                :key="row.key"
                data-testid="talos-models-catalogue-row"
                class="grid grid-cols-[2.375rem_1fr] gap-3 rounded-2xl border bg-[var(--talos-panel)]/70 p-3"
                :class="index === 0 ? 'border-[var(--talos-accent)]/45' : 'border-[var(--talos-border)]'"
            >
                <span class="grid size-9.5 place-items-center rounded-xl border border-[var(--talos-accent)]/25 bg-[var(--talos-accent)]/10 font-mono text-xs font-bold text-[var(--talos-accent)]">
                    {{ row.initials }}
                </span>
                <div class="flex min-w-0 flex-col gap-1.5">
                    <div class="flex flex-wrap items-center gap-2">
                        <b class="text-sm font-semibold text-[var(--talos-text)]">{{ row.entry.displayName }}</b>
                        <span
                            v-if="index === 0"
                            data-testid="talos-models-recommended-badge"
                            class="rounded-full bg-[var(--talos-accent)] px-2 py-0.5 font-mono text-3xs font-bold uppercase tracking-wider text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                        >{{ t('localModels.recommended') }}</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5 font-mono text-2xs tabular-nums text-[var(--talos-muted)]">
                        <span>{{ row.entry.publisher }}</span><span class="opacity-40">·</span>
                        <span>{{ row.entry.quantisation }}</span><span class="opacity-40">·</span>
                        <span>{{ row.size }}</span><span class="opacity-40">·</span>
                        <span>{{ row.entry.contextTokens }}</span>
                    </div>
                    <p class="text-2xs leading-snug text-[var(--talos-muted)]">{{ row.entry.family }}</p>
                    <p class="flex items-center gap-1.5 text-2xs font-semibold text-[var(--talos-success,#4c9a6a)]">
                        <span class="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
                        {{ t('localModels.bandComfortable') }}
                        <span class="font-mono text-3xs font-medium tabular-nums text-[var(--talos-muted)]">
                            <template v-if="row.speed">~{{ row.speed }} t/s · </template>{{ row.working }}
                        </span>
                    </p>
                </div>
            </article>

            <!-- What does not fit STAYS, with its numbers. A model that
                 vanishes teaches nobody anything about their phone. -->
            <div v-if="rejected.length" class="flex items-baseline justify-between gap-2 px-1 pt-1">
                <h5 class="text-xs font-bold uppercase tracking-wider text-[var(--talos-text)]">
                    {{ t('localModels.notHere') }}
                </h5>
                <span class="font-mono text-2xs tabular-nums text-[var(--talos-muted)]">{{ rejected.length }}</span>
            </div>

            <article
                v-for="row in rejected"
                :key="row.key"
                data-testid="talos-models-catalogue-rejected"
                class="grid grid-cols-[2.375rem_1fr] gap-3 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
            >
                <span class="grid size-9.5 place-items-center rounded-xl border border-[var(--talos-muted)]/20 bg-[var(--talos-muted)]/10 font-mono text-xs font-bold text-[var(--talos-muted)]">
                    {{ row.initials }}
                </span>
                <div class="flex min-w-0 flex-col gap-1.5">
                    <b class="text-sm font-semibold text-[var(--talos-text)]">{{ row.entry.displayName }}</b>
                    <div class="flex flex-wrap items-center gap-1.5 font-mono text-2xs tabular-nums text-[var(--talos-muted)]">
                        <span>{{ row.entry.publisher }}</span><span class="opacity-40">·</span>
                        <span>{{ row.entry.quantisation }}</span><span class="opacity-40">·</span>
                        <span>{{ row.size }}</span>
                    </div>
                    <p class="flex items-center gap-1.5 text-2xs font-semibold text-[var(--talos-danger,#dc5b5b)]">
                        <span class="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
                        {{ t('localModels.bandWontRun') }}
                        <span class="font-mono text-3xs font-medium tabular-nums text-[var(--talos-muted)]">
                            {{ t('localModels.shortBy', { size: row.missing }) }}
                        </span>
                    </p>
                </div>
            </article>
        </template>

        <!-- The secondary door. Free search on the Hub is for somebody who
             already knows what they want; it does not open the screen. -->
        <button
            v-if="!store.repo && !searching"
            type="button"
            data-testid="talos-models-open-search"
            class="talos-pressable flex items-center gap-2.5 rounded-2xl border border-dashed border-[var(--talos-border)] p-3 text-left"
            @click="searching = true"
        >
            <Search class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
            <span class="flex flex-col">
                <b class="text-xs font-semibold text-[var(--talos-text)]">{{ t('localModels.searchLabel') }}</b>
                <span class="text-2xs text-[var(--talos-muted)]">{{ t('localModels.searchWhy') }}</span>
            </span>
        </button>

        <!-- A download in flight, with the bar the native side is driving.
             Shown while it is active OR paused: hiding it on pause erased every
             trace of the transfer and left no way to resume, while the copy
             promised it would carry on where it left off. -->
        <div
            v-if="store.transfer.active || paused"
            data-testid="talos-models-transfer"
            class="flex flex-col gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
        >
            <div class="flex items-center justify-between gap-2">
                <span class="min-w-0 truncate text-sm text-[var(--talos-text)]">
                    {{ t('localModels.downloading') }} {{ store.transfer.modelName }}
                </span>
                <button
                    v-if="store.transfer.active"
                    type="button"
                    data-testid="talos-models-stop"
                    :aria-label="t('localModels.stop')"
                    class="talos-pressable flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--talos-muted)]"
                    @click="pause()"
                >
                    <Pause class="size-4" aria-hidden="true" />
                </button>
                <!-- The other half of the promise. Resuming costs a request,
                     not a download: every byte and its hash are on disk. -->
                <Button
                    v-else
                    type="button"
                    data-testid="talos-models-resume"
                    class="talos-pressable min-h-11 rounded-full border border-[var(--talos-border)] px-3 text-sm text-[var(--talos-text)]"
                    @click="resume()"
                >
                    {{ t('localModels.resume') }}
                </Button>
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
        <div
            v-if="store.leftovers.totalBytes > 0"
            data-testid="talos-models-leftovers"
            class="flex flex-wrap items-center gap-2 text-2xs text-[var(--talos-muted)]"
        >
            <span>{{ t('localModels.leftovers', { size: talosFormatBytes(store.leftovers.totalBytes) }) }}</span>
            <!-- The button that was missing. The string and the service call
                 both existed and neither was wired to anything, so the line was
                 a statement of loss with no way to act on it. -->
            <button
                type="button"
                data-testid="talos-models-reclaim"
                class="talos-pressable min-h-10 rounded-full border border-[var(--talos-border)] px-3 text-[var(--talos-text)]"
                @click="reclaim()"
            >
                {{ t('localModels.reclaim') }}
            </button>
        </div>

        <p v-if="refused" role="alert" data-testid="talos-models-refused" class="text-xs text-[var(--talos-danger,#dc5b5b)]">
            {{ refused }}
        </p>

        <!-- The token. Optional, and worth having even for open models: the
             anonymous limit is per IP, and a carrier puts thousands of people
             behind one address. -->
        <details v-if="!store.repo && searching" data-testid="talos-models-token" class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3">
            <summary class="flex min-h-10 cursor-pointer items-center justify-between gap-2 text-sm font-semibold text-[var(--talos-text)]">
                {{ t('localModels.tokenTitle') }}
                <!-- A word, not a sentence: this is a badge pill at 10px with
                     wide tracking, and the full explanation used to be crammed
                     into it, wrapping over several lines and breaking the row. -->
                <span v-if="store.hasToken" class="shrink-0 rounded-full bg-[var(--talos-active)] px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                    {{ t('localModels.tokenPresent') }}
                </span>
            </summary>
            <p class="mt-2 text-2xs leading-4 text-[var(--talos-muted)]">{{ t('localModels.tokenWhy') }}</p>
            <p v-if="store.hasToken" class="mt-1 text-2xs leading-4 text-[var(--talos-muted)]">
                {{ t('localModels.tokenSaved') }}
            </p>
            <div class="mt-2 flex gap-2">
                <input
                    v-model="tokenDraft"
                    type="password"
                    autocomplete="off"
                    data-testid="talos-models-token-input"
                    :aria-label="t('localModels.tokenTitle')"
                    :placeholder="t('localModels.tokenPlaceholder')"
                    class="min-h-11 flex-1 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                >
                <Button
                    type="button"
                    data-testid="talos-models-token-save"
                    :disabled="tokenDraft.trim() === ''"
                    class="talos-pressable min-h-11 rounded-full border border-[var(--talos-border)] px-3 text-sm text-[var(--talos-text)] disabled:opacity-50"
                    @click="saveToken()"
                >
                    {{ t('localModels.tokenSave') }}
                </Button>
            </div>
            <button
                v-if="store.hasToken"
                type="button"
                data-testid="talos-models-token-forget"
                class="talos-pressable mt-2 min-h-10 text-2xs text-[var(--talos-muted)] underline"
                @click="talosForgetHuggingFaceToken()"
            >
                {{ t('localModels.tokenForget') }}
            </button>
        </details>

        <!-- Searching the Hub. -->
        <form v-if="!store.repo && searching" class="flex gap-2" @submit.prevent="search">
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

        <!-- Search results, under the organisation that published them. -->
        <template v-else-if="!store.repo && store.results.length">
            <!-- The same control the Catalog tab uses for remote providers, so
                 the two halves of the Model Lab read alike. Its options are
                 derived from the results — there is no list of publishers in
                 this app, because that list would age. -->
            <TalosThemedSelect
                v-model="providerFilter"
                data-testid="talos-models-provider-filter"
                :items="providerItems"
                :aria-label="t('localModels.filterProvider')"
                :none-label="t('localModels.allProviders')"
            />

            <section
                v-for="group in visibleGroups"
                :key="group.provider"
                data-testid="talos-models-provider-group"
                class="flex flex-col gap-2"
            >
                <h5 class="flex items-baseline justify-between gap-2 px-1">
                    <span class="truncate text-xs font-semibold text-[var(--talos-text)]">{{ group.provider }}</span>
                    <span class="shrink-0 text-3xs text-[var(--talos-muted)]">
                        {{ t('localModels.providerCount', { count: group.models.length }) }}
                    </span>
                </h5>

                <button
                    v-for="model in group.models"
                    :key="model.id"
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
            </section>
        </template>

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

            <!-- A failure is said as a failure. It used to fall through to
                 "this repository has no GGUF files a phone can open", which is
                 a false statement about what was actually a rate limit. -->
            <p
                v-else-if="store.repo.failure"
                role="alert"
                data-testid="talos-models-repo-failed"
                class="py-6 text-center text-sm text-[var(--talos-danger,#dc5b5b)]"
            >
                {{ t('localModels.repoFailed') }} {{ explain(store.repo.failure) }}
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
                        <!-- The context every verdict was computed at. It was
                             hard-coded and unstated, so the counter-offer named
                             a number against a baseline the user could not see
                             and had no control to change. -->
                        <p data-testid="talos-models-context" class="text-3xs text-[var(--talos-muted)]">
                            {{ t('localModels.contextExplain', { context: store.context }) }}
                        </p>
                        <!-- The counter-offer. A refusal that ends the
                             conversation is a worse product than one that
                             moves it. -->
                        <button
                            v-if="row.verdict.counterOfferContext"
                            type="button"
                            data-testid="talos-models-counteroffer"
                            class="talos-pressable min-h-10 text-left text-2xs text-[var(--talos-accent)] underline"
                            @click="acceptCounterOffer(row.key, row.verdict.counterOfferContext)"
                        >
                            {{ t('localModels.counterOffer', { context: row.verdict.counterOfferContext }) }}
                        </button>
                    </template>

                    <p v-else-if="row.set.examination.state === 'reading'" class="text-2xs text-[var(--talos-muted)]">
                        {{ t('localModels.examining') }}
                    </p>

                    <p
                        v-else-if="row.set.examination.state === 'unreadable'"
                        class="text-2xs text-[var(--talos-muted)]"
                    >
                        {{ t('localModels.unreadable') }} {{ explain(row.set.examination.reason) }}
                    </p>

                    <div class="flex gap-2">
                        <!-- Offered while unread AND after a failure: it used to
                             render only for `unread`, so one failed check
                             removed the only way to try again. -->
                        <Button
                            v-if="row.set.examination.state !== 'reading'"
                            type="button"
                            data-testid="talos-models-examine"
                            class="talos-pressable min-h-11 flex-1 rounded-full border border-[var(--talos-border)] text-sm text-[var(--talos-text)]"
                            @click="talosExamineSet(row.key)"
                        >
                            {{ row.set.examination.state === 'unread' ? t('localModels.examine') : t('localModels.recheck') }}
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
