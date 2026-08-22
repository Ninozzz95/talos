<script setup lang="ts">
import type { Component } from 'vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Check, Download, Eye, Globe2, LockKeyhole, Sparkles, Upload, X } from '@lucide/vue'
import TalosRowActions from '@/components/talos/ui/TalosRowActions.vue'
import TalosMobileLibraryFileRow from '@/components/talos/library/TalosMobileLibraryFileRow.vue'
import TalosMobileSavedLinkRow from '@/components/talos/library/TalosMobileSavedLinkRow.vue'
import TalosMobileImageViewer from '@/components/talos/library/TalosMobileImageViewer.vue'
import TalosMobileMessageContent from '@/components/chat/TalosMobileMessageContent.vue'
import { useTalosFileOrigin } from '@/composables/useTalosFileOrigin'
import { talosDaIntitolare } from '@/stores/chat'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import { Button } from '@/components/ui/button'
import { useTalosSourceCardIcons } from '@/composables/useTalosSourceCardIcons'
import TalosThemedSelect, { type TalosThemedSelectItem } from '@/components/talos/ui/TalosThemedSelect.vue'
import TalosThemedFilter from '@/components/talos/ui/TalosThemedFilter.vue'
import { useTalosModalSurface } from '@/composables/useTalosModalSurface'
import { useTalosOverlayBack } from '@/composables/useTalosOverlayBack'
import { useTalosVaultThumbnails } from '@/composables/useTalosVaultThumbnails'
import {
    filterLibraryFiles,
    isTalosLibraryFileShared,
    matchesTalosLibrarySurfaceTab,
    parseVaultOrigin,
    parseVaultOriginSession,
    talosLibraryFileType,
    talosSavedLinkRows,
    type TalosLibrarySurfaceTab,
} from '@/lib/vaultLibrary'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'
import { talosNeedsExternalOpen } from '@/lib/documents/openable'
import { useTalosMobileToasts } from '@/stores/toasts'
import {
    resolveTalosLibraryContextPolicy,
    TALOS_LIBRARY_CONTEXT_MODES,
    type TalosLibraryContextMode,
    type TalosLibraryContextPolicyV1,
    type TalosSessionLibraryContextPolicyPatch,
    type TalosSessionLibraryContextPolicyV1,
} from '@/lib/chat/libraryPolicy'

/**
 * The media of ONE chat — owner's idea, 2026-07-26:
 *
 *   "cliccare header ... va in una schermata tipo WhatsApp che mostra tutti i
 *    media di quella chat ... che fa capire che sia relativo a quella chat"
 *
 * Messaging apps have had this for a decade; no AI chat app does — ChatGPT,
 * Claude, Gemini and Perplexity all make you scroll the thread to find a file
 * you sent last week. The research pass on WhatsApp's version says its known
 * weakness is that it is a flat chronological dump with no organisation.
 *
 * The TALOS one-up follows from something only TALOS has: these documents are
 * also WHAT THE MODEL OF THIS CHAT CAN READ. So the gallery is not an archive,
 * it is the chat's context panel — each tile states where the document came
 * from, and carries the switch that puts it in or out of the model's reach.
 * That switch (`metadata.library_shared`) has been honoured by the injection
 * path and by the tool suite since it was written, and was reachable from
 * nowhere: debt S7, closed here.
 *
 * "This chat's media" is the UNION of two questions, because either alone lies:
 * files whose ORIGIN is this chat (uploaded here, or generated here — generated
 * documents are never message attachments, so an attachment query would hide
 * everything TALOS itself produced), and files ATTACHED here (which may have
 * been picked out of the global Library and carry another chat's origin).
 */
const props = defineProps<{
    sessionId: string
    sessionTitle: string
    files: readonly TalosLocalVaultFile[]
    /** Vault ids attached anywhere in this chat; see the union above. */
    attachedFileIds: readonly string[]
    /** False when the global "let chats use your Library" switch is off. */
    libraryContextEnabled: boolean
    globalLibraryContextPolicy: TalosLibraryContextPolicyV1 | null
    sessionLibraryContextPolicy: TalosSessionLibraryContextPolicyV1 | null
    previewUrl: (fileId: string) => Promise<string | null>
    /** Full extracted text for ONE document, hydrated when it is opened. */
    readText: (fileId: string) => Promise<string | null>
    /** Raw bytes, for handing a binary file to another app. */
    readBytes: (fileId: string) => Promise<Uint8Array | null>
    setShared: (fileId: string, shared: boolean) => Promise<void>
    /**
     * Owner 2026-07-30: opening a picture here used to offer fewer buttons than
     * opening the same picture in the Library. The viewer is shared now, so the
     * panel needs the two capabilities it was missing rather than two buttons
     * that do nothing.
     */
    attachFile: (file: TalosLocalVaultFile) => Promise<boolean>
    deleteFile: (fileId: string) => Promise<void>
    setSessionLibraryContextPolicy: (
        sessionId: string,
        patch: TalosSessionLibraryContextPolicyPatch,
        expectedRevision: number,
    ) => Promise<unknown>
}>()

