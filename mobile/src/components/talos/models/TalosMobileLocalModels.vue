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
import { Search, LayoutGrid, List, FolderOpen } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import {
    talosLocalModels,
    talosSearchLocalModels,
    talosRefreshLeftovers,
    talosRefreshHuggingFaceToken,
    talosLoadLocalCatalogue,
    talosSetLocalModelSort,
} from '@/stores/localModels'
import { talosDiscardModelTransfer } from '@/services/modelTransfer'
import {
    talosLocalInstalledModels,
    type TalosLocalModelFile,
} from '@/services/localEngine'
import {
    talosInstalledModelsView,
    talosModelFolder,
    talosModelSize,
    TALOS_INSTALLED_MODEL_SORTS,
    type TalosInstalledModelSort,
} from '@/lib/models/installedModels'
import TalosThemedFilter from '@/components/talos/ui/TalosThemedFilter.vue'
import { talosSortChipClass } from '@/lib/sortChip'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import { useSettingsStore } from '@/stores/settings'
import {
    talosModelImportFailure,
    talosOnModelImportProgress,
    talosPickModelFromDevice,
} from '@/services/modelImport'
import type { TalosCatalogueRecommendation } from '@/lib/models/catalogue'
import TalosModelFitBar from '@/components/talos/models/TalosModelFitBar.vue'
import TalosMobileLocalModelRow from '@/components/talos/models/TalosMobileLocalModelRow.vue'
import type { TalosHuggingFaceModel, TalosHuggingFaceSort } from '@/lib/models/huggingFace'
import { talosFitBadge, type TalosFitTone } from '@/lib/models/fitBadge'
import { talosEstimatedCapacity } from '@/lib/models/fit'
import {
    talosApplyBrowseFilters,
    talosBrowseCapacitySize,
    TALOS_BROWSE_FILTERS,
    type TalosBrowseFilterId,
} from '@/lib/models/browseFilters'
import { talosBrowsePublishers, talosGroupModelsByProvider } from '@/lib/models/providerGrouping'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import {
    talosFormatBytes,
    talosModelInitials,
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

/**
 * The address, said out loud once and then put where it can be used.
 *
 * «Dove sta» was half the owner's question, and a forty-character path nobody
 * can select is an address nobody can act on — so this is the answer, not the
 * line that used to sit on the row.
 *
 * It reports both outcomes, which it did not have to before. The row still
 * printed the whole path, so a copy that quietly failed cost nothing: you read
 * it off the screen instead. Now the row does not, and a silent failure would
 * leave somebody with a menu item that does nothing and an address they cannot
 * reach by any other route. Compacting a screen is allowed to remove a line; it
 * is not allowed to remove the only copy of something.
 */
const copyNotice = ref<{ ok: boolean, text: string } | null>(null)
let copyTimer: ReturnType<typeof setTimeout> | null = null

/**
 * CRUD sui modelli scaricati — owner 2026-08-04: non c'era.
 *
 * «Usiamo la grammatica dell'app gia' esistente»: quindi menu ⋮ come nella
 * Ricerca, dialogo di rinomina identico (campo, «rimetti il nome originale»,
 * salva) ed eliminazione con la conferma che dice cosa va via davvero — qui i
 * gigabyte sul disco, che sono la cosa che nessuno si aspetta di riscaricare.
 */
function aliasOf(file: TalosLocalModelFile): string {
    return settings.state.shell.local_model_aliases?.[file.path] ?? ''
}

/** Come si chiama per chi lo guarda: il suo nome se gliene ha dato uno. */
function nameOf(file: TalosLocalModelFile): string {
    return aliasOf(file) || file.name
}

function menuFor(file: TalosLocalModelFile): TalosRowAction[] {
    return [
        { id: 'rename', label: t('localModels.rename'), testId: `talos-models-rename-${file.name}` },
        { id: 'copy', label: t('localModels.copyPath'), testId: `talos-models-copy-${file.name}` },
        { id: 'delete', label: t('localModels.delete'), danger: true, testId: `talos-models-delete-${file.name}` },
    ]
}

const renameTarget = ref<TalosLocalModelFile | null>(null)
const renameValue = ref('')
const deleteTarget = ref<TalosLocalModelFile | null>(null)
const crudError = ref<string | null>(null)

function act(file: TalosLocalModelFile, action: string): void {
    crudError.value = null
    if (action === 'copy') { void copyPath(file.path); return }
    if (action === 'rename') {
        renameTarget.value = file
        renameValue.value = aliasOf(file)
        return
    }
    if (action === 'delete') deleteTarget.value = file
}

async function submitRename(): Promise<void> {
    const target = renameTarget.value
    if (!target) return
    const chosen = renameValue.value.trim()
    const aliases = { ...settings.state.shell.local_model_aliases }
    // Vuoto vuol dire «rimetti il nome del file»: lo stesso significato che ha
    // nella Ricerca, dove svuotare il campo rimette la domanda.
    if (chosen.length === 0) delete aliases[target.path]
    else aliases[target.path] = chosen
    await settings.setShell({ local_model_aliases: aliases })
    renameTarget.value = null
}

async function confirmDelete(): Promise<void> {
    const target = deleteTarget.value
    if (!target) return
    try {
        const { talosLocalModelDelete } = await import('@/services/localEngine')
        await talosLocalModelDelete(target.path)
        // Anche l'alias se ne va: un nome che punta a un file che non c'e' piu'
        // e' un residuo che ricomparirebbe su un modello riscaricato.
        const aliases = { ...settings.state.shell.local_model_aliases }
        delete aliases[target.path]
        await settings.setShell({ local_model_aliases: aliases })
        deleteTarget.value = null
        await loadInstalled()
    } catch (failure) {
        crudError.value = failure instanceof Error ? failure.message : String(failure)
        deleteTarget.value = null
    }
}

async function copyPath(path: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(path)
        copyNotice.value = { ok: true, text: t('localModels.pathCopied') }
    } catch {
        // Named, and with the one thing left to try. Verified on the tablet
        // 2026-08-03: with a real tap the write succeeds — a refusal here means
        // the system denied the clipboard, not that the path is wrong.
        copyNotice.value = { ok: false, text: t('localModels.pathCopyRefused') }
    }
    if (copyTimer !== null) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copyNotice.value = null }, 4000)
}

