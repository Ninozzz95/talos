<script setup lang="ts">
import type { Component } from 'vue'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TalosRowActions from '@/components/talos/ui/TalosRowActions.vue'
import { useTalosI18n } from '@/i18n'
import { useTalosBulkSelection } from '@/composables/useTalosBulkSelection'
import { useTalosVaultThumbnails } from '@/composables/useTalosVaultThumbnails'
import {
    AlertTriangle, CheckCircle2, Database, FileText, FolderPlus,
    ArrowDownUp, Download, EllipsisVertical, ExternalLink, LayoutGrid, List, LoaderCircle, Paperclip, RefreshCw, Search, Trash2, Upload, X,
    Check,
    CheckSquare,
    Eye,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosMobileLibraryFileRow from '@/components/talos/library/TalosMobileLibraryFileRow.vue'
import TalosMobileSavedLinkRow from '@/components/talos/library/TalosMobileSavedLinkRow.vue'
import TalosMobileLibraryFileTile from '@/components/talos/library/TalosMobileLibraryFileTile.vue'
import TalosMobileLibrarySectionHeading from '@/components/talos/library/TalosMobileLibrarySectionHeading.vue'
import TalosMobileImageViewer from '@/components/talos/library/TalosMobileImageViewer.vue'
import TalosMobileFileOriginCard from '@/components/talos/library/TalosMobileFileOriginCard.vue'
import { useTalosFileOrigin } from '@/composables/useTalosFileOrigin'
import TalosMobileSavedLinkTile from '@/components/talos/library/TalosMobileSavedLinkTile.vue'
import { groupTalosLibraryByChat, type TalosLibrarySort } from '@/lib/libraryGrouping'
import { useTalosSourceCardIcons } from '@/composables/useTalosSourceCardIcons'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'
import { talosNeedsExternalOpen } from '@/lib/documents/openable'
import { useChatController } from '@/stores/chatController'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { useTalosOverlayBack } from '@/composables/useTalosOverlayBack'
import {
    filterTalosSavedLinkRows,
    type TalosSavedLinkRow,
    filterLibraryFiles,
    isTalosLibraryFileShared,
    matchesTalosLibrarySurfaceTab,
    parseVaultOrigin,
    parseVaultSourceUrl,
    talosLibraryFileType,
    talosSavedLinkRows,
    type TalosLibrarySurfaceTab,
} from '@/lib/vaultLibrary'
import { useTalosMobileToasts } from '@/stores/toasts'
import TalosThemedFilter from '@/components/talos/ui/TalosThemedFilter.vue'
import type { TalosLibraryContextMode } from '@/lib/chat/libraryPolicy'

const controller = useChatController()
const router = useRouter()
const { t, locale } = useTalosI18n()
const settings = useSettingsStore()
const toasts = useTalosMobileToasts()
const attachments = controller.attachments
const actionBusy = ref(false)
const savingFileId = ref<string | null>(null)
const feedback = ref('')
const deleteOpen = ref(false)
const deleteTarget = ref<TalosLocalVaultFile | null>(null)
const contextPolicySavingFileId = ref<string | null>(null)

const globalLibraryPolicy = computed(() => settings.state.shell.library_context_policy)
const globalLibraryEnabled = computed(
    () => globalLibraryPolicy.value?.enabled ?? settings.state.shell.library_context_enabled,
)
const globalLibraryMode = computed<TalosLibraryContextMode>(
    () => globalLibraryPolicy.value?.mode ?? 'broad_compat_v1',
)
const globalLibraryModeLabel = computed(() => {
    if (!globalLibraryEnabled.value) return t('library.contextModeOff')
    if (globalLibraryMode.value === 'smart_relevant_v1') return t('aiDefaults.libraryModes.smart')
    if (globalLibraryMode.value === 'ask_before_use_v1') return t('aiDefaults.libraryModes.ask')
    if (globalLibraryMode.value === 'agentic_on_demand_v1') return t('aiDefaults.libraryModes.onDemand')
    return t('aiDefaults.libraryModes.broad')
})

// Google/OPPO-Files-style Library: grid (default) / list, type chips, a bottom
// search, per-file thumbnails, tap-to-open, and an overflow menu.
// Remembered across visits (persisted in shell prefs).
const viewMode = computed({
    get: () => settings.state.shell.library_view,
    set: (value) => { void settings.setShell({ library_view: value }) },
})
const typeFilter = ref<TalosLibrarySurfaceTab>('all')
/**
 * Owner 2026-07-25 turned grouping on; it was a plain `ref`, so it came back off
 * at every visit — debt P6. It lives in shell preferences now, next to the sort
 * that arrived with it, rather than being the switch that forgets.
 */
const groupByChat = computed({
    get: () => settings.state.shell.library_group_by_chat,
    set: (value) => { void settings.setShell({ library_group_by_chat: value }) },
})
const sortOrder = computed<TalosLibrarySort>({
    get: () => settings.state.shell.library_sort,
    set: (value) => { void settings.setShell({ library_sort: value }) },
})
const sortOptions = computed<Array<{ value: TalosLibrarySort; label: string }>>(() => [
    { value: 'recent', label: t('library.sortRecent') },
    { value: 'oldest', label: t('library.sortOldest') },
    { value: 'name', label: t('library.sortName') },
])
const query = ref('')
const menuOpen = ref(false)
const typeFilterOptions = computed(() => typeTabs.value.map((tab) => ({
    value: tab.value,
    label: tab.label,
    testId: `talos-library-type-${tab.value}`,
})))

/** Appearance stays here; the radiogroup grammar belongs to the primitive. */
function typeFilterOptionClass(selected: boolean): string {
    return selected
        ? 'talos-pressable min-h-12 min-w-12 rounded-full px-3 text-sm transition-colors bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,var(--primary-foreground))]'
        : 'talos-pressable min-h-12 min-w-12 rounded-full px-3 text-sm transition-colors border border-[var(--talos-border)] text-[var(--talos-muted)]'
}

function chooseTypeFilter(value: string): void {
    const found = typeTabs.value.find((tab) => tab.value === value)
    if (found) typeFilter.value = found.value
}

const typeTabs = computed<Array<{ value: typeof typeFilter.value; label: string }>>(() => [
    { value: 'all', label: t('library.all') },
    { value: 'images', label: t('library.images') },
    { value: 'files', label: t('library.files') },
    // Owner 2026-07-27: the pages a search read are kept as markdown, which is
    // right for an answer that must still be auditable in six months — but it
    // meant the ADDRESS was prose. Here they are links again.
    { value: 'links', label: t('library.links') },
])

function isImage(file: TalosLocalVaultFile): boolean {
    return talosLibraryFileType(file) === 'image'
}

const filteredFiles = computed(() => {
    const typeMatched = attachments.vaultFiles
        .filter((file) => matchesTalosLibrarySurfaceTab(file, typeFilter.value))
    return filterLibraryFiles(typeMatched, {
        query: query.value,
        origin: 'all',
    })
})

/**
 * Owner decision P-07: where a file came from, on the file itself. Built by the
 * shared composable so the Library and a chat's gallery cannot say different
 * things about the same file.
 */
const { cardFor } = useTalosFileOrigin()
const lightboxOrigin = computed(() => cardFor(lightboxFile.value))
const docOrigin = computed(() => cardFor(docView.value))

/**
 * A file outlives the chat that made it, so the card offers the way back — and
 * the way back has to actually arrive somewhere. It selects the chat AND leaves
 * the Library, because selecting alone would look like nothing happened.
 */
async function openOriginChat(sessionId: string): Promise<void> {
    /**
     * The card only offers this for a chat it could NAME, so the id is live at
     * render time — but a chat can be deleted from another surface between the
     * render and the thumb. Selecting a session that is gone throws AND marks
     * the whole chat store as persistence-failed, so an unhandled rejection
     * here would turn a stale button into a broken app.
     */
    // Leave the viewer FIRST: it is a full-screen overlay, and the error below
    // renders underneath it — so reporting a failure without closing it looks
    // exactly like the button doing nothing.
    lightboxFile.value = null
    docView.value = null
    /**
     * Asked before it is attempted, not caught afterwards. `selectSession`
     * marks the whole chat store as persistence-failed on its way out, which
     * would disable "New chat" app-wide and claim local storage is unavailable
     * — a disproportionate answer to a chat someone deleted in another tab.
     */
    if (!controller.chat.sessions.some((session) => session.id === sessionId)) {
        openError.value = t('library.originChatGone')
        return
    }
    await controller.sessionLifecycle.selectSession(sessionId)
    await router.push({ name: 'chat' })
}

// Provenance: resolve the origin chat title for grouping + the per-file subtitle.
function originChat(file: TalosLocalVaultFile): string | null {
    const id = (file.metadata as { origin_session_id?: string | null }).origin_session_id ?? null
    if (!id) return null
    return controller.chat.sessions.find((session) => session.id === id)?.title ?? null
}


/**
 * The same source dossiers as one address each: a page read three times is one
 * row, and the row points at the most recent copy. The global `All` surface
 * aggregates these logical rows with ordinary files without exposing the
 * backing Markdown as a duplicate tile.
 */
const allLinkRows = computed(() => talosSavedLinkRows(attachments.vaultFiles))
const linkRows = computed(() => (
    typeFilter.value === 'all' || typeFilter.value === 'links'
        ? filterTalosSavedLinkRows(attachments.vaultFiles, query.value)
        : []
))
const logicalLibraryItemCount = computed(() => (
    attachments.vaultFiles.filter((file) => matchesTalosLibrarySurfaceTab(file, 'all')).length
    + allLinkRows.value.length
))

async function openLink(url: string): Promise<void> {
    openError.value = null
    const { openTalosLinkOnce } = await import('@/services/inAppBrowserService')
    // The user's own browser, with the user's own cookies. This is him going
    // back to a page, not TALOS reading one on his behalf — the isolated
    // webview was why these opened logged-out and looking broken.
    // The address stays on screen either way, so a refusal is a sentence rather
    // than a tap that quietly did nothing.
    if (!await openTalosLinkOnce(url, 'system_browser')) {
        openError.value = t('library.linkOpenFailed', { url })
    }
}

/** The copy TALOS kept, which is the half of this the owner already had. */
function openSavedCopy(fileId: string): void {
    const file = attachments.vaultFiles.find((entry) => entry.id === fileId)
    if (file) tapFile(file)
}

/** Present while the open document is a page that came from somewhere. */
const docSourceUrl = computed(() => (docView.value ? parseVaultSourceUrl(docView.value.metadata) : null))

// Thumbnails: one implementation, shared with the per-chat gallery. This screen
// held the original; leaving a second copy here was how the in-flight leak
// stayed fixed in one place and open in the other.
const { thumbs } = useTalosVaultThumbnails(filteredFiles, attachments.previewUrl)
onBeforeUnmount(closeLightbox)

// Open: images in a lightbox, documents in a text viewer (both in-app).
const lightboxFile = ref<TalosLocalVaultFile | null>(null)
const lightboxUrl = ref<string | null>(null)
const docView = ref<TalosLocalVaultFile | null>(null)
/**
 * ⛔⛔⛔ PDF-APRE-IL-FOGLIO-DI-CONDIVISIONE-01 — «Apri» CONDIVIDEVA.
 *
 * FOTOGRAFATO sul Pad il 2026-08-20: Libreria → un PDF → «Apri», e si apriva
 * il foglio di condivisione di Android, coi contatti veri della persona in
 * prima fila. Il file a un tocco dall'uscire dal telefono.
 *
 * `TalosMobilePdfViewer` esiste da sempre e la sua intestazione lo dice:
 * «qualunque superficie mostri un PDF monta questo». La Libreria non lo
 * montava. ⛔ Pigro come tutto il resto: chi non apre mai un PDF non ne paga
 * un byte nel grafo d'avvio, che ha un tetto misurato.
 */
const pdfView = ref<TalosLocalVaultFile | null>(null)
const VisualizzatorePdf = defineAsyncComponent(
    () => import('@/components/talos/library/TalosMobilePdfViewer.vue'),
)
// Perf review 2026-07-25: the list now holds bounded previews, so the viewer
// hydrates the full extracted text on open.
const docText = ref<string | null>(null)
const openError = ref<string | null>(null)

async function openFile(file: TalosLocalVaultFile): Promise<void> {
    if (file.status !== 'available') return
    // Owner 2026-07-26: tapping an xlsx did nothing, and it could not do
    // anything — the in-app viewer renders text, and a spreadsheet is not text.
    // Hand it to the app the user already trusts with that format instead of
    // showing a preview that is subtly wrong about a file they are about to
    // send to someone.
    if (talosNeedsExternalOpen(file.media_type)) {
        const { openTalosVaultFileExternally } = await import('@/services/openVaultFile')
        openError.value = null
        const preview = await attachments.previewBytes(file.id).catch(() => null)
        if (!preview) {
            openError.value = t('library.deviceReadFailed', { name: file.display_name })
            return
        }
        try {
            await openTalosVaultFileExternally({
                displayName: file.display_name,
                mediaType: file.media_type,
                bytes: preview,
            })
        } catch {
            openError.value = t('library.noOpenApp', { name: file.display_name })
        }
        return
    }
    // ⛔ Prima dell'immagine e prima del testo: un PDF non è né l'una né
    // l'altro, e il visore di testo mostrerebbe l'estratto invece delle pagine.
    if (file.media_type === 'application/pdf') {
        pdfView.value = file
        return
    }
    if (isImage(file)) {
        lightboxFile.value = file
        lightboxUrl.value = thumbs.value[file.id] ?? await attachments.previewUrl(file.id)
        return
    }
    docView.value = file
    docText.value = file.extracted_text
    const full = await attachments.hydrateText(file.id)
    if (docView.value?.id === file.id && full !== null) docText.value = full
    /*
     * ⛔⛔⛔ Owner 2026-08-27 — «non è possibile renderizzare HTML quando ci
     * clicchi nella Libreria invece del codice?». Il testo grezzo resta
     * comunque hydratato sopra (`docView`/`docText`): se il rendering
     * fallisce (dispositivo senza MULTI_PROFILE/MULTI_PROCESS, fail-closed
     * — vedi TalosArtifactActivity.kt), la persona non resta davanti a un
     * riquadro vuoto, vede il codice — lo stesso schermo che vedeva prima
     * di questa modifica.
     */
    if (file.media_type === 'text/html') void renderArtifactFile(file)
}

/**
 * ⛔⛔⛔ Owner 2026-08-27 — riusa la STESSA WebView isolata della scheda
 * `artefatto` in chat (`TalosArtifactActivity`, verificata sul Pad a non
 * avere accesso né al ponte Capacitor né alla rete) — non un secondo
 * renderer HTML. Funziona per QUALUNQUE file HTML della Libreria, non
 * solo quelli creati da `artifact_create`: l'isolamento non dipende da
 * chi ha scritto il file, dipende da come lo si esegue.
 *
 * ⛔ `create` + `open`, non una terza chiamata nativa dedicata: l'HTML
 * della Libreria diventa un artefatto EFFIMERO (un nuovo id in
 * `TalosArtifactStore`, non collegato al file della Libreria) — coerente
 * con «l'HTML non viaggia mai nella scheda né nei metadati», qui vale
 * anche per il file della Libreria: resta nel suo posto, la WebView
 * isolata ne legge solo una copia usa-e-getta.
 */
async function renderArtifactFile(file: TalosLocalVaultFile): Promise<void> {
    const html = docView.value?.id === file.id ? docText.value : await attachments.hydrateText(file.id)
    if (!html) return
    try {
        const { TalosArtifactBridge } = await import('@/lib/device/artifactPlugin')
        const titolo = file.display_name.replace(/\.html?$/i, '')
        const { id } = await TalosArtifactBridge.create({ title: titolo, html })
        const { opened } = await TalosArtifactBridge.open({ id })
        if (!opened) openError.value = t('library.viewAsPageFailed', { name: file.display_name })
    } catch {
        openError.value = t('library.viewAsPageFailed', { name: file.display_name })
    }
}
// Product review 2026-07-25: Android Back inside a fullscreen preview used to
// fall through to the station-top action — it left the station entirely instead
// of closing the preview.
useTalosOverlayBack(() => {
    if (menuOpen.value) { menuOpen.value = false; return }
    if (pdfView.value) { pdfView.value = null; return }
    if (docView.value) { docView.value = null; return }
    if (lightboxUrl.value) closeLightbox()
}, () => menuOpen.value || lightboxUrl.value !== null || docView.value !== null
    || pdfView.value !== null)

function closeLightbox(): void {
    if (lightboxUrl.value && !Object.values(thumbs.value).includes(lightboxUrl.value)) URL.revokeObjectURL(lightboxUrl.value)
    lightboxUrl.value = null
    lightboxFile.value = null
}
function attachFromOverlay(file: TalosLocalVaultFile | null): void {
    if (file) void attachFile(file)
}
function deleteFromLightbox(): void {
    const file = lightboxFile.value
    closeLightbox()
    if (file) requestDelete(file)
}
function deleteFromDoc(): void {
    const file = docView.value
    docView.value = null
    if (file) requestDelete(file)
}

function formatModified(iso: string): string {
    const date = new Date(iso)
    const now = new Date()
    const day = 86_400_000
    const diff = Math.floor((now.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / day)
    if (diff <= 0) return t('library.today')
    if (diff === 1) return t('library.yesterday')
    return date.toLocaleDateString(locale.value === 'it' ? 'it-IT' : 'en-US', { month: 'long', day: 'numeric' })
}

async function addFiles(): Promise<void> {
    if (actionBusy.value) return
    menuOpen.value = false
    feedback.value = ''
    actionBusy.value = true
    try { await attachments.selectFiles() } finally { actionBusy.value = false }
}

async function attachFile(file: TalosLocalVaultFile): Promise<void> {
    if (actionBusy.value || file.status !== 'available') return
    feedback.value = ''
    actionBusy.value = true
    try {
        if (await attachments.attachExisting(file)) {
            feedback.value = t('library.attachReady', { name: file.display_name })
        }
    } finally { actionBusy.value = false }
}

async function saveFileToDevice(file: TalosLocalVaultFile): Promise<void> {
    if (savingFileId.value !== null || file.status !== 'available') return
    openError.value = null
    savingFileId.value = file.id
    try {
        const bytes = await attachments.previewBytes(file.id).catch(() => null)
        if (!bytes) {
            openError.value = t('library.deviceReadFailedNoCopy', { name: file.display_name })
            return
        }
        const { saveTalosVaultFileToDevice } = await import('@/services/saveVaultFileToDevice')
        const result = await saveTalosVaultFileToDevice({
            displayName: file.display_name,
            mediaType: file.media_type,
            bytes,
        })
        if (result.status === 'cancelled') {
            toasts.push({ message: t('library.noCopySaved', { name: file.display_name }), durationMs: 3000 })
        } else if (result.status === 'started') {
            toasts.push({ message: t('library.downloadStarted', { name: result.displayName }), durationMs: 3500 })
        } else {
            toasts.push({ message: t('library.savedToChosenLocation', { name: result.displayName }), durationMs: 4000 })
        }
    } catch {
        openError.value = t('library.externalSaveFailed', { name: file.display_name })
    } finally {
        savingFileId.value = null
    }
}

type GlobalFileContextOverride = 'automatic' | 'included' | 'excluded'

function globalFileContextOverride(fileId: string): GlobalFileContextOverride {
    if (globalLibraryPolicy.value?.excluded_file_ids.includes(fileId)) return 'excluded'
    if (globalLibraryPolicy.value?.included_file_ids.includes(fileId)) return 'included'
    return 'automatic'
}

function globalFileContextLabel(file: TalosLocalVaultFile): string {
    if (parseVaultOrigin(file.metadata) !== 'uploaded') {
        return t('library.contextExplicitToolsOnly')
    }
    const override = globalFileContextOverride(file.id)
    const label = override === 'included'
        ? t('library.contextIncluded')
        : override === 'excluded'
            ? t('library.contextExcluded')
            : t('library.contextAutomatic')
    return isTalosLibraryFileShared(file.metadata)
        ? label
        : t('library.contextPrivateWithOverride', { state: label })
}

async function setGlobalFileContext(
    file: TalosLocalVaultFile,
    next: GlobalFileContextOverride,
): Promise<void> {
    if (
        contextPolicySavingFileId.value !== null
        || parseVaultOrigin(file.metadata) !== 'uploaded'
    ) return
    const policy = globalLibraryPolicy.value
    const included = [...(policy?.included_file_ids ?? [])]
        .filter((id) => id !== file.id)
    const excluded = [...(policy?.excluded_file_ids ?? [])]
        .filter((id) => id !== file.id)
    if (next === 'included') included.push(file.id)
    if (next === 'excluded') excluded.push(file.id)
    contextPolicySavingFileId.value = file.id
    openError.value = null
    try {
        await settings.setLibraryContextPolicy({
            included_file_ids: included,
            excluded_file_ids: excluded,
        }, policy?.revision ?? 0)
    } catch {
        openError.value = t('library.contextPolicyChangeFailed', { name: file.display_name })
    } finally {
        contextPolicySavingFileId.value = null
    }
}

/**
 * Le voci parlano il vocabolario del menu CONDIVISO.
 *
 * Prima erano `tone: 'danger'` e `kind: 'checkbox'`, parole che solo il menu
 * della Libreria capiva. Adottando quello condiviso sarebbero diventate silenzio:
 * l'Elimina non sarebbe uscito rosso nell'app vera, non solo nei test. La spunta
 * ora si dichiara con `checked` (presente = voce a due stati) e il pericolo con
 * `danger`.
 */
interface GlobalLibraryAction {
    id: 'attach' | 'save' | 'delete' | 'context-include' | 'context-exclude'
    label: string
    ariaLabel: string
    icon: Component
    disabled?: boolean
    danger?: boolean
    checked?: boolean
    testId: string
}

function fileActions(file: TalosLocalVaultFile): GlobalLibraryAction[] {
    const available = file.status === 'available'
    const actions: GlobalLibraryAction[] = [
        {
            id: 'attach',
            label: t('library.attachToMessage'),
            ariaLabel: t('library.attachNamedToMessage', { name: file.display_name }),
            icon: Paperclip,
            disabled: !available || actionBusy.value || isSelected(file.id),
            testId: `talos-library-action-attach-${file.id}`,
        },
        {
            id: 'save',
            label: t('library.saveToPhone'),
            ariaLabel: t('library.saveNamedToDevice', { name: file.display_name }),
            icon: Download,
            disabled: !available || actionBusy.value || savingFileId.value !== null,
            testId: `talos-library-action-save-${file.id}`,
        },
    ]
    if (parseVaultOrigin(file.metadata) === 'uploaded') {
        const override = globalFileContextOverride(file.id)
        const contextDisabled = contextPolicySavingFileId.value !== null
        actions.push(
            {
                id: 'context-include',
                label: t('library.includeInContext'),
                ariaLabel: t('library.includeNamedInContext', { name: file.display_name }),
                icon: Check,
                disabled: contextDisabled,
                checked: override === 'included',
                testId: `talos-library-action-context-include-${file.id}`,
            },
            {
                id: 'context-exclude',
                label: t('library.excludeFromContext'),
                ariaLabel: t('library.excludeNamedFromContext', { name: file.display_name }),
                icon: X,
                disabled: contextDisabled,
                checked: override === 'excluded',
                testId: `talos-library-action-context-exclude-${file.id}`,
            },
        )
    }
    actions.push(
        {
            id: 'delete',
            label: t('library.deleteFile'),
            ariaLabel: t('library.deleteNamed', { name: file.display_name }),
            icon: Trash2,
            disabled: actionBusy.value,
            danger: true,
            testId: `talos-library-action-delete-${file.id}`,
        },
    )
    return actions
}

function onFileAction(file: TalosLocalVaultFile, action: string, checked?: boolean): void {
    if (action === 'attach') {
        void attachFile(file)
    } else if (action === 'save') {
        void saveFileToDevice(file)
    } else if (action === 'context-include') {
        void setGlobalFileContext(file, checked === false ? 'automatic' : 'included')
    } else if (action === 'context-exclude') {
        void setGlobalFileContext(file, checked === false ? 'automatic' : 'excluded')
    } else if (action === 'delete') {
        requestDelete(file)
    }
}

/**
 * Mass selection (owner 2026-07-26: "un pulsante per selezionare massivamente
 * media e chat per eliminazione"). The mode lives in a composable shared with
 * the chat list, so "N selected" means the same thing on both screens.
 */
const bulk = useTalosBulkSelection()
const bulkDeleteOpen = ref(false)
function bulkDeleteDescription(): string {
    const count = bulk.count.value
    return t(
        count === 1 ? 'library.deleteSelectedDescriptionOne' : 'library.deleteSelectedDescriptionMany',
        { count },
    )
}

const visibleIds = computed(() => filteredFiles.value.map((file) => file.id))
const renderedLinkRows = computed(() => (bulk.active.value ? [] : linkRows.value))

/**
 * Owner 2026-07-30: saved links were never grouped, because the grouping lives
 * in the file branch and links render in one of their own. A link's chat is the
 * chat of the dossier that holds it, which is the same answer the file surface
 * gives for the same page.
 */
function linkOriginChat(row: TalosSavedLinkRow): string | null {
    const file = attachments.vaultFiles.find((entry) => entry.id === row.fileId)
    return file ? originChat(file) : null
}

// Favicons captured when each link was saved, read from disk — and fetched
// here, for the links saved before capture existed. This is the screen that
// backfills them: it is about the links themselves, it is opened deliberately,
// and leaving it abandons the pass.
const { icons: sourceIcons } = useTalosSourceCardIcons(
    computed(() => renderedLinkRows.value.map((row) => row.url)),
    { backfill: true },
)

/**
 * Owner 2026-07-30: in `All`, files and links belong to the SAME section — «tutto
 * mescolato per chat». They were two branches, which is why grouping and the
 * grid reached one and not the other; one list of entries is what makes a single
 * loop possible, and a single loop is what makes it impossible to fix one and
 * forget the other again.
 *
 * The tile stays two components on purpose: a file tile carries multi-select, an
 * actions menu, a context pill and a generated badge that a link has no meaning
 * for. What is shared is the GRID and the SECTION, not the cell.
 */
type TalosLibraryEntry =
    | { kind: 'file'; key: string; at: string | null; file: TalosLocalVaultFile }
    | { kind: 'link'; key: string; at: string | null; row: TalosSavedLinkRow }

const libraryEntries = computed<TalosLibraryEntry[]>(() => {
    const entries: TalosLibraryEntry[] = filteredFiles.value.map((file) => ({
        kind: 'file',
        key: `file:${file.id}`,
        at: file.updated_at ?? file.created_at ?? null,
        file,
    }))
    // Only `All` aggregates. A type chip means the user asked for one kind.
    if (typeFilter.value !== 'all') return entries
    for (const row of renderedLinkRows.value) {
        entries.push({ kind: 'link', key: `link:${row.url}`, at: row.savedAt ?? null, row })
    }
    return entries
})

function entryChat(entry: TalosLibraryEntry): string | null {
    return entry.kind === 'file' ? originChat(entry.file) : linkOriginChat(entry.row)
}

const groupedEntries = computed(() => groupTalosLibraryByChat(
    libraryEntries.value,
    // Not grouping still goes through here, so the sort applies either way; one
    // section with an empty heading is the honest shape of "ungrouped".
    groupByChat.value ? entryChat : () => '',
    t('library.notFromChat'),
    { timeOf: (entry) => entry.at, sort: sortOrder.value },
))

const groupedLinkRows = computed(() => groupTalosLibraryByChat(
    renderedLinkRows.value,
    groupByChat.value ? linkOriginChat : () => '',
    t('library.notFromChat'),
    { timeOf: (row) => row.savedAt ?? null, sort: sortOrder.value },
))

/** A section heading shows the chat and when it was last touched (D-17). */
function sectionDateLabel(latestAt: string | null): string | null {
    return latestAt ? formatModified(latestAt) : null
}
const hasVisibleLibraryItems = computed(() => (
    (typeFilter.value !== 'links' && filteredFiles.value.length > 0)
    || renderedLinkRows.value.length > 0
))

/**
 * The selection can only ever mean what is on screen.
 *
 * SF-critic 2026-07-26: the type chips stay live during selection mode. Select
 * All (20 files), then tap "Images" — three tiles remain, the bar still reads
 * "20 selected", and Delete removed all twenty including the seventeen the user
 * could no longer see. The composable already forgets rows that disappear; it
 * just was not being told when the filter, rather than a deletion, removed them.
 */
watch(visibleIds, (ids) => {
    if (bulk.active.value) bulk.reconcile(ids)
})

/**
 * Links are addresses, not tiles, so they carry no checkbox. Leaving selection
 * mode running over them would put "3 selected" above rows that show no sign of
 * being selected, with a Delete that acts on files the user cannot see — the
 * same lie the type chips used to tell before they were reconciled.
 */
watch(typeFilter, (value) => {
    if (value === 'links' && bulk.active.value) bulk.exit()
})

function tapFile(file: TalosLocalVaultFile): void {
    // In selection mode a tap PICKS. Opening a file from here would be a
    // different action wearing the same gesture.
    if (bulk.active.value) bulk.toggle(file.id)
    else void openFile(file)
}

async function confirmBulkDelete(): Promise<void> {
    if (actionBusy.value) return
    const ids = bulk.ids.value
    actionBusy.value = true
    feedback.value = ''
    try {
        const failed = await attachments.deleteVaultFiles(ids)
        // Release the previews of everything that actually went; a revoked URL
        // for a file still on screen would show a broken tile.
        const next = { ...thumbs.value }
        for (const id of ids) {
            if (failed.includes(id)) continue
            const url = next[id]
            if (url) { URL.revokeObjectURL(url); delete next[id] }
        }
        thumbs.value = next
        const gone = ids.length - failed.length
        const why = attachments.takeDeleteFailure()
        feedback.value = failed.length
            ? t('library.partialDelete', { deleted: gone, failed: failed.length, detail: why ?? '' })
            : t(gone === 1 ? 'library.deletedOne' : 'library.deletedMany', { count: gone })
        bulkDeleteOpen.value = false
        // Whatever survived stays selected; the rest must not linger as a count
        // of rows the user can no longer see.
        bulk.reconcile(attachments.vaultFiles.map((file) => file.id))
    } finally { actionBusy.value = false }
}

function isSelected(fileId: string): boolean {
    return attachments.items.some((item) => item.vaultFileId === fileId && item.status === 'authorized')
}
function requestDelete(file: TalosLocalVaultFile): void {
    deleteTarget.value = file
    deleteOpen.value = true
}
async function confirmDelete(): Promise<void> {
    const file = deleteTarget.value
    if (!file || actionBusy.value) return
    actionBusy.value = true
    feedback.value = ''
    try {
        await attachments.deleteVaultFile(file.id)
        const url = thumbs.value[file.id]
        if (url) { URL.revokeObjectURL(url); const next = { ...thumbs.value }; delete next[file.id]; thumbs.value = next }
        feedback.value = t('library.fileDeleted', { name: file.display_name })
        deleteOpen.value = false
        deleteTarget.value = null
    } finally { actionBusy.value = false }
}

onMounted(async () => {
    await controller.init()
    await attachments.refreshVault()
})
</script>

<template>
    <TalosMobileScreen :title="t('library.title')" :eyebrow="t('library.contextVault')">
        <p
            v-if="openError"
            role="alert"
            data-testid="talos-library-open-error"
            class="mb-2 rounded-lg bg-[var(--talos-panel)] px-3 py-2 text-2xs text-[var(--talos-text)]"
        >{{ openError }}</p>
        <template #eyebrow-icon>
            <Database class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" />
        </template>

        <div class="mb-3 flex items-center justify-between gap-3">
            <p class="font-mono text-3xs text-[var(--talos-muted)]">{{ t('library.acrossEveryChat', { count: logicalLibraryItemCount }) }}</p>
            <div class="relative">
                <Button type="button" size="icon" variant="ghost" :aria-label="t('library.options')" aria-haspopup="menu" :aria-expanded="menuOpen" class="min-h-12 min-w-12 rounded-full" @click="menuOpen = !menuOpen">
                    <EllipsisVertical class="size-5" aria-hidden="true" />
                </Button>
                <div v-if="menuOpen" class="fixed inset-0 z-[59]" aria-hidden="true" @click="menuOpen = false" />
                <!-- Same motion as the chat 3-dot menu (owner 2026-07-25). -->
                <Transition
                    enter-active-class="transition duration-150 ease-out"
                    enter-from-class="opacity-0 scale-95"
                    enter-to-class="opacity-100 scale-100"
                    leave-active-class="transition duration-100 ease-in"
                    leave-from-class="opacity-100 scale-100"
                    leave-to-class="opacity-0 scale-95"
                >
                <div v-if="menuOpen" role="menu" data-testid="talos-library-menu" class="absolute right-0 top-full z-[60] mt-1 min-w-52 origin-top-right overflow-hidden rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-window-bg,var(--talos-card))] py-1 shadow-xl">
                    <button type="button" role="menuitem" class="talos-pressable flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm" @click="addFiles"><Upload class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ t('library.uploadFiles') }}</button>
                    <button type="button" role="menuitem" data-testid="talos-library-select" class="talos-pressable flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm" @click="menuOpen = false; bulk.enter()"><CheckSquare class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ t('common.select') }}</button>
                    <button type="button" role="menuitem" disabled class="talos-pressable flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm text-[var(--talos-muted)] opacity-50"><FolderPlus class="size-4" aria-hidden="true" /> {{ t('library.newFolder') }}</button>
                    <div class="my-1 border-t border-[var(--talos-border)]" />
                    <button type="button" role="menuitemradio" :aria-checked="viewMode === 'grid'" data-testid="talos-library-view-grid" class="talos-pressable flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm" @click="viewMode = 'grid'; menuOpen = false"><LayoutGrid class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ t('library.grid') }} <CheckCircle2 v-if="viewMode === 'grid'" class="ml-auto size-4 text-[var(--talos-accent)]" aria-hidden="true" /></button>
                    <button type="button" role="menuitemradio" :aria-checked="viewMode === 'list'" data-testid="talos-library-view-list" class="talos-pressable flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm" @click="viewMode = 'list'; menuOpen = false"><List class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ t('library.list') }} <CheckCircle2 v-if="viewMode === 'list'" class="ml-auto size-4 text-[var(--talos-accent)]" aria-hidden="true" /></button>
                    <button type="button" role="menuitemcheckbox" :aria-checked="groupByChat" class="talos-pressable flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm" @click="groupByChat = !groupByChat; menuOpen = false"><Database class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ t('library.groupByChat') }} <CheckCircle2 v-if="groupByChat" class="ml-auto size-4 text-[var(--talos-accent)]" aria-hidden="true" /></button>
                    <!--
                        Owner 2026-07-30 asked for the date beside the chat name
                        and, in the same breath, for a way to sort by it. Both
                        answer to the same field, which is why the heading shows
                        the section's most recent item rather than its creation
                        date. Three entries: sorting by type would duplicate the
                        chips that are already on screen.
                    -->
                    <div role="separator" class="my-1 h-px bg-[var(--talos-border)]" />
                    <button
                        v-for="option in sortOptions"
                        :key="option.value"
                        type="button"
                        role="menuitemradio"
                        :aria-checked="sortOrder === option.value"
                        :data-testid="`talos-library-sort-${option.value}`"
                        class="talos-pressable flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm"
                        @click="sortOrder = option.value; menuOpen = false"
                    >
                        <ArrowDownUp class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                        {{ option.label }}
                        <CheckCircle2 v-if="sortOrder === option.value" class="ml-auto size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                    </button>
                </div>
                </Transition>
            </div>
        </div>

        <section
            data-testid="talos-library-global-policy"
            :data-mode="globalLibraryMode"
            :data-enabled="globalLibraryEnabled"
            class="mb-3 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2"
        >
            <p class="text-xs font-semibold text-[var(--talos-text)]">
                {{ t('library.globalContextMode') }}
            </p>
            <p class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">
                {{ globalLibraryModeLabel }}
            </p>
        </section>

        <!-- Selection bar: replaces the search row while the mode is on, so the
             screen has ONE meaning at a time. -->
        <div
            v-if="bulk.active.value"
            data-testid="talos-library-selection-bar"
            class="mb-3 flex items-center gap-1 rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] py-1 pl-1 pr-2"
        >
            <Button type="button" size="icon" variant="ghost" class="min-h-12 min-w-12 rounded-full" :aria-label="t('library.cancelSelection')" @click="bulk.exit()"><X class="size-4" aria-hidden="true" /></Button>
            <span class="text-sm font-medium">{{ t('library.selected', { count: bulk.count.value }) }}</span>
            <Button type="button" variant="ghost" size="sm" class="ml-auto min-h-12" @click="bulk.selectAll(visibleIds)">
                {{ bulk.allSelected(visibleIds) ? t('common.none') : t('library.all') }}
            </Button>
            <Button
                type="button"
                size="icon"
                variant="ghost"
                class="min-h-12 min-w-12 rounded-full text-[var(--talos-danger)]"
                data-testid="talos-library-bulk-delete"
                :aria-label="t('library.deleteSelectedFiles')"
                :disabled="bulk.count.value === 0 || actionBusy"
                @click="bulkDeleteOpen = true"
            ><Trash2 class="size-4" aria-hidden="true" /></Button>
        </div>

        <label v-else class="relative mb-3 block">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--talos-muted)]" aria-hidden="true" />
            <input v-model="query" type="search" inputmode="search" data-testid="talos-library-search" :placeholder="t('library.searchLibrary')" :aria-label="t('library.searchLibrary')" class="min-h-12 w-full rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]" />
        </label>

        <!-- Narrowing a list without leaving it: a radiogroup, not a row of
             independent toggles. It used to be `role="group"` plus
             `aria-pressed`, which announces "button, pressed" and never "1 of 4". -->
        <TalosThemedFilter
            class="mb-4"
            group-class="flex gap-1"
            :model-value="typeFilter"
            :options="typeFilterOptions"
            :group-label="t('library.filterByType')"
            :option-class="typeFilterOptionClass"
            @update:model-value="chooseTypeFilter"
        />

        <div v-if="attachments.vaultError.value" role="alert" class="mb-3 flex items-center gap-2 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
            <AlertTriangle class="size-4 shrink-0" aria-hidden="true" />
            <span class="min-w-0 flex-1">{{ attachments.vaultError.value }}</span>
            <Button type="button" size="icon" variant="ghost" class="min-h-12 min-w-12" :aria-label="t('library.retryLibrary')" @click="attachments.refreshVault()"><RefreshCw class="size-4" aria-hidden="true" /></Button>
        </div>

        <!--
            Owner 2026-07-30: the standalone link list that used to sit here is
            gone. It rendered BEFORE the branch chain, as a plain ungrouped list,
            which is exactly why `All` never got the grouping or the grid while
            the `Links` chip did. Links are entries in the one section loop now.
        -->
        <div v-if="attachments.vaultLoading.value && attachments.vaultFiles.length === 0" role="status" class="flex items-center gap-2 py-8 text-sm text-[var(--talos-muted)]">
            <LoaderCircle class="size-4 motion-safe:animate-spin" aria-hidden="true" /> {{ t('library.loadingLibrary') }}
        </div>
        <div v-else-if="attachments.vaultFiles.length === 0" class="rounded-md border border-dashed border-[var(--talos-border)] px-3 py-8 text-center text-sm text-[var(--talos-muted)]">
            {{ t('library.emptyLong') }}
        </div>
        <div v-else-if="!hasVisibleLibraryItems" class="rounded-md border border-dashed border-[var(--talos-border)] px-3 py-8 text-center text-sm text-[var(--talos-muted)]">
            <template v-if="query.trim()">{{ t('library.noMatchQuery', { query }) }}</template>
            <template v-else-if="typeFilter === 'links'">{{ t('library.noLinks') }}</template>
            <template v-else>{{ t('library.noType') }}</template>
        </div>

        <!-- LINKS: one row per saved result/page address, its dossier one tap away. -->
        <!--
            LINKS. Grouped by chat and switchable between grid and list, the same
            as files — owner 2026-07-30, where neither reached them because this
            branch never saw the code that does it. The grouping is genuinely
            shared (libraryGrouping.ts); the tile is not, because a file tile
            carries multi-select, an actions menu and a context pill that a link
            has no meaning for.
        -->
        <div v-else-if="typeFilter === 'links'" data-testid="talos-library-links" :aria-label="t('library.savedLinks')">
            <template v-for="section in groupedLinkRows" :key="section.title || 'all'">
                <TalosMobileLibrarySectionHeading
                    v-if="groupByChat"
                    :title="section.title"
                    :date-label="sectionDateLabel(section.latestAt)"
                />

                <div v-if="viewMode === 'grid'" class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6" role="list">
                    <TalosMobileSavedLinkTile
                        v-for="row in section.items"
                        :key="row.url"
                        :row="row"
                        :saved-at-label="formatModified(row.savedAt)"
                        :favicon-url="sourceIcons[row.url] ?? null"
                        @open-copy="openSavedCopy(row.fileId)"
                        @open-browser="openLink(row.url)"
                    />
                </div>

                <div v-else role="list" class="flex flex-col gap-2">
                    <TalosMobileSavedLinkRow
                        v-for="row in section.items"
                        :key="row.url"
                        :row="row"
                        :saved-at-label="formatModified(row.savedAt)"
                        :favicon-url="sourceIcons[row.url] ?? null"
                        browser-test-id="talos-library-link-open"
                        @open-copy="openSavedCopy(row.fileId)"
                        @open-browser="openLink(row.url)"
                    />
                </div>
            </template>
        </div>

        <!--
            One loop for both kinds. In `All` a section holds that chat's files
            AND its links (owner 2026-07-30, «tutto mescolato per chat»); under a
            type chip it holds only files, because a chip means the user asked
            for one kind. The cells stay two components — a file tile carries
            multi-select, an actions menu, a context pill and a generated badge
            that a link has no meaning for — but the grid and the section around
            them are shared, which is what stops one branch being fixed and the
            other forgotten.
        -->
        <template v-else v-for="section in groupedEntries" :key="section.title || 'all'">
            <TalosMobileLibrarySectionHeading
                v-if="groupByChat"
                :title="section.title"
                :date-label="sectionDateLabel(section.latestAt)"
            />

            <!-- GRID: the tile opens; the same explicit More contract as list
                 carries attach/save/delete without hover-only behavior. -->
            <div v-if="viewMode === 'grid'" class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6" role="list" :aria-label="t('library.libraryFiles')">
                <template v-for="entry in section.items" :key="entry.key">
                    <TalosMobileLibraryFileTile
                        v-if="entry.kind === 'file'"
                        :file="entry.file"
                        :thumbnail-url="thumbs[entry.file.id] ?? null"
                        :is-image="isImage(entry.file)"
                        :selecting="bulk.active.value"
                        :selected="bulk.isSelected(entry.file.id)"
                        :generated="parseVaultOrigin(entry.file.metadata) === 'generated'"
                        :context-label="globalFileContextLabel(entry.file)"
                        :actions-label="t('library.fileActionsFor', { name: entry.file.display_name })"
                        :actions="fileActions(entry.file)"
                        :tap-label="t(bulk.active.value ? 'library.selectNamed' : 'library.openNamed', { name: entry.file.display_name })"
                        @tap="tapFile(entry.file)"
                        @action="(action, checked) => onFileAction(entry.file, action, checked)"
                    />
                    <TalosMobileSavedLinkTile
                        v-else
                        :row="entry.row"
                        :saved-at-label="formatModified(entry.row.savedAt)"
                        :favicon-url="sourceIcons[entry.row.url] ?? null"
                        @open-copy="openSavedCopy(entry.row.fileId)"
                        @open-browser="openLink(entry.row.url)"
                    />
                </template>
            </div>

            <!-- LIST -->
            <div v-else class="space-y-1" role="list" :aria-label="t('library.libraryFiles')">
                <template v-for="entry in section.items" :key="entry.key">
                    <TalosMobileSavedLinkRow
                        v-if="entry.kind === 'link'"
                        :row="entry.row"
                        :saved-at-label="formatModified(entry.row.savedAt)"
                        :favicon-url="sourceIcons[entry.row.url] ?? null"
                        browser-test-id="talos-library-link-open"
                        @open-copy="openSavedCopy(entry.row.fileId)"
                        @open-browser="openLink(entry.row.url)"
                    />
                    <TalosMobileLibraryFileRow
                        v-else
                        :data-vault-file-id="entry.file.id"
                        :file="entry.file"
                        :thumbnail-url="thumbs[entry.file.id] ?? null"
                        :selection-mode="bulk.active.value"
                        :selected="bulk.isSelected(entry.file.id)"
                        :open-label="t(bulk.active.value ? 'library.selectNamed' : 'library.openNamed', { name: entry.file.display_name })"
                        @open="tapFile(entry.file)"
                >
                    <template #meta>
                            <span v-if="parseVaultOrigin(entry.file.metadata) === 'generated'" class="text-[var(--talos-accent)]">{{ t('library.generated') }}</span>
                            <span v-else>{{ t('library.modified', { date: formatModified(entry.file.updated_at) }) }}</span>
                            <span v-if="!groupByChat && originChat(entry.file)" class="truncate">· {{ originChat(entry.file) }}</span>
                    </template>
                    <template #details>
                        <span
                            :data-testid="`talos-library-context-state-${entry.file.id}`"
                            class="mt-0.5 block text-2xs leading-4 text-[var(--talos-muted)]"
                        >
                            {{ t('library.contextState', { state: globalFileContextLabel(entry.file) }) }}
                        </span>
                    </template>
                    <template #actions>
                        <TalosRowActions
                            v-if="!bulk.active.value"
                            :label="t('library.fileActionsFor', { name: entry.file.display_name })"
                            :test-id="`talos-library-actions-${entry.file.id}`"
                            :items="fileActions(entry.file)"
                            @select="(action, checked) => onFileAction(entry.file, action, checked)"
                        />
                    </template>
                    </TalosMobileLibraryFileRow>
                </template>
            </div>
        </template>

        <p class="sr-only" role="status" aria-live="polite">{{ feedback }}</p>
    </TalosMobileScreen>

    <!-- Image lightbox -->
    <Teleport to="body">
        <!--
            One viewer, mounted here and in the chat's own library. Owner
            2026-07-30: the two used to be written separately and had different
            buttons — Attach and Delete existed here and not there. They cannot
            drift again, because there is only one of them.
        -->
        <TalosMobileImageViewer
            v-if="lightboxUrl && lightboxFile"
            :src="lightboxUrl"
            :name="lightboxFile.display_name"
            :can-attach="!isSelected(lightboxFile.id)"
            :can-save="lightboxFile.status === 'available'"
            can-delete
            :busy="actionBusy"
            :saving="savingFileId !== null"
            :save-test-id="`talos-library-save-overlay-${lightboxFile.id}`"
            :origin="lightboxOrigin"
            can-open-origin-chat
            @open-origin-chat="openOriginChat"
            @attach="attachFromOverlay(lightboxFile)"
            @save="saveFileToDevice(lightboxFile)"
            @delete="deleteFromLightbox"
            @close="closeLightbox"
        />
    </Teleport>

    <!-- Document text viewer -->
    <Teleport to="body">
        <!--
            ⛔ Il visore dei PDF: lo stesso che monta la scheda azione, mai un
            secondo. «I due component devono essere esattamente identici con gli
            stessi controlli» — owner, almeno due volte.
        -->
        <VisualizzatorePdf
            v-if="pdfView"
            :percorso="pdfView.private_uri"
            :nome="pdfView.display_name"
            @chiudi="pdfView = null"
        />

        <div v-if="docView" data-testid="talos-library-doc" role="dialog" aria-modal="true" :aria-label="docView.display_name" tabindex="-1" class="fixed inset-0 z-[95] flex flex-col bg-[var(--talos-window-bg,var(--talos-background))] pt-[max(1rem,env(safe-area-inset-top))] text-[var(--talos-text)] outline-none" @keydown.escape="docView = null">
            <header class="flex items-center gap-1 border-b border-[var(--talos-border)] px-3 pb-2">
                <FileText class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{ docView.display_name }}</span>
                <button v-if="docSourceUrl" type="button" data-testid="talos-library-doc-open-source" :aria-label="t('library.openOriginalPage')" class="talos-pressable flex size-12 items-center justify-center rounded-full" @click="openLink(docSourceUrl)"><ExternalLink class="size-5 text-[var(--talos-accent)]" aria-hidden="true" /></button>
                <!--
                    ⛔ Owner 2026-08-27 — «un pulsante vedi codice per
                    switchare»: qui è il contrario, «vedi come pagina», perché
                    aprendo il file questo schermo (il codice) è già quello che
                    resta sotto se il rendering fallisce o la persona torna
                    indietro dalla WebView isolata — il codice non ha bisogno
                    di un pulsante per mostrarsi, ce l'ha già davanti.
                -->
                <button v-if="docView.media_type === 'text/html'" type="button" data-testid="talos-library-doc-view-as-page" :aria-label="t('library.viewAsPage')" class="talos-pressable flex size-12 items-center justify-center rounded-full" @click="renderArtifactFile(docView)"><Eye class="size-5 text-[var(--talos-accent)]" aria-hidden="true" /></button>
                <button v-if="docView.status === 'available' && !isSelected(docView.id)" type="button" :aria-label="t('library.attachNamedToMessage', { name: docView.display_name })" :disabled="actionBusy" class="talos-pressable flex size-12 items-center justify-center rounded-full" @click="attachFromOverlay(docView)"><Paperclip class="size-5 text-[var(--talos-accent)]" aria-hidden="true" /></button>
                <button
                    v-if="docView.status === 'available'"
                    type="button"
                    :data-testid="`talos-library-save-overlay-${docView.id}`"
                    :aria-label="t('library.saveNamedToDevice', { name: docView.display_name })"
                    :disabled="savingFileId !== null"
                    class="talos-pressable flex size-12 items-center justify-center rounded-full text-[var(--talos-accent)] disabled:opacity-50"
                    @click="saveFileToDevice(docView)"
                ><Download class="size-5" aria-hidden="true" /></button>
                <button type="button" :aria-label="t('library.deleteNamed', { name: docView.display_name })" class="talos-pressable flex size-12 items-center justify-center rounded-full text-[var(--talos-danger)]" @click="deleteFromDoc"><Trash2 class="size-5" aria-hidden="true" /></button>
                <button type="button" :aria-label="t('common.close')" class="talos-pressable flex size-12 items-center justify-center rounded-full" @click="docView = null"><X class="size-5" aria-hidden="true" /></button>
            </header>
            <div class="min-h-0 flex-1 overflow-auto p-4">
                <TalosMobileFileOriginCard
                    v-if="docOrigin"
                    :card="docOrigin"
                    can-open-chat
                    class="mb-3"
                    @open-chat="openOriginChat"
                />
                <pre v-if="docText" class="whitespace-pre-wrap break-words font-sans text-sm leading-6">{{ docText }}</pre>
                <p v-else class="text-sm text-[var(--talos-muted)]">{{ t('library.noPreviewText') }}</p>
            </div>
        </div>
    </Teleport>

    <TalosMobileConfirmDialog
        v-if="deleteOpen"
        :title="t('library.deleteFileTitle')"
        :description="t('library.deleteFileDescription', { name: deleteTarget?.display_name ?? '' })"
        @close="actionBusy ? undefined : deleteOpen = false"
    >
        <template #footer>
            <Button type="button" variant="outline" :disabled="actionBusy" class="min-h-12" @click="deleteOpen = false">{{ t('common.cancel') }}</Button>
            <Button type="button" :disabled="actionBusy" class="min-h-12 bg-[var(--talos-danger)] text-white" @click="confirmDelete">{{ t('library.deleteFile') }}</Button>
        </template>
    </TalosMobileConfirmDialog>

    <TalosMobileConfirmDialog
        v-if="bulkDeleteOpen"
        :title="t('library.deleteSelectedTitle')"
        :description="bulkDeleteDescription()"
        @close="actionBusy ? undefined : bulkDeleteOpen = false"
    >
        <template #footer>
            <Button type="button" variant="outline" :disabled="actionBusy" class="min-h-12" @click="bulkDeleteOpen = false">{{ t('common.cancel') }}</Button>
            <Button type="button" data-testid="talos-library-bulk-delete-confirm" :disabled="actionBusy" class="min-h-12 bg-[var(--talos-danger)] text-white" @click="confirmBulkDelete">
                <LoaderCircle v-if="actionBusy" class="size-4 motion-safe:animate-spin" aria-hidden="true" />
                {{ actionBusy ? t('chat.deleting') : t('common.delete') }}
            </Button>
        </template>
    </TalosMobileConfirmDialog>
</template>