const emit = defineEmits<{ close: []; open: [file: TalosLocalVaultFile] }>()

const root = ref<HTMLElement | null>(null)
const entered = ref(false)
const failure = ref<string | null>(null)
const savingFileId = ref<string | null>(null)
// Owner 2026-07-30: the same four controls as the Library, which means the two
// capabilities this panel never had. Delete asks first, with the same dialog
// the Library uses — a destructive button that skips the question here and asks
// there would be a second kind of divergence.
const attachBusy = ref(false)
const deleteTarget = ref<TalosLocalVaultFile | null>(null)
const deleteBusy = ref(false)
const toasts = useTalosMobileToasts()
const { t, locale } = useTalosI18n()
const tab = ref<TalosLibrarySurfaceTab>('all')

/** Appearance stays here; the radiogroup grammar belongs to the primitive. */
function mediaFilterOptionClass(selected: boolean): string {
    const base = 'talos-pressable min-h-12 min-w-12 shrink-0 rounded-full px-3 text-sm transition-colors'
    return selected
        ? `${base} bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,#000)]`
        : `${base} border border-[var(--talos-border)] text-[var(--talos-muted)]`
}

function chooseTab(value: string): void {
    const found = TABS.value.find((entry) => entry.value === value)
    if (found) tab.value = found.value
}
const contextModeSaving = ref(false)
const contextBusy = reactive(new Set<string>())
/**
 * SF-CRITICAL: this was ONE id, so tapping a second file's switch while the
 * first write was in flight dropped it silently — the control stayed where the
 * tap left it while the document underneath did not move. Per-file now.
 */
const busy = reactive(new Set<string>())

const effectiveContextPolicy = computed(() => resolveTalosLibraryContextPolicy({
    legacy_enabled: props.libraryContextEnabled,
    global_policy: props.globalLibraryContextPolicy,
    session_policy: props.sessionLibraryContextPolicy,
}))
const effectiveContextEnabled = computed(
    () => props.libraryContextEnabled && effectiveContextPolicy.value.enabled,
)
const contextPolicySource = computed(() => (
    props.sessionLibraryContextPolicy
    && (
        props.sessionLibraryContextPolicy.enabled !== null
        || props.sessionLibraryContextPolicy.mode !== null
    )
        ? 'chat'
        : 'inherited'
))
const contextModeValue = computed(() => {
    const policy = props.sessionLibraryContextPolicy
    if (!policy || (policy.enabled === null && policy.mode === null)) return 'inherit'
    if (policy.enabled === false) return 'off'
    return policy.mode ?? effectiveContextPolicy.value.mode
})
const contextModeItems = computed<TalosThemedSelectItem[]>(() => [
    { value: 'inherit', label: t('library.contextInheritGlobal') },
    { value: 'off', label: t('library.contextOffForChat') },
    { value: 'broad_compat_v1', label: t('aiDefaults.libraryModes.broad') },
    { value: 'smart_relevant_v1', label: t('aiDefaults.libraryModes.smart') },
    { value: 'ask_before_use_v1', label: t('aiDefaults.libraryModes.ask') },
    { value: 'agentic_on_demand_v1', label: t('aiDefaults.libraryModes.onDemand') },
])
const effectiveContextModeLabel = computed(() => {
    if (!effectiveContextEnabled.value) return t('library.contextModeOff')
    const mode = effectiveContextPolicy.value.mode
    if (mode === 'smart_relevant_v1') return t('aiDefaults.libraryModes.smart')
    if (mode === 'ask_before_use_v1') return t('aiDefaults.libraryModes.ask')
    if (mode === 'agentic_on_demand_v1') return t('aiDefaults.libraryModes.onDemand')
    return t('aiDefaults.libraryModes.broad')
})

function isLibraryMode(value: string): value is TalosLibraryContextMode {
    return (TALOS_LIBRARY_CONTEXT_MODES as readonly string[]).includes(value)
}