onUnmounted(() => { if (copyTimer !== null) clearTimeout(copyTimer) })

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
/**
 * Remembered, like the Library remembers its own.
 *
 * It was a plain `ref`, which is the same defect the Library carried until July
 * (debt P6): a preference that resets on every visit is not a preference, it is
 * a default with a switch on it. There is no argument for the same
 * list-ordering choice being durable in one room and amnesiac in the next.
 */
const installedSort = computed<TalosInstalledModelSort>({
    get: () => settings.state.shell.models_sort,
    set: (value) => { void settings.setShell({ models_sort: value }) },
})
const installedLoading = ref(true)
const installedReadFailure = ref(false)

const installedView = computed(() => talosInstalledModelsView(installed.value, {
    query: installedQuery.value,
    sort: installedSort.value,
}))

const sortItems = computed(() => TALOS_INSTALLED_MODEL_SORTS.map((value) => ({
    value,
    label: t(`localModels.sort.${value}`),
    testId: `talos-models-installed-sort-${value}`,
})))

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
    installedReadFailure.value = false
    try {
        const listing = await talosLocalInstalledModels()
        installed.value = listing.models
        unreadable.value = listing.unreadable
    } catch {
        // A refusal here is not the same as "no models": the list stays as it
        // was and the empty state below never claims the phone is bare.
        installedReadFailure.value = true
    } finally {
        installedLoading.value = false
    }
}
const store = talosLocalModels

onMounted(async () => {
    // Measured on every visit, not once at start: free memory, free space and
    // heat all move, and a fit answer from an hour ago is about a different
    // phone.
    await Promise.all([
        // A direct deep link still needs a fresh fit measurement. The shared
        // device summary is rendered by the Model Lab hub, not duplicated here.
        talosLoadLocalCatalogue(),
        talosRefreshLeftovers(),
        talosRefreshHuggingFaceToken(),
    ])
})

onMounted(() => { void loadInstalled() })

/**
 * The family name, when it is not the model name said twice.
 *
 * The catalogue carries both, and for most entries the family is the first word
 * of the display name — «Qwen3» under «Qwen3 4B Instruct». A whole line per row
 * spent repeating a word already two lines above it is exactly the vertical
 * spend the owner asked to economise; where the two genuinely differ
 * («Mistral» for a «Ministral 8B») it still gets said.
 */
function familyWorthSaying(entry: TalosCatalogueRecommendation['entry']): string | null {
    const family = entry.family.trim()
    if (family === '') return null
    return entry.displayName.toLowerCase().startsWith(family.toLowerCase()) ? null : family
}

/** One catalogue row, worked out once rather than four times per render. */
function rowOf(item: Readonly<TalosCatalogueRecommendation>) {
    return {
        key: item.entry.id,
        initials: talosModelInitials(item.entry.family),
        family: familyWorthSaying(item.entry),
        entry: item.entry,
        size: talosFormatBytes(item.entry.fileBytes),
        working: talosFormatBytes(item.entry.ramWorkingBytes),
        missing: item.capacity.state === 'unknown'
            ? null
            : talosFormatBytes(Math.abs(
                item.capacity.availableBytes - item.capacity.needsBytes)),
        fits: item.fits,
        speed: item.entry.referenceSpeed[0]?.tokensPerSecond ?? null,
        /*
         * L'etichetta di capienza — owner 2026-08-04, sul mockup approvato:
         * «come etichetta che vedo sempre».
         *
         * NON un filtro: nascondere un modello perche' oggi non c'e' spazio
         * toglie l'informazione che domani, liberando memoria, potrebbe
         * starci — e toglie anche il motivo per liberarla.
         *
         * Il verdetto viene dal catalogo, che ha gia' pesato il file piu' la
         * memoria di lavoro. Qui si TRADUCE e basta.
         */
        badge: talosFitBadge(item.capacity),
        headroom: item.capacity.state === 'unknown'
            ? null
            : talosFormatBytes(Math.abs(
                item.capacity.availableBytes - item.capacity.needsBytes)),
        headroomPositive: item.capacity.state === 'fits' || item.capacity.state === 'tight',
    }
}

const recommended = computed(() => store.catalogue.recommended.map(rowOf))
const rejected = computed(() => store.catalogue.rejected.map(rowOf))
/** The search door opens only when asked for: the list is the screen. */
const searching = ref(false)