async function setContextMode(value: string): Promise<void> {
    if (contextModeSaving.value) return
    const patch: TalosSessionLibraryContextPolicyPatch = value === 'inherit'
        ? { enabled: null, mode: null }
        : value === 'off'
            ? { enabled: false, mode: null }
            : isLibraryMode(value)
                ? { enabled: true, mode: value }
                : {}
    if (Object.keys(patch).length === 0) return
    contextModeSaving.value = true
    failure.value = null
    try {
        await props.setSessionLibraryContextPolicy(
            props.sessionId,
            patch,
            props.sessionLibraryContextPolicy?.revision ?? 0,
        )
    } catch {
        failure.value = t('library.chatContextPolicyChangeFailed')
    } finally {
        contextModeSaving.value = false
    }
}

// SF-MAJOR: `trapTab` was discarded and the section had no `tabindex="-1"`, so
// the focus call inside the composable was a no-op, the opener went inert, and
// focus fell to <body> — outside the dialog, for keyboard and TalkBack users.
const { trapTab } = useTalosModalSurface(root)
/**
 * Owner decision P-07. The same builder the Library uses: the viewer is already
 * written once so its controls cannot drift, and this is the other half — the
 * CARD cannot say one thing here and something else there.
 *
 * No "open the chat it came from" on this surface: you are already in a chat,
 * and a link that sometimes points at the chat you are looking at is worse than
 * no link at all.
 */
const { cardFor } = useTalosFileOrigin()
/** Computed, so an open viewer does not rebuild an Intl formatter every render. */
const openedOrigin = computed(() => cardFor(opened.value))
// Back closes the viewer first, then the gallery — one gesture per layer, the
// way the Library's own lightbox behaves.
useTalosOverlayBack(() => { if (opened.value) closeFile(); else emit('close') })
onMounted(() => { requestAnimationFrame(() => { entered.value = true }) })

const mine = computed(() => filterLibraryFiles(props.files, {
    query: '',
    origin: 'all',
    sessionId: props.sessionId,
    alsoFileIds: props.attachedFileIds,
    // SF-MAJOR: both flag consumers filter on `status === 'available'` first, so
    // a failed or still-analysing upload rendered a tile with a checked
    // "readable" switch that governed nothing.
}).filter((file) => file.status === 'available'))

// Owner 2026-07-26: research sources keep their encrypted dossiers but live in
// Links rather than burying the files the user actually made. This matcher is
// shared with the global Library so the two surfaces cannot drift again.
const visible = computed(() => mine.value.filter(
    (file) => matchesTalosLibrarySurfaceTab(file, tab.value),
))

const sourceLinkRows = computed(() => talosSavedLinkRows(mine.value))

// Read-only, like the sources chip and unlike the Library: this panel belongs to
// a chat, and opening a chat must not reach out to the sites it cited. The cards
// the Library backfills show up here for free.
const { icons: sourceIcons } = useTalosSourceCardIcons(
    computed(() => sourceLinkRows.value.map((row) => row.url)),
)

const { thumbs } = useTalosVaultThumbnails(visible, props.previewUrl)

const imageCount = computed(() => mine.value.filter(
    (file) => talosLibraryFileType(file) === 'image',
).length)

/** Where this document came from, in the user's terms rather than the schema's. */
function provenance(file: TalosLocalVaultFile): string {
    const generated = parseVaultOrigin(file.metadata) === 'generated'
    const bornHere = parseVaultOriginSession(file.metadata) === props.sessionId
    if (generated) return t(bornHere ? 'library.madeHere' : 'library.madeElsewhere')
    return t(bornHere ? 'library.uploadedHere' : 'library.fromLibrary')
}

function shared(file: TalosLocalVaultFile): boolean {
    return isTalosLibraryFileShared(file.metadata)
}

type ChatFileContextOverride = 'inherited' | 'included' | 'excluded'

function chatFileContextOverride(fileId: string): ChatFileContextOverride {
    if (props.sessionLibraryContextPolicy?.excluded_file_ids.includes(fileId)) return 'excluded'
    if (props.sessionLibraryContextPolicy?.included_file_ids.includes(fileId)) return 'included'
    return 'inherited'
}

function globalFileContextLabel(fileId: string): string {
    if (props.globalLibraryContextPolicy?.excluded_file_ids.includes(fileId)) {
        return t('library.contextExcluded')
    }
    if (props.globalLibraryContextPolicy?.included_file_ids.includes(fileId)) {
        return t('library.contextIncluded')
    }
    return t('library.contextAutomatic')
}

function chatFileContextLabel(file: TalosLocalVaultFile): string {
    if (parseVaultOrigin(file.metadata) !== 'uploaded') {
        return t('library.contextExplicitToolsOnly')
    }
    const override = chatFileContextOverride(file.id)
    const label = override === 'included'
        ? t('library.contextIncludedInChat')
        : override === 'excluded'
            ? t('library.contextExcludedInChat')
            : t('library.contextInheritedState', { state: globalFileContextLabel(file.id) })
    return shared(file)
        ? label
        : t('library.contextUnavailableWhilePrivate', { state: label })
}

async function setChatFileContext(
    file: TalosLocalVaultFile,
    next: ChatFileContextOverride,
): Promise<void> {
    if (contextBusy.has(file.id) || parseVaultOrigin(file.metadata) !== 'uploaded') return
    const policy = props.sessionLibraryContextPolicy
    const included = [...(policy?.included_file_ids ?? [])].filter((id) => id !== file.id)
    const excluded = [...(policy?.excluded_file_ids ?? [])].filter((id) => id !== file.id)
    if (next === 'included') included.push(file.id)
    if (next === 'excluded') excluded.push(file.id)
    contextBusy.add(file.id)
    failure.value = null
    try {
        await props.setSessionLibraryContextPolicy(props.sessionId, {
            included_file_ids: included,
            excluded_file_ids: excluded,
        }, policy?.revision ?? 0)
    } catch {
        failure.value = t('library.contextPolicyChangeFailed', { name: file.display_name })
    } finally {
        contextBusy.delete(file.id)
    }
}