async function search(): Promise<void> {
    refused.value = null
    await talosSearchLocalModels(query.value)
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

/**
 * I filtri accesi. Owner 2026-08-04, dal mockup approvato.
 *
 * Un elenco e non cinque booleani: si somma con `every`, si conta, e aggiungere
 * un filtro domani non aggiunge una variabile da ricordare.
 */
const filtriAttivi = ref<TalosBrowseFilterId[]>([])

/**
 * Le voci dell'ordinamento.
 *
 * I valori sono i nomi del Hub — `downloads`, `likes`, `lastModified`,
 * `createdAt` — e non nostri: tradurli a ogni richiesta vorrebbe dire sbagliare
 * la traduzione una volta e non capire perche' la lista e' quella sbagliata.
 */
const ordinamenti = computed(() => ([
    { value: 'downloads', label: t('localModels.sort.downloads') },
    { value: 'likes', label: t('localModels.sort.likes') },
    { value: 'lastModified', label: t('localModels.sort.lastModified') },
    { value: 'createdAt', label: t('localModels.sort.createdAt') },
]))
function commutaFiltro(id: TalosBrowseFilterId): void {
    filtriAttivi.value = filtriAttivi.value.includes(id)
        ? filtriAttivi.value.filter((x) => x !== id)
        : [...filtriAttivi.value, id]
}

/**
 * La lista come si vede: filtrata.
 *
 * La capienza resta un'ETICHETTA su ogni riga anche quando il filtro «ci sta»
 * e' spento — owner 2026-08-04: «come etichetta che vedo sempre». Il filtro e'
 * un gesto in piu', non il modo normale di guardare la lista.
 */
const risultatiVisibili = computed(() => talosApplyBrowseFilters(
    store.results,
    filtriAttivi.value,
    store.device,
))

const providerGroups = computed(() => talosGroupModelsByProvider(risultatiVisibili.value))

/**
 * La capienza stimata di una riga sfogliata, calcolata UNA volta per nome.
 *
 * La cache non e' un vezzo: il template la interroga piu' volte per riga e la
 * lista si ridisegna a ogni filtro. Senza, si rifarebbe la regex venti volte
 * per venti modelli a ogni tasto premuto.
 */
/**
 * La capienza di una riga sfogliata: MISURATA quando si puo', stimata quando no.
 *
 * MISURATO 2026-08-04: `expand[]=siblings` porta i nomi delle varianti ma non i
 * byte LFS. Il selector sceglie quindi una Q4 realmente pubblicata e marca la
 * stima da parametri; soltanto un sibling con byte positivi e' misura. Il nome
 * resta compatibilita' per cache legacy prive del campo `browseVariant`.
 *
 * In cache per riga: il template la interroga piu' volte e la lista si
 * ridisegna a ogni filtro.
 */
const capienze = new Map<string, {
    tone: TalosFitTone
    ratio: number | null
    labelKey: string
    size: string | null
    estimated: boolean
}>()

function stimaDi(model: TalosHuggingFaceModel) {
    const size = talosBrowseCapacitySize(model)
    const fileBytes = size?.fileBytes ?? null
    const workingBytes = size?.workingBytes ?? null
    const measured = store.device
    const chiave = [
        model.id,
        fileBytes ?? 'unknown-size',
        workingBytes ?? 'unknown-working-size',
        measured?.availableRamBytes ?? 'unknown-memory',
        measured?.lowMemoryThresholdBytes ?? 'unknown-threshold',
        measured?.freeStorageBytes ?? 'unknown-storage',
    ].join('|')
    const cached = capienze.get(chiave)
    if (cached) return cached

    const badge = talosFitBadge(talosEstimatedCapacity({
        fileBytes,
        workingBytes,
        device: measured,
    }))
    const esito = {
        tone: badge.tone,
        ratio: badge.ratio,
        labelKey: badge.labelKey,
        size: fileBytes === null ? null : talosFormatBytes(fileBytes),
        // La tilde compare solo quando il numero e' dedotto: una stima che si
        // spaccia per misura e' peggio di nessun numero.
        estimated: size?.estimated ?? false,
    }
    capienze.set(chiave, esito)
    return esito
}

function modelRowCapacity(model: TalosHuggingFaceModel) {
    const capacity = stimaDi(model)
    return {
        tone: capacity.tone,
        ratio: capacity.ratio,
        label: t(capacity.labelKey),
        size: capacity.size,
        estimated: capacity.estimated,
    }
}
const providerItems = computed(() => talosBrowsePublishers(store.results, providerFilter.value))
const visibleGroups = computed(() => providerFilter.value === ''
    ? providerGroups.value
    : providerGroups.value.filter((group) => group.provider === providerFilter.value))
const visibleResultCount = computed(() => visibleGroups.value.reduce(
    (total, group) => total + group.models.length,
    0,
))

function resetBrowseFilters(): void {
    filtriAttivi.value = []
    providerFilter.value = ''
}

function providerCountLabel(count: number): string {
    return t(count === 1 ? 'localModels.providerCountOne' : 'localModels.providerCount', { count })
}

function resultCountLabel(count: number): string {
    return t(count === 1 ? 'localModels.resultsCountOne' : 'localModels.resultsCount', { count })
}

</script>

<template>
    <!-- Owner 2026-08-04: «meno padding laterale su tutta la schermata
         locale». Da 4 a 2: su un telefono ogni riga guadagna 16px di larghezza
         utile, e i nomi dei modelli sono lunghi. -->
    <div
        class="flex min-h-full flex-col gap-[var(--talos-space-section)] pb-[max(var(--talos-space-page),env(safe-area-inset-bottom))] pt-[var(--talos-space-inline)]"
        data-testid="talos-models-section"
    >
        <!-- Con un modello aperto questa E' una pagina, non una sezione: cio'
             che riguarda gli altri modelli sparisce. Owner 2026-08-04: «la
             pagina dedicata per ogni modello». Lasciare sopra «su questo
             dispositivo» e la scheda del telefono faceva scorrere mezzo schermo
             prima di arrivare alle varianti, che sono il motivo per cui si e'
             entrati. -->
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
        <section
            v-if="installedLoading || installedView.total > 0 || unreadable.length > 0 || installedReadFailure"
            data-testid="talos-models-installed"
            class="flex flex-col gap-[var(--talos-space-section)]"
        >
            <div class="flex items-baseline justify-between gap-[var(--talos-space-inline)]">
                <h3 class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                    {{ t('localModels.installedTitle') }}
                </h3>
                <span v-if="installedView.total" class="text-2xs tabular-nums text-[var(--talos-muted)]">
                    {{ t('localModels.installedCount', { count: installedView.total }) }}
                </span>
            </div>

            <!-- Controls for a list that has something to control.
                 With one model on the phone, a search field, three sort chips
                 and a layout switch are three rows of furniture standing over a
                 single row of content — the exact «spreco di spazio» this pass
                 is about. Nothing is designed differently; it simply is not
                 drawn until there is more than one thing to order. -->
            <template v-if="installedView.total > 1">
                <!-- The Library's search field to the pixel: same rounding, same
                     inset icon, same height. A third shape for the same job is a
                     third thing to learn. -->
                <label class="relative block">
                    <Search class="pointer-events-none absolute left-[var(--talos-space-control)] top-1/2 size-[var(--talos-icon-size)] -translate-y-1/2 text-[var(--talos-muted)]" aria-hidden="true" />
                    <input
                        v-model="installedQuery"
                        type="search"
                        inputmode="search"
                        data-testid="talos-models-installed-search"
                        :placeholder="t('localModels.installedSearch')"
                        :aria-label="t('localModels.installedSearch')"
                        class="min-h-touch w-full rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-[calc(var(--talos-icon-size)+var(--talos-space-control)*2)] pr-[var(--talos-space-control)] text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                    >
                </label>

                <div class="flex items-center gap-[var(--talos-space-inline)]">
                    <TalosThemedFilter
                        class="min-w-0 flex-1"
                        group-class="flex gap-[var(--talos-space-inline)] overflow-x-auto"
                        :model-value="installedSort"
                        :options="sortItems"
                        :group-label="t('localModels.sortLabel')"
                        :option-class="talosSortChipClass"
                        @update:model-value="installedSort = $event as TalosInstalledModelSort"
                    />
                    <button
                        type="button"
                        data-testid="talos-models-installed-layout"
                        :aria-label="t(layout === 'grid' ? 'research.showAsList' : 'research.showAsGrid')"
                        class="talos-pressable inline-flex size-[var(--talos-touch-target)] shrink-0 items-center justify-center rounded-full border border-[var(--talos-border)] text-[var(--talos-muted)]"
                        @click="chooseLayout(layout === 'grid' ? 'list' : 'grid')"
                    >
                        <List v-if="layout === 'grid'" class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                        <LayoutGrid v-else class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                    </button>
                </div>
            </template>

            <p v-if="installedLoading" class="text-xs text-[var(--talos-muted)]">{{ t('localModels.installedLoading') }}</p>

            <p
                v-else-if="installedReadFailure"
                data-testid="talos-models-installed-error"
                role="alert"
                class="text-xs leading-5 text-[var(--talos-danger)]"
            >{{ t('localModels.installedReadError') }}</p>
            <p
                v-else-if="installedView.total > 0 && installedView.models.length === 0"
                class="text-xs text-[var(--talos-muted)]"
            >{{ t('localModels.installedNoMatch') }}</p>

            <ul
                v-else-if="installedView.models.length > 0"
                data-testid="talos-models-installed-list"
                :data-layout="layout"
                class="min-w-0 overflow-hidden rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)]"
                :class="layout === 'grid'
                    ? 'grid grid-cols-2 gap-px bg-[var(--talos-border)] sm:grid-cols-3'
                    : 'flex flex-col divide-y divide-[var(--talos-border)]'"
            >
                <li
                    v-for="file in installedView.models"
                    :key="file.path"
                    data-testid="talos-models-installed-row"
                    class="relative min-w-0 bg-[var(--talos-panel)] px-[var(--talos-space-control)] py-[var(--talos-space-inline)] pr-[var(--talos-touch-target)]"
                >
                    <!-- Outside the row body and never nested in a button: two
                         hit areas that overlap mean one swallows the other. -->
                    <div class="absolute right-1 top-1 z-10">
                        <TalosRowActions
                            :test-id="`talos-models-installed-menu-${file.name}`"
                            :label="t('localModels.actionsFor', { name: file.name })"
                            :items="menuFor(file)"
                            @select="(action) => act(file, action)"
                        />
                    </div>
                    <p class="truncate text-sm text-[var(--talos-text)]">{{ nameOf(file) }}</p>
                    <!-- Il nome vero resta leggibile sotto quello scelto: un
                         alias che NASCONDE il file rende impossibile capire
                         quale GGUF si sta per cancellare. -->
                    <p v-if="aliasOf(file)" class="truncate font-mono text-2xs text-[var(--talos-muted)]">{{ file.name }}</p>
                    <!-- Two lines per row, not five.
                         The third line used to be the whole address in
                         monospace, which on a phone wraps to three lines whose
                         first fifty characters are identical for every model in
                         the list. What differs is the folder, so that is what is
                         said; the exact string lives under ⋮ «Copia il
                         percorso», which is also the only form of it anybody can
                         act on. -->
                    <p class="mt-[var(--talos-space-inline)] flex min-w-0 flex-wrap gap-x-[var(--talos-space-inline)] text-2xs tabular-nums text-[var(--talos-muted)]">
                        <span>{{ talosModelSize(file.bytes, locale) }}</span>
                        <span aria-hidden="true">·</span>
                        <span>{{ installedDate(file.modifiedAt) }}</span>
                        <template v-if="talosModelFolder(file.path)">
                            <span aria-hidden="true">·</span>
                            <span class="min-w-0 truncate font-mono">{{ talosModelFolder(file.path) }}</span>
                        </template>
                    </p>
                </li>
            </ul>

            <!-- Said where the tap happened, and never in a way that steals
                 focus: `role="status"` is heard, never jumped to. -->
            <p
                v-if="copyNotice"
                role="status"
                data-testid="talos-models-copy-notice"
                class="text-2xs leading-5"
                :class="copyNotice.ok ? 'text-[var(--talos-muted)]' : 'text-[var(--talos-danger)]'"
            >{{ copyNotice.text }}</p>

            <p
                v-if="unreadable.length"
                data-testid="talos-models-installed-unreadable"
                class="text-2xs leading-5 text-[var(--talos-danger)]"
            >{{ t('localModels.installedUnreadable', { count: unreadable.length }) }}</p>
        </section>

            <!--
                The door that opens inward.

                A phone can already hold a `.gguf` — put there over USB, or
                downloaded outside TALOS — and until today the app had no way to
                be given it. For something local-first, that is «open a file»
                missing.
            -->
            <div class="flex flex-col gap-[var(--talos-space-inline)]">
                <Button
                    data-testid="talos-models-import"
                    variant="outline"
                    class="min-h-touch w-full"
                    :disabled="importing"
                    @click="importFromDevice()"
                >
                    <FolderOpen class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                    {{ importing ? t('localModels.importing') : t('localModels.importFromDevice') }}
                </Button>
                <!-- A determinate bar because the denominator is a real file
                     size, not a guess — and a 3 GB copy without one looks hung. -->
                <div
                    v-if="importing && importTotal > 0"
                    class="h-[calc(var(--talos-space-inline)/2)] overflow-hidden rounded-full bg-[var(--talos-border)]"
                    role="progressbar"
                    :aria-valuemin="0"
                    :aria-valuemax="100"
                    :aria-valuenow="importPercent"
                >
                    <div class="h-full rounded-full bg-[var(--talos-accent)] transition-[width] duration-[var(--talos-motion-duration-activity-progress)]" :style="{ width: `${importPercent}%` }" />
                </div>
                <p class="text-2xs leading-4 text-[var(--talos-muted)]">{{ t('localModels.importNote') }}</p>
                <p v-if="importError" role="alert" data-testid="talos-models-import-error" class="text-2xs leading-5 text-[var(--talos-danger)]">
                    {{ importError }}
                </p>
            </div>

        <!-- Measuring. A skeleton rather than an empty screen: the list is
             coming, and saying so is different from showing nothing. -->
        <div
            v-if="store.catalogue.state === 'measuring'"
            data-testid="talos-models-measuring"
            class="flex flex-col items-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-[var(--talos-space-page)] text-center"
        >
            <span class="size-[calc(var(--talos-touch-target)*.75)] animate-spin rounded-full border-2 border-[var(--talos-active)] border-t-[var(--talos-accent)]" aria-hidden="true" />
            <b class="text-sm font-semibold text-[var(--talos-text)]">{{ t('localModels.measuring') }}</b>
            <span class="text-2xs text-[var(--talos-muted)]">{{ t('localModels.measuringWhat') }}</span>
        </div>

        <!-- THE LIST. The screen is this, not a search box: the reader arrives
             and the models are already there, ranked for the phone above. -->
        <template v-if="store.catalogue.state === 'ready'">
            <div v-if="recommended.length" class="flex items-baseline justify-between gap-[var(--talos-space-inline)] px-[var(--talos-space-inline)]">
                <h5 class="text-xs font-bold uppercase tracking-wider text-[var(--talos-text)]">
                    {{ t('localModels.recommendedHere') }}
                </h5>
                <span class="font-mono text-2xs tabular-nums text-[var(--talos-muted)]">{{ recommended.length }}</span>
            </div>

            <article
                v-for="(row, index) in recommended"
                :key="row.key"
                data-testid="talos-models-catalogue-row"
                class="grid grid-cols-[2.375rem_1fr] gap-[var(--talos-space-section)] rounded-[var(--talos-radius-card)] border bg-[var(--talos-panel)]/70 p-[var(--talos-space-card)]"
                :class="index === 0 ? 'border-[var(--talos-accent)]/45' : 'border-[var(--talos-border)]'"
            >
                <span class="grid size-[calc(var(--talos-touch-target)*.8)] place-items-center rounded-[var(--talos-radius-control)] border border-[var(--talos-accent)]/25 bg-[var(--talos-accent)]/10 font-mono text-xs font-bold text-[var(--talos-accent)]">
                    {{ row.initials }}
                </span>
                <div class="flex min-w-0 flex-col gap-[var(--talos-space-inline)]">
                    <div class="flex flex-wrap items-center gap-[var(--talos-space-inline)]">
                        <b class="text-sm font-semibold text-[var(--talos-text)]">{{ row.entry.displayName }}</b>
                        <span
                            v-if="index === 0"
                            data-testid="talos-models-recommended-badge"
                            class="rounded-full bg-[var(--talos-accent)] px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)] font-mono text-3xs font-bold uppercase tracking-wider text-[var(--talos-accent-text)]"
                        >{{ t('localModels.recommended') }}</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-[var(--talos-space-inline)] font-mono text-2xs tabular-nums text-[var(--talos-muted)]">
                        <span>{{ row.entry.publisher }}</span><span class="opacity-40">·</span>
                        <span>{{ row.entry.quantisation }}</span><span class="opacity-40">·</span>
                        <span>{{ row.size }}</span><span class="opacity-40">·</span>
                        <span>{{ row.entry.contextTokens }}</span>
                        <!-- La capienza, dal componente unico: due liste sulla stessa
                             schermata non devono poter divergere. -->
                        <TalosModelFitBar
                            :tone="row.badge.tone"
                            :ratio="row.badge.ratio"
                            :label="t(row.badge.labelKey)"
                        />
                    </div>
                    <p v-if="row.family" class="text-2xs leading-snug text-[var(--talos-muted)]">{{ row.family }}</p>
                    <p class="flex items-center gap-[var(--talos-space-inline)] text-2xs font-semibold text-[var(--talos-success)]">
                        <span class="size-[calc(var(--talos-icon-size)/3)] shrink-0 rounded-full bg-current" aria-hidden="true" />
                        {{ t('localModels.bandComfortable') }}
                        <span class="font-mono text-3xs font-medium tabular-nums text-[var(--talos-muted)]">
                            <template v-if="row.speed">~{{ row.speed }} t/s · </template>{{ row.working }}
                        </span>
                    </p>
                </div>
            </article>

            <!-- What does not fit STAYS, with its numbers. A model that
                 vanishes teaches nobody anything about their phone. -->
            <div v-if="rejected.length" class="flex items-baseline justify-between gap-[var(--talos-space-inline)] px-[var(--talos-space-inline)] pt-[var(--talos-space-inline)]">
                <h5 class="text-xs font-bold uppercase tracking-wider text-[var(--talos-text)]">
                    {{ t('localModels.notHere') }}
                </h5>
                <span class="font-mono text-2xs tabular-nums text-[var(--talos-muted)]">{{ rejected.length }}</span>
            </div>

            <article
                v-for="row in rejected"
                :key="row.key"
                data-testid="talos-models-catalogue-rejected"
                class="grid grid-cols-[2.375rem_1fr] gap-[var(--talos-space-section)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-[var(--talos-space-card)]"
            >
                <span class="grid size-[calc(var(--talos-touch-target)*.8)] place-items-center rounded-[var(--talos-radius-control)] border border-[var(--talos-muted)]/20 bg-[var(--talos-muted)]/10 font-mono text-xs font-bold text-[var(--talos-muted)]">
                    {{ row.initials }}
                </span>
                <div class="flex min-w-0 flex-col gap-[var(--talos-space-inline)]">
                    <b class="text-sm font-semibold text-[var(--talos-text)]">{{ row.entry.displayName }}</b>
                    <div class="flex flex-wrap items-center gap-[var(--talos-space-inline)] font-mono text-2xs tabular-nums text-[var(--talos-muted)]">
                        <span>{{ row.entry.publisher }}</span><span class="opacity-40">·</span>
                        <span>{{ row.entry.quantisation }}</span><span class="opacity-40">·</span>
                        <span>{{ row.size }}</span>
                    </div>
                    <TalosModelFitBar
                        :tone="row.badge.tone"
                        :ratio="row.badge.ratio"
                        :label="t(row.badge.labelKey)"
                    />
                    <p class="text-2xs leading-4 text-[var(--talos-muted)]">
                        {{ t(row.badge.reasonKey, row.headroom === null
                            ? {}
                            : (row.headroomPositive
                                ? { left: row.headroom }
                                : { missing: row.headroom })) }}
                    </p>
                </div>
            </article>
        </template>

        <!--
            Owner 2026-08-04: «e' ancora un campo input in cui devi inserire
            manualmente le cose; voglio una lista gia' caricata con un loading,
            con i filtri».

            La ricerca era dietro una porta da aprire, e chi non la apriva
            restava con il catalogo misurato e basta. Ora il campo e' sempre
            visibile e ha cambiato mestiere: da «scrivi cosa cercare» a «cerca
            altro sul Hub» — la stessa grammatica della Libreria, dove il campo
            restringe cio' che gia' vedi invece di essere la porta d'ingresso.
        -->
        <button
            v-if="!searching"
            type="button"
            data-testid="talos-models-open-search"
            class="talos-pressable flex min-h-touch items-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] px-[var(--talos-space-control)] py-[var(--talos-space-inline)] text-left"
            @click="searching = true"
        >
            <Search class="size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
            <span class="text-sm text-[var(--talos-muted)]">{{ t('localModels.searchLabel') }}</span>
        </button>

        <!-- Space held by attempts nobody is watching. The reservation is taken
             up front, so an abandoned download still holds the whole file. -->
        <div
            v-if="store.leftovers.totalBytes > 0"
            data-testid="talos-models-leftovers"
            class="flex flex-wrap items-center gap-[var(--talos-space-inline)] text-2xs text-[var(--talos-muted)]"
        >
            <span>{{ t('localModels.leftovers', { size: talosFormatBytes(store.leftovers.totalBytes) }) }}</span>
            <!-- The button that was missing. The string and the service call
                 both existed and neither was wired to anything, so the line was
                 a statement of loss with no way to act on it. -->
            <button
                type="button"
                data-testid="talos-models-reclaim"
                class="talos-pressable min-h-touch rounded-full border border-[var(--talos-border)] px-[var(--talos-space-control)] text-[var(--talos-text)]"
                @click="reclaim()"
            >
                {{ t('localModels.reclaim') }}
            </button>
        </div>

        <p v-if="refused" role="alert" data-testid="talos-models-refused" class="text-xs text-[var(--talos-danger)]">
            {{ refused }}
        </p>

        <!-- Searching the Hub. -->
        <form v-if="searching" class="flex gap-[var(--talos-space-inline)]" @submit.prevent="search">
            <input
                v-model="query"
                data-testid="talos-models-query"
                :aria-label="t('localModels.searchLabel')"
                :placeholder="t('localModels.searchPlaceholder')"
                class="min-h-touch flex-1 rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-background)] px-[var(--talos-space-control)] text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            >
            <Button
                type="submit"
                data-testid="talos-models-search"
                :aria-label="t('localModels.searchLabel')"
                class="talos-pressable min-h-touch rounded-full bg-[var(--talos-accent)] px-[var(--talos-space-control)] text-[var(--talos-accent-text)]"
            >
                <Search class="size-[var(--talos-icon-size)]" aria-hidden="true" />
            </Button>
        </form>

        <!--
            I chip del mockup approvato: Ci sta · Chat · Codice · Q4 · Licenza
            libera. Owner 2026-08-04: «voglio una lista già caricata con un
            loading, con i filtri».

            Non le faccette del Hub: ognuno risponde a una domanda che si fa chi
            mette un modello su un TELEFONO. «Ci sta» è l'unico che nessun altro
            catalogo può avere, perché ha bisogno di sapere quanta memoria ha
            questo dispositivo.
        -->
        <div
            v-if="store.results.length"
            data-testid="talos-models-filters"
            role="group"
            :aria-label="t('localModels.filtersLabel')"
            class="flex min-w-0 flex-nowrap items-center gap-[var(--talos-space-inline)] overflow-x-auto overscroll-x-contain scroll-smooth pb-[var(--talos-space-inline)] motion-reduce:scroll-auto"
        >
            <button
                v-for="id in TALOS_BROWSE_FILTERS"
                :key="id"
                type="button"
                :data-testid="`talos-models-filter-${id}`"
                :aria-pressed="filtriAttivi.includes(id)"
                class="talos-pressable min-h-touch min-w-touch shrink-0 whitespace-nowrap rounded-full border px-[var(--talos-space-control)] py-[var(--talos-space-inline)] text-2xs font-medium transition-colors"
                :class="filtriAttivi.includes(id)
                    ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-accent-text)]'
                    : 'border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)]'"
                @click="commutaFiltro(id)"
            >{{ t(`localModels.filter.${id}`) }}</button>
        </div>

        <!-- L'ordinamento, col selettore che questa schermata usa gia' per il
             filtro autore. Owner 2026-08-04: «la grammatica c'è già, non devi
             inventarti nulla». Le voci sono quelle del Hub, non nostre. -->


        <p v-if="store.searching" class="py-[var(--talos-space-page)] text-center text-sm text-[var(--talos-muted)]">
            {{ t('localModels.searching') }}
        </p>

        <p v-else-if="store.searchFailure" role="alert" class="text-xs text-[var(--talos-danger)]">
            {{ store.searchFailure }}
        </p>

        <!-- Search results, under the organisation that published them. -->
        <template v-else-if="store.results.length">
            <!-- The same control the Catalog tab uses for remote providers, so
                 the two halves of the Model Lab read alike. Its options are
                 derived from the results — there is no list of publishers in
                 this app, because that list would age. -->
            <!-- Due comandi, una riga. Impilati a tutta larghezza mangiavano
                 mezzo schermo prima che si vedesse un modello — misurato
                 guardando la schermata sul telefono, non supposto. -->
            <div class="flex min-w-0 gap-[var(--talos-space-inline)]">
            <TalosThemedSelect
                data-testid="talos-models-sort"
                class="min-w-0 flex-1"
                :model-value="store.sort"
                :items="ordinamenti"
                :aria-label="t('localModels.sortLabel')"
                @update:model-value="(v) => talosSetLocalModelSort(v as TalosHuggingFaceSort)"
            />
            <TalosThemedSelect
                v-model="providerFilter"
                data-testid="talos-models-provider-filter"
                class="min-w-0 flex-1"
                :items="providerItems"
                :aria-label="t('localModels.filterProvider')"
                :none-label="t('localModels.allProviders')"
            />
            </div>

            <p class="font-mono text-3xs text-[var(--talos-muted)]">
                {{ resultCountLabel(visibleResultCount) }}
            </p>

            <div
                v-if="visibleResultCount === 0"
                data-testid="talos-models-filter-empty"
                class="flex flex-col items-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)] text-center"
            >
                <p class="text-sm text-[var(--talos-text)]">{{ t('localModels.filteredEmpty') }}</p>
                <p class="text-2xs leading-4 text-[var(--talos-muted)]">{{ t('localModels.filteredEmptyHint') }}</p>
                <button
                    type="button"
                    data-testid="talos-models-filter-reset"
                    class="talos-pressable min-h-touch rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-control)] text-sm font-semibold text-[var(--talos-text)]"
                    @click="resetBrowseFilters"
                >
                    {{ t('localModels.resetFilters') }}
                </button>
            </div>

            <section
                v-for="group in visibleGroups"
                :key="group.provider"
                data-testid="talos-models-provider-group"
                class="flex flex-col gap-[var(--talos-space-inline)]"
            >
                <h5 class="flex items-baseline justify-between gap-[var(--talos-space-inline)] px-[var(--talos-space-inline)]">
                    <span class="truncate text-xs font-semibold text-[var(--talos-text)]">{{ group.provider }}</span>
                    <span class="shrink-0 text-3xs text-[var(--talos-muted)]">
                        {{ providerCountLabel(group.models.length) }}
                    </span>
                </h5>

                <div
                    data-testid="talos-models-provider-list"
                    class="min-w-0 overflow-hidden rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] divide-y divide-[var(--talos-border)]"
                >
                    <TalosMobileLocalModelRow
                        v-for="model in group.models"
                        :key="model.id"
                        :model="model"
                        :capacity="modelRowCapacity(model)"
                    />
                </div>
            </section>
        </template>

        <p
            v-else-if="store.query.trim() !== '' && !store.searching"
            class="py-[var(--talos-space-page)] text-center text-sm text-[var(--talos-muted)]"
        >
            {{ t('localModels.noResults') }}
        </p>

    </div>

    <!-- Rinomina: lo STESSO dialogo della Ricerca. Campo, e il campo vuoto
         rimette il nome del file — che li' rimette la domanda. -->
    <TalosMobileConfirmDialog
        v-if="renameTarget"
        :title="t('localModels.renameTitle')"
        :description="t('localModels.renameHint')"
        @close="renameTarget = null"
    >
        <input
            v-model="renameValue"
            type="text"
            data-testid="talos-models-rename-field"
            :placeholder="renameTarget.name"
            :aria-label="t('localModels.renameLabel')"
            class="min-h-touch w-full rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-panel)] px-[var(--talos-space-control)] text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
        >
        <template #footer>
            <Button
                variant="ghost"
                data-testid="talos-models-cancel-rename"
                class="min-h-touch"
                @click="renameTarget = null"
            >{{ t('common.cancel') }}</Button>
            <Button
                data-testid="talos-models-rename-save"
                class="min-h-touch"
                @click="void submitRename()"
            >{{ t('common.save') }}</Button>
        </template>
    </TalosMobileConfirmDialog>

    <!-- Eliminazione: la conferma dice cosa va via DAVVERO, cioe' i gigabyte.
         «Elimina il modello?» non fa pensare a un'ora di download.
         La misura passa dallo STESSO formatter della riga: sul dispositivo la
         riga diceva «2,7 GB» e la conferma «2.5 GB» — stesso file, due numeri,
         nella stessa interazione. Uno contava in base 10 e l'altro in base 2, e
         chi legge non puo' saperlo: pensa che uno dei due sia sbagliato. -->
    <TalosMobileConfirmDialog
        v-if="deleteTarget"
        :title="t('localModels.deleteTitle', { name: nameOf(deleteTarget) })"
                :description="t('localModels.deleteBody', { size: talosModelSize(deleteTarget.bytes, locale) })"
        @close="deleteTarget = null"
    >
        <template #footer>
            <Button
                variant="ghost"
                data-testid="talos-models-cancel-delete"
                class="min-h-touch"
                @click="deleteTarget = null"
            >{{ t('common.cancel') }}</Button>
            <Button
                variant="destructive"
                data-testid="talos-models-delete-confirm"
                class="min-h-touch"
                @click="void confirmDelete()"
            >
                {{ t('localModels.deleteConfirm') }}
            </Button>
        </template>
    </TalosMobileConfirmDialog>

    <p v-if="crudError" role="alert" data-testid="talos-models-crud-error" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-[var(--talos-space-control)] text-sm text-[var(--talos-danger)]">
        {{ crudError }}
    </p>
</template>