function formatSavedAt(iso: string): string {
    const date = new Date(iso)
    const now = new Date()
    const day = 86_400_000
    const diff = Math.floor(
        (now.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / day,
    )
    if (diff <= 0) return t('library.today')
    if (diff === 1) return t('library.yesterday')
    return date.toLocaleDateString(locale.value, { month: 'long', day: 'numeric' })
}

async function toggleShared(file: TalosLocalVaultFile, desired: boolean): Promise<void> {
    // The menu item is controlled by stored metadata. A refused write therefore
    // has no optimistic DOM state to repair: reopening always shows truth.
    if (busy.has(file.id) || desired === shared(file)) return
    busy.add(file.id)
    failure.value = null
    try {
        await props.setShared(file.id, desired)
    } catch {
        failure.value = t('library.shareChangeFailed', { name: file.display_name })
    } finally {
        busy.delete(file.id)
    }
}

async function saveFileToDevice(file: TalosLocalVaultFile): Promise<void> {
    if (savingFileId.value !== null || file.status !== 'available') return
    failure.value = null
    savingFileId.value = file.id
    try {
        const bytes = await props.readBytes(file.id).catch(() => null)
        if (!bytes) {
            failure.value = t('library.deviceReadFailedNoCopy', { name: file.display_name })
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
        failure.value = t('library.externalSaveFailed', { name: file.display_name })
    } finally {
        savingFileId.value = null
    }
}

interface ChatMediaAction {
    id: 'open' | 'save' | 'share' | 'context-include' | 'context-exclude'
    label: string
    ariaLabel: string
    icon: Component
    disabled?: boolean
    kind?: 'checkbox'
    checked?: boolean
    testId: string
}

function fileActions(file: TalosLocalVaultFile): ChatMediaAction[] {
    const actions: ChatMediaAction[] = [
        {
            id: 'open',
            label: t('library.openFile'),
            ariaLabel: t('library.openNamed', { name: file.display_name }),
            icon: Eye,
            testId: `talos-chat-media-action-open-${file.id}`,
        },
        {
            id: 'save',
            label: t('library.saveToPhone'),
            ariaLabel: t('library.saveNamedToDevice', { name: file.display_name }),
            icon: Download,
            disabled: savingFileId.value !== null,
            testId: `talos-chat-media-action-save-${file.id}`,
        },
    ]
    actions.push({
        id: 'share',
        label: t('library.anyChatMayRead'),
        ariaLabel: t('library.letModelRead', { name: file.display_name }),
        icon: Globe2,
        disabled: busy.has(file.id),
        kind: 'checkbox',
        checked: shared(file),
        testId: `talos-chat-media-action-share-${file.id}`,
    })
    if (parseVaultOrigin(file.metadata) === 'uploaded') {
        const override = chatFileContextOverride(file.id)
        actions.push(
            {
                id: 'context-include',
                label: t('library.includeInThisChatContext'),
                ariaLabel: t('library.includeNamedInThisChatContext', { name: file.display_name }),
                icon: Check,
                disabled: contextBusy.has(file.id),
                kind: 'checkbox',
                checked: override === 'included',
                testId: `talos-chat-media-action-context-include-${file.id}`,
            },
            {
                id: 'context-exclude',
                label: t('library.excludeFromThisChatContext'),
                ariaLabel: t('library.excludeNamedFromThisChatContext', { name: file.display_name }),
                icon: X,
                disabled: contextBusy.has(file.id),
                kind: 'checkbox',
                checked: override === 'excluded',
                testId: `talos-chat-media-action-context-exclude-${file.id}`,
            },
        )
    }
    return actions
}

function onFileAction(file: TalosLocalVaultFile, action: string, checked?: boolean): void {
    if (action === 'open') {
        void openFile(file)
    } else if (action === 'save') {
        void saveFileToDevice(file)
    } else if (action === 'share' && typeof checked === 'boolean') {
        void toggleShared(file, checked)
    } else if (action === 'context-include') {
        void setChatFileContext(file, checked === false ? 'inherited' : 'included')
    } else if (action === 'context-exclude') {
        void setChatFileContext(file, checked === false ? 'inherited' : 'excluded')
    }
}

async function openLink(url: string): Promise<void> {
    failure.value = null
    const { openTalosLinkOnce } = await import('@/services/inAppBrowserService')
    if (!await openTalosLinkOnce(url, 'system_browser')) {
        failure.value = t('library.linkOpenFailed', { url })
    }
}

// ---- The viewer. A gallery whose tiles say "Open" and open nothing is worse
// than one with no tiles: the tap dismissed the whole panel and showed nothing.
const opened = ref<TalosLocalVaultFile | null>(null)
const openedUrl = ref<string | null>(null)
const openedText = ref<string | null>(null)
const openingFailed = ref(false)

async function openFile(file: TalosLocalVaultFile): Promise<void> {
    // An Office file or a PDF has nothing to show in a text viewer; hand it to
    // the app that owns that format rather than previewing it wrongly.
    if (talosNeedsExternalOpen(file.media_type)) {
        const { openTalosVaultFileExternally } = await import('@/services/openVaultFile')
        failure.value = null
        const bytes = await props.readBytes(file.id).catch(() => null)
        if (!bytes) {
            failure.value = t('library.deviceReadFailed', { name: file.display_name })
            return
        }
        try {
            await openTalosVaultFileExternally({
                displayName: file.display_name,
                mediaType: file.media_type,
                bytes,
            })
        } catch {
            failure.value = t('library.noOpenApp', { name: file.display_name })
        }
        return
    }
    opened.value = file
    openedUrl.value = null
    openedText.value = null
    openingFailed.value = false
    if (file.media_type.startsWith('image/')) {
        // A fresh URL: the grid thumbnail's is owned by the thumbnail cache and
        // revoking it here would blank the tile behind the viewer.
        const url = await props.previewUrl(file.id).catch(() => null)
        if (opened.value?.id !== file.id) {
            if (url) URL.revokeObjectURL(url)
            return
        }
        if (!url) { openingFailed.value = true; return }
        openedUrl.value = url
        return
    }
    const text = await props.readText(file.id).catch(() => null)
    if (opened.value?.id !== file.id) return
    if (text === null) { openingFailed.value = true; return }
    openedText.value = text
}

function openSavedCopy(fileId: string): void {
    const file = mine.value.find((entry) => entry.id === fileId)
    if (file) void openFile(file)
}

function closeFile(): void {
    if (openedUrl.value) URL.revokeObjectURL(openedUrl.value)
    openedUrl.value = null
    openedText.value = null
    opened.value = null
}

async function attachOpened(file: TalosLocalVaultFile): Promise<void> {
    if (attachBusy.value || file.status !== 'available') return
    attachBusy.value = true
    try {
        if (await props.attachFile(file)) {
            toasts.push({ message: t('library.attachReady', { name: file.display_name }) })
            closeFile()
        }
    } catch {
        failure.value = t('library.attachFailed', { name: file.display_name })
    } finally {
        attachBusy.value = false
    }
}

/**
 * Owner 2026-07-30: Delete did nothing here while it worked in the Library.
 *
 * The confirm dialog is z-85 and the image viewer is z-95, so the question was
 * being asked BEHIND the picture — opened, unseen, waiting for an answer that
 * could not be given. The Library never hit it because it closes its viewer
 * first, and I had kept mine open.
 *
 * So the viewer closes first here too, which is also the honest order: you are
 * being asked about a file, not about the thing you are looking at.
 */
function requestDeleteOpened(): void {
    const file = opened.value
    closeFile()
    deleteTarget.value = file
}

async function confirmDeleteOpened(): Promise<void> {
    const file = deleteTarget.value
    if (!file || deleteBusy.value) return
    deleteBusy.value = true
    try {
        await props.deleteFile(file.id)
        toasts.push({ message: t('library.fileDeleted', { name: file.display_name }) })
        deleteTarget.value = null
        closeFile()
    } catch {
        failure.value = t('library.deleteFailed', { name: file.display_name })
    } finally {
        deleteBusy.value = false
    }
}

onBeforeUnmount(closeFile)

const TABS = computed<Array<{ value: typeof tab.value; label: string; ariaLabel: string }>>(() => [
    { value: 'all', label: t('library.all'), ariaLabel: t('library.showAll') },
    { value: 'images', label: t('library.images'), ariaLabel: t('library.showImages') },
    { value: 'files', label: t('library.files'), ariaLabel: t('library.showFiles') },
    // Only offered when there is something in it: an empty tab is furniture.
    ...(sourceLinkRows.value.length > 0
        ? [{
            value: 'links' as const,
            label: t('library.linksWithCount', { count: sourceLinkRows.value.length }),
            ariaLabel: t('library.showLinks'),
        }]
        : []),
])

const mediaScope = computed(() => {
    const itemKey = mine.value.length === 1 ? 'library.itemCountOne' : 'library.itemCountMany'
    const imageKey = imageCount.value === 1 ? 'library.imageCountOne' : 'library.imageCountMany'
    return t('library.mediaScope', {
        // ⛔ Il gettone «non ancora intitolata» si traduce qui, non si salva tradotto.
        title: talosDaIntitolare(props.sessionTitle) ? t('chat.newChat') : props.sessionTitle.trim(),
        items: t(itemKey, { count: mine.value.length }),
        images: imageCount.value > 0 ? t(imageKey, { count: imageCount.value }) : '',
    })
})
</script>

<template>
    <Teleport to="body">
        <section
            ref="root"
            role="dialog"
            aria-modal="true"
            :aria-label="$t('chat.mediaIn', { title: sessionTitle || $t('chat.thisChat') })"
            data-testid="talos-chat-media-panel"
            tabindex="-1"
            class="pointer-events-auto fixed inset-0 z-[95] flex flex-col bg-[var(--talos-bg,var(--background))] transition-opacity duration-200 outline-none"
            :class="entered ? 'opacity-100' : 'opacity-0'"
            @keydown="trapTab"
            @keydown.escape="opened ? closeFile() : emit('close')"
        >
            <!-- Owner 2026-07-26: the header ran under the status bar. Same
                 inset convention the shell header and the tool sheet use. -->
            <header class="flex items-start gap-2 border-b border-[var(--talos-border)] px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
                <div class="min-w-0 flex-1">
                    <p class="talos-title truncate text-md font-semibold text-[var(--talos-text)]">{{ $t('library.mediaTitle') }}</p>
                    <!-- "che fa capire che sia relativo a quella chat": the chat's
                         name is the subtitle, not a generic "Library". -->
                    <p data-testid="talos-chat-media-scope" class="truncate text-xs text-[var(--talos-muted)]">{{ mediaScope }}</p>
                </div>
                <button
                    type="button"
                    data-testid="talos-chat-media-close"
                    :aria-label="$t('library.closeMedia')"
                    class="talos-pressable -mr-1 flex size-12 shrink-0 items-center justify-center rounded-lg text-[var(--talos-muted)]"
                    @click="emit('close')"
                >
                    <X class="size-4" aria-hidden="true" />
                </button>
            </header>

            <section
                data-testid="talos-chat-media-context-policy"
                :data-mode="effectiveContextPolicy.mode"
                :data-source="contextPolicySource"
                :data-enabled="effectiveContextEnabled"
                class="mx-3 mt-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3"
            >
                <div class="flex items-baseline justify-between gap-3">
                    <p class="text-xs font-semibold text-[var(--talos-text)]">
                        {{ $t('library.thisChatContext') }}
                    </p>
                    <span class="text-2xs text-[var(--talos-muted)]">
                        {{ $t(contextPolicySource === 'inherited' ? 'library.contextInherited' : 'library.contextChatOverride') }}
                    </span>
                </div>
                <TalosThemedSelect
                    class="mt-2"
                    :model-value="contextModeValue"
                    :items="contextModeItems"
                    :disabled="contextModeSaving"
                    :aria-label="$t('library.thisChatContextMode')"
                    @update:model-value="setContextMode"
                />
                <p class="mt-1 text-2xs leading-4 text-[var(--talos-muted)]">
                    {{ effectiveContextModeLabel }}
                </p>
            </section>

            <!-- Narrowing what is listed, without leaving the panel: a
                 radiogroup. It was `role="group"` plus `aria-pressed`, which
                 announces independent toggles rather than one choice. -->
            <TalosThemedFilter
                v-if="mine.length"
                group-class="flex gap-1 overflow-x-auto px-3 pt-2"
                :model-value="tab"
                :options="TABS"
                :group-label="$t('library.filterByType')"
                :option-class="mediaFilterOptionClass"
                @update:model-value="chooseTab"
            />

            <p
                v-if="failure"
                role="alert"
                data-testid="talos-chat-media-error"
                class="mx-3 mt-2 rounded-lg bg-[var(--talos-panel)] px-3 py-2 text-2xs text-[var(--talos-text)]"
            >{{ failure }}</p>

            <p
                v-if="!libraryContextEnabled && mine.length"
                data-testid="talos-chat-media-context-off"
                class="mx-3 mt-2 text-2xs leading-4 text-[var(--talos-muted)]"
            >
                {{ $t('library.contextDisabled') }}
            </p>

            <div class="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                <p
                    v-if="!mine.length"
                    data-testid="talos-chat-media-empty"
                    class="px-1 py-8 text-center text-xs leading-5 text-[var(--talos-muted)]"
                >
                    {{ $t('library.emptyChatTitle') }}<br>
                    {{ $t('library.emptyChatBody') }}
                </p>

                <div
                    v-else-if="tab === 'links'"
                    role="list"
                    data-testid="talos-chat-media-links"
                    class="flex flex-col gap-2"
                    :aria-label="$t('library.savedLinksInChat')"
                >
                    <TalosMobileSavedLinkRow
                        v-for="row in sourceLinkRows"
                        :key="row.url"
                        :row="row"
                        :saved-at-label="formatSavedAt(row.savedAt)"
                        :favicon-url="sourceIcons[row.url] ?? null"
                        copy-test-id="talos-chat-media-link-copy"
                        browser-test-id="talos-chat-media-link-open"
                        @open-copy="openSavedCopy(row.fileId)"
                        @open-browser="openLink(row.url)"
                    />
                </div>

                <div v-else class="space-y-1" role="list" data-testid="talos-chat-media-grid">
                    <TalosMobileLibraryFileRow
                        v-for="file in visible"
                        :key="file.id"
                        :file="file"
                        :thumbnail-url="thumbs[file.id] ?? null"
                        :open-label="$t('library.openNamed', { name: file.display_name })"
                        :open-test-id="`talos-chat-media-open-${file.id}`"
                        @open="openFile(file)"
                    >
                        <template #meta>
                            <Sparkles v-if="parseVaultOrigin(file.metadata) === 'generated'" class="size-2.5 shrink-0 max-[639px]:hidden" aria-hidden="true" />
                            <Upload v-else class="size-2.5 shrink-0 max-[639px]:hidden" aria-hidden="true" />
                            <span class="min-w-0 truncate max-[639px]:hidden">{{ provenance(file) }}</span>
                            <span class="shrink-0 max-[639px]:hidden" aria-hidden="true">·</span>
                            <!-- Keep model-context truth visible after moving
                                 its control into More. On very narrow screens
                                 provenance yields space to this state. -->
                            <span
                                :data-testid="`talos-chat-media-access-${file.id}`"
                                class="inline-flex min-w-0 items-center gap-1 truncate font-medium"
                                :class="shared(file) ? 'text-[var(--talos-accent)]' : ''"
                            >
                                <Globe2 v-if="shared(file)" class="size-2.5 shrink-0" aria-hidden="true" />
                                <LockKeyhole v-else class="size-2.5 shrink-0" aria-hidden="true" />
                                <span class="truncate">{{ $t(shared(file) ? 'library.shared' : 'library.private') }}</span>
                            </span>
                        </template>
                        <template #details>
                            <span
                                :data-testid="`talos-chat-media-context-state-${file.id}`"
                                class="mt-0.5 block text-2xs leading-4 text-[var(--talos-muted)]"
                            >
                                {{ $t('library.contextState', { state: chatFileContextLabel(file) }) }}
                            </span>
                        </template>
                        <template #actions>
                            <TalosRowActions
                                :label="$t('library.fileActionsFor', { name: file.display_name })"
                                :test-id="`talos-chat-media-actions-${file.id}`"
                                :items="fileActions(file)"
                                @select="(action, checked) => onFileAction(file, action, checked)"
                            />
                        </template>
                    </TalosMobileLibraryFileRow>
                </div>
            </div>

            <!-- The viewer, in the same surface: images full-bleed, documents as
                 their hydrated text. The list holds bounded previews only, so
                 the full body is read here and nowhere else. -->
            <div
                v-if="opened"
                data-testid="talos-chat-media-viewer"
                class="absolute inset-0 z-10 flex flex-col bg-[var(--talos-bg,var(--background))]"
            >
                <header class="flex items-center gap-2 border-b border-[var(--talos-border)] px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
                    <p class="min-w-0 flex-1 truncate text-xs text-[var(--talos-text)]">{{ opened.display_name }}</p>
                    <button
                        type="button"
                        data-testid="talos-chat-media-viewer-save"
                        :aria-label="$t('library.saveNamedToDevice', { name: opened.display_name })"
                        :disabled="savingFileId !== null"
                        class="talos-pressable flex size-12 shrink-0 items-center justify-center rounded-lg text-[var(--talos-accent)] disabled:opacity-50"
                        @click="saveFileToDevice(opened)"
                    >
                        <Download class="size-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        data-testid="talos-chat-media-viewer-close"
                        :aria-label="$t('library.closeFile')"
                        class="talos-pressable -mr-1 flex size-12 shrink-0 items-center justify-center rounded-lg text-[var(--talos-muted)]"
                        @click="closeFile"
                    >
                        <X class="size-4" aria-hidden="true" />
                    </button>
                </header>
                <div class="min-h-0 flex-1 overflow-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <p v-if="openingFailed" class="py-8 text-center text-xs text-[var(--talos-muted)]">
                        {{ $t('library.readFileFailed') }}
                    </p>
                    <!--
                        A picture opens in the SHARED viewer, so the buttons are
                        the Library's buttons — owner 2026-07-30, who found this
                        panel offering fewer of them. Text documents keep the
                        panel's own body below; the viewer is for images.
                    -->
                    <TalosMobileImageViewer
                        v-else-if="openedUrl"
                        :src="openedUrl"
                        :name="opened.display_name"
                        test-id="talos-chat-media-image-viewer"
                        save-test-id="talos-chat-media-viewer-save"
                        :can-attach="!attachedFileIds.includes(opened.id)"
                        :can-save="opened.status === 'available'"
                        can-delete
                        :busy="attachBusy"
                        :saving="savingFileId !== null"
                        :origin="openedOrigin"
                        @attach="attachOpened(opened)"
                        @save="saveFileToDevice(opened)"
                        @delete="requestDeleteOpened"
                        @close="closeFile"
                    />
                    <!--
                        Rilievo owner 22/8: «i file MD non sono formattati» —
                        arrivavano qui come testo grezzo nel `<pre>` sotto,
                        insieme a `.txt`/`.json` che restano grezzi a ragione
                        (un JSON formattato come prosa mentirebbe sulla sua
                        forma). Stesso motore di ogni messaggio di chat: un
                        `##` è un titolo ovunque appaia in TALOS.
                    -->
                    <!--
                        ⛔ Nessun `data-testid` qui: il componente porta già
                        il proprio (`talos-mobile-message-content`) sulla
                        radice, e Vue lo preferisce a un attributo passato
                        dall'esterno con lo stesso nome — un secondo tag
                        sarebbe stato silenziosamente ignorato.
                    -->
                    <TalosMobileMessageContent
                        v-else-if="openedText !== null && opened?.media_type === 'text/markdown'"
                        :content="openedText"
                    />
                    <pre
                        v-else-if="openedText !== null"
                        class="whitespace-pre-wrap break-words text-2xs leading-5 text-[var(--talos-text)] [overflow-wrap:anywhere]"
                    >{{ openedText }}</pre>
                    <p v-else class="py-8 text-center text-xs text-[var(--talos-muted)]">{{ $t('library.opening') }}</p>
                </div>
            </div>

            <!--
                The same question the Library asks, asked here. A destructive
                button that skips it on one surface and asks on the other is a
                second kind of divergence, not a shortcut.
            -->
            <TalosMobileConfirmDialog
                v-if="deleteTarget"
                :title="$t('library.deleteFileTitle')"
                :description="$t('library.deleteFileDescription', { name: deleteTarget.display_name })"
                @close="deleteBusy ? undefined : deleteTarget = null"
            >
                <template #footer>
                    <Button type="button" variant="outline" :disabled="deleteBusy" class="min-h-12" @click="deleteTarget = null">{{ $t('common.cancel') }}</Button>
                    <Button type="button" data-testid="talos-chat-media-delete-confirm" :disabled="deleteBusy" class="min-h-12 bg-[var(--talos-danger)] text-white" @click="confirmDeleteOpened">{{ $t('library.deleteFile') }}</Button>
                </template>
            </TalosMobileConfirmDialog>
        </section>
    </Teleport>
</template>
