<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTalosBulkSelection } from '@/composables/useTalosBulkSelection'
import { useTalosVaultThumbnails } from '@/composables/useTalosVaultThumbnails'
import {
    AlertTriangle, CheckCircle2, Database, FileText, FolderPlus, Image as ImageIcon,
    EllipsisVertical, ExternalLink, Globe, LayoutGrid, List, LoaderCircle, Paperclip, RefreshCw, Search, Sparkles, Trash2, Upload, X,
    Check,
    CheckSquare,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'
import { talosNeedsExternalOpen } from '@/lib/documents/openable'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import { useTalosOverlayBack } from '@/composables/useTalosOverlayBack'
import { parseVaultKind, parseVaultOrigin, parseVaultSourceUrl, talosSavedLinkRows } from '@/lib/vaultLibrary'

const controller = useChatController()
const settings = useSettingsStore()
const attachments = controller.attachments
const actionBusy = ref(false)
const feedback = ref('')
const deleteOpen = ref(false)
const deleteTarget = ref<TalosLocalVaultFile | null>(null)

// Google/OPPO-Files-style Library: grid (default) / list, type chips, a bottom
// search, per-file thumbnails, tap-to-open, and an overflow menu.
// Remembered across visits (persisted in shell prefs).
const viewMode = computed({
    get: () => settings.state.shell.library_view,
    set: (value) => { void settings.setShell({ library_view: value }) },
})
const typeFilter = ref<'all' | 'images' | 'files' | 'links'>('all')
const groupByChat = ref(true) // owner 2026-07-25: grouped by origin chat by default
const query = ref('')
const menuOpen = ref(false)
const TYPE_TABS: Array<{ value: typeof typeFilter.value; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'images', label: 'Images' },
    { value: 'files', label: 'Files' },
    // Owner 2026-07-27: the pages a search read are kept as markdown, which is
    // right for an answer that must still be auditable in six months — but it
    // meant the ADDRESS was prose. Here they are links again.
    { value: 'links', label: 'Links' },
]

function isImage(file: TalosLocalVaultFile): boolean {
    return file.media_type.startsWith('image/')
}

const filtered = computed(() => {
    const q = query.value.trim().toLowerCase()
    return attachments.vaultFiles
        .filter((file) => {
            if (typeFilter.value === 'all') return true
            // Kind only: whether an address can be recovered is the row
            // builder's business, and deciding it in two places is how the
            // fallback for older sources ended up dead before it could run.
            if (typeFilter.value === 'links') return parseVaultKind(file.metadata) === 'web_source'
            return typeFilter.value === 'images' ? isImage(file) : !isImage(file)
        })
        .filter((file) => q === ''
            || file.display_name.toLowerCase().includes(q)
            || (file.extracted_text?.toLowerCase().includes(q) ?? false))
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
})

// Provenance: resolve the origin chat title for grouping + the per-file subtitle.
function originChat(file: TalosLocalVaultFile): string | null {
    const id = (file.metadata as { origin_session_id?: string | null }).origin_session_id ?? null
    if (!id) return null
    return controller.chat.sessions.find((session) => session.id === id)?.title ?? null
}

const grouped = computed(() => {
    const groups = new Map<string, TalosLocalVaultFile[]>()
    for (const file of filtered.value) {
        const key = originChat(file) ?? 'Not from a chat'
        ;(groups.get(key) ?? groups.set(key, []).get(key)!).push(file)
    }
    return [...groups.entries()].map(([title, files]) => ({ title, files }))
})

/**
 * The same files as one address each: a page read three times is one row, and
 * the row points at the most recent copy. Built from `filtered`, so the search
 * box and the chip mean what they say here too.
 */
const linkRows = computed(() => talosSavedLinkRows(filtered.value))

async function openLink(url: string): Promise<void> {
    openError.value = null
    const { openTalosLinkOnce } = await import('@/services/inAppBrowserService')
    // The address stays on screen either way, so a refusal is a sentence rather
    // than a tap that quietly did nothing.
    if (!await openTalosLinkOnce(url)) openError.value = `${url} could not be opened on this device.`
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
const { thumbs } = useTalosVaultThumbnails(filtered, attachments.previewUrl)
onBeforeUnmount(closeLightbox)

// Open: images in a lightbox, documents in a text viewer (both in-app).
const lightboxFile = ref<TalosLocalVaultFile | null>(null)
const lightboxUrl = ref<string | null>(null)
const docView = ref<TalosLocalVaultFile | null>(null)
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
            openError.value = `“${file.display_name}” could not be read from this device.`
            return
        }
        try {
            await openTalosVaultFileExternally({
                displayName: file.display_name,
                mediaType: file.media_type,
                bytes: preview,
            })
        } catch {
            openError.value = `No app on this phone offered to open “${file.display_name}”.`
        }
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
}
// Product review 2026-07-25: Android Back inside a fullscreen preview used to
// fall through to 'station-to-sidebar' — it ejected the user to the chat with the
// sidebar open instead of closing the preview.
useTalosOverlayBack(() => {
    if (menuOpen.value) { menuOpen.value = false; return }
    if (docView.value) { docView.value = null; return }
    if (lightboxUrl.value) closeLightbox()
}, () => menuOpen.value || lightboxUrl.value !== null || docView.value !== null)

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
    if (diff <= 0) return 'today'
    if (diff === 1) return 'yesterday'
    return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
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
        if (await attachments.attachExisting(file)) feedback.value = file.display_name + ' is ready in the composer.'
    } finally { actionBusy.value = false }
}

/**
 * Mass selection (owner 2026-07-26: "un pulsante per selezionare massivamente
 * media e chat per eliminazione"). The mode lives in a composable shared with
 * the chat list, so "N selected" means the same thing on both screens.
 */
const bulk = useTalosBulkSelection()
const bulkDeleteOpen = ref(false)

const visibleIds = computed(() => filtered.value.map((file) => file.id))

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
            ? gone + ' deleted, ' + failed.length + ' could not be removed. ' + (why ?? '')
            : gone + (gone === 1 ? ' file was deleted.' : ' files were deleted.')
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
        feedback.value = file.display_name + ' was deleted.'
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
    <TalosMobileScreen title="Library" eyebrow="Context Vault">
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
            <p class="font-mono text-3xs text-[var(--talos-muted)]">{{ attachments.vaultFiles.length }} across every chat</p>
            <div class="relative">
                <Button type="button" size="icon" variant="ghost" aria-label="Library options" aria-haspopup="menu" :aria-expanded="menuOpen" class="min-h-11 min-w-11 rounded-full" @click="menuOpen = !menuOpen">
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
                    <button type="button" role="menuitem" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm" @click="addFiles"><Upload class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Upload files</button>
                    <button type="button" role="menuitem" data-testid="talos-library-select" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm" @click="menuOpen = false; bulk.enter()"><CheckSquare class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Select</button>
                    <button type="button" role="menuitem" disabled class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-[var(--talos-muted)] opacity-50"><FolderPlus class="size-4" aria-hidden="true" /> New folder</button>
                    <div class="my-1 border-t border-[var(--talos-border)]" />
                    <button type="button" role="menuitemradio" :aria-checked="viewMode === 'grid'" data-testid="talos-library-view-grid" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm" @click="viewMode = 'grid'; menuOpen = false"><LayoutGrid class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Grid <CheckCircle2 v-if="viewMode === 'grid'" class="ml-auto size-4 text-[var(--talos-accent)]" aria-hidden="true" /></button>
                    <button type="button" role="menuitemradio" :aria-checked="viewMode === 'list'" data-testid="talos-library-view-list" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm" @click="viewMode = 'list'; menuOpen = false"><List class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> List <CheckCircle2 v-if="viewMode === 'list'" class="ml-auto size-4 text-[var(--talos-accent)]" aria-hidden="true" /></button>
                    <button type="button" role="menuitemcheckbox" :aria-checked="groupByChat" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm" @click="groupByChat = !groupByChat; menuOpen = false"><Database class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Group by chat <CheckCircle2 v-if="groupByChat" class="ml-auto size-4 text-[var(--talos-accent)]" aria-hidden="true" /></button>
                </div>
                </Transition>
            </div>
        </div>

        <!-- Selection bar: replaces the search row while the mode is on, so the
             screen has ONE meaning at a time. -->
        <div
            v-if="bulk.active.value"
            data-testid="talos-library-selection-bar"
            class="mb-3 flex items-center gap-1 rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] py-1 pl-1 pr-2"
        >
            <Button type="button" size="icon" variant="ghost" class="min-h-11 min-w-11 rounded-full" aria-label="Cancel selection" @click="bulk.exit()"><X class="size-4" aria-hidden="true" /></Button>
            <span class="text-sm font-medium">{{ bulk.count.value }} selected</span>
            <Button type="button" variant="ghost" size="sm" class="ml-auto" @click="bulk.selectAll(visibleIds)">
                {{ bulk.allSelected(visibleIds) ? 'None' : 'All' }}
            </Button>
            <Button
                type="button"
                size="icon"
                variant="ghost"
                class="min-h-11 min-w-11 rounded-full text-[var(--talos-danger)]"
                data-testid="talos-library-bulk-delete"
                aria-label="Delete selected files"
                :disabled="bulk.count.value === 0 || actionBusy"
                @click="bulkDeleteOpen = true"
            ><Trash2 class="size-4" aria-hidden="true" /></Button>
        </div>

        <label v-else class="relative mb-3 block">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--talos-muted)]" aria-hidden="true" />
            <input v-model="query" type="search" inputmode="search" data-testid="talos-library-search" placeholder="Search the Library" aria-label="Search the Library" class="min-h-11 w-full rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]" />
        </label>

        <div class="mb-4 flex gap-1" role="group" aria-label="Filter by type">
            <button v-for="tab in TYPE_TABS" :key="tab.value" type="button" :aria-pressed="typeFilter === tab.value" :data-testid="`talos-library-type-${tab.value}`" class="talos-pressable min-h-11 rounded-full px-3 text-sm transition-colors" :class="typeFilter === tab.value ? 'bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,var(--primary-foreground))]' : 'border border-[var(--talos-border)] text-[var(--talos-muted)]'" @click="typeFilter = tab.value">{{ tab.label }}</button>
        </div>

        <div v-if="attachments.vaultError.value" role="alert" class="mb-3 flex items-center gap-2 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
            <AlertTriangle class="size-4 shrink-0" aria-hidden="true" />
            <span class="min-w-0 flex-1">{{ attachments.vaultError.value }}</span>
            <Button type="button" size="icon" variant="ghost" class="min-h-11 min-w-11" aria-label="Retry Library" @click="attachments.refreshVault()"><RefreshCw class="size-4" aria-hidden="true" /></Button>
        </div>

        <div v-if="attachments.vaultLoading.value && attachments.vaultFiles.length === 0" role="status" class="flex items-center gap-2 py-8 text-sm text-[var(--talos-muted)]">
            <LoaderCircle class="size-4 motion-safe:animate-spin" aria-hidden="true" /> Loading Library
        </div>
        <div v-else-if="attachments.vaultFiles.length === 0" class="rounded-md border border-dashed border-[var(--talos-border)] px-3 py-8 text-center text-sm text-[var(--talos-muted)]">
            No files yet. Anything you upload or save from a chat lives here, ready to reuse in any conversation.
        </div>
        <div v-else-if="typeFilter === 'links' ? linkRows.length === 0 : filtered.length === 0" class="rounded-md border border-dashed border-[var(--talos-border)] px-3 py-8 text-center text-sm text-[var(--talos-muted)]">
            <template v-if="query.trim()">No files match “{{ query }}”.</template>
            <template v-else-if="typeFilter === 'links'">No links yet. Every page TALOS reads while searching is saved here, with the address you can go back to.</template>
            <template v-else>No files of this type yet.</template>
        </div>

        <!-- LINKS: one row per address, the saved transcript one tap away. -->
        <ul v-else-if="typeFilter === 'links'" data-testid="talos-library-links" class="flex flex-col gap-2" aria-label="Saved links">
            <li v-for="row in linkRows" :key="row.url" class="flex items-center gap-1 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] pr-1">
                <button
                    type="button"
                    class="talos-pressable flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 text-left"
                    :aria-label="'Open the saved copy of ' + row.title"
                    @click="openSavedCopy(row.fileId)"
                >
                    <Globe class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <span class="min-w-0 flex-1">
                        <span class="line-clamp-2 block text-sm font-medium text-[var(--talos-text)]">{{ row.title }}</span>
                        <span class="mt-0.5 flex items-center gap-1.5 text-2xs text-[var(--talos-muted)]">
                            <span class="truncate">{{ row.host }}</span>
                            <span aria-hidden="true">·</span>
                            <span class="shrink-0">{{ formatModified(row.savedAt) }}</span>
                        </span>
                    </span>
                </button>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    class="min-h-11 min-w-11 shrink-0 rounded-full"
                    data-testid="talos-library-link-open"
                    :aria-label="'Open ' + row.host + ' in the browser'"
                    @click="openLink(row.url)"
                ><ExternalLink class="size-4" aria-hidden="true" /></Button>
            </li>
        </ul>

        <!-- Grouped-by-chat wraps whichever view is active. -->
        <template v-else v-for="section in (groupByChat ? grouped : [{ title: '', files: filtered }])" :key="section.title || 'all'">
            <h2 v-if="groupByChat" class="mb-2 mt-4 truncate text-xs font-semibold text-[var(--talos-muted)]">{{ section.title }}</h2>

            <!-- GRID (tap a tile to open; attach/delete live in the open view or
                 the list — a hover-only control is invisible/untappable on touch). -->
            <div v-if="viewMode === 'grid'" class="grid grid-cols-2 gap-3" role="list" aria-label="Library files">
                <div v-for="file in section.files" :key="file.id" role="listitem" :data-vault-file-id="file.id" class="relative aspect-square overflow-hidden rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]">
                    <button type="button" class="talos-pressable absolute inset-0 flex flex-col text-left" :aria-label="(bulk.active.value ? 'Select ' : 'Open ') + file.display_name" :aria-pressed="bulk.active.value ? bulk.isSelected(file.id) : undefined" @click="tapFile(file)">
                        <img v-if="isImage(file) && thumbs[file.id]" :src="thumbs[file.id]" :alt="file.display_name" class="absolute inset-0 h-full w-full object-cover" />
                        <template v-else>
                            <span class="line-clamp-3 px-3 pt-3 text-sm font-medium text-[var(--talos-text)]">{{ file.display_name }}</span>
                            <span class="mt-auto p-3">
                                <ImageIcon v-if="isImage(file)" class="size-7 text-[var(--talos-accent)]" aria-hidden="true" />
                                <FileText v-else class="size-7 text-[var(--talos-accent)]" aria-hidden="true" />
                            </span>
                        </template>
                    </button>
                    <span v-if="bulk.active.value" class="pointer-events-none absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full border-2" :class="bulk.isSelected(file.id) ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-on-accent,#000)]' : 'border-white/80 bg-black/35'">
                        <Check v-if="bulk.isSelected(file.id)" class="size-4" aria-hidden="true" />
                    </span>
                    <span v-if="bulk.isSelected(file.id)" class="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-inset ring-[var(--talos-accent)]" aria-hidden="true" />
                    <span v-if="parseVaultOrigin(file.metadata) === 'generated'" class="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-3xs font-medium text-white"><Sparkles class="size-3" aria-hidden="true" /> Gen</span>
                </div>
            </div>

            <!-- LIST -->
            <div v-else class="space-y-1" role="list" aria-label="Library files">
                <div v-for="file in section.files" :key="file.id" :data-vault-file-id="file.id" role="listitem" class="flex min-w-0 items-center gap-3 rounded-xl px-1 py-2">
                    <span v-if="bulk.active.value" class="flex size-6 shrink-0 items-center justify-center rounded-full border-2" :class="bulk.isSelected(file.id) ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-on-accent,#000)]' : 'border-[var(--talos-border)]'" aria-hidden="true">
                        <Check v-if="bulk.isSelected(file.id)" class="size-4" />
                    </span>
                    <button type="button" class="talos-pressable flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]" :aria-label="(bulk.active.value ? 'Select ' : 'Open ') + file.display_name" @click="tapFile(file)">
                        <img v-if="isImage(file) && thumbs[file.id]" :src="thumbs[file.id]" :alt="file.display_name" class="h-full w-full object-cover" />
                        <ImageIcon v-else-if="isImage(file)" class="size-5 text-[var(--talos-accent)]" aria-hidden="true" />
                        <FileText v-else class="size-5 text-[var(--talos-accent)]" aria-hidden="true" />
                    </button>
                    <button type="button" class="min-w-0 flex-1 text-left" @click="tapFile(file)">
                        <span class="line-clamp-2 text-sm font-medium text-[var(--talos-text)]">{{ file.display_name }}</span>
                        <span class="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--talos-muted)]">
                            <span v-if="parseVaultOrigin(file.metadata) === 'generated'" class="text-[var(--talos-accent)]">Generated</span>
                            <span v-else> Modified {{ formatModified(file.updated_at) }}</span>
                            <span v-if="!groupByChat && originChat(file)" class="truncate">· {{ originChat(file) }}</span>
                        </span>
                    </button>
                    <Button v-if="!bulk.active.value && file.status === 'available'" type="button" size="icon" variant="ghost" class="min-h-11 min-w-11" :aria-label="'Attach ' + file.display_name + ' to message'" :disabled="actionBusy || isSelected(file.id)" @click="attachFile(file)"><Paperclip class="size-4" aria-hidden="true" /></Button>
                    <Button v-if="!bulk.active.value" type="button" size="icon" variant="ghost" class="min-h-11 min-w-11 text-[var(--talos-danger)]" :aria-label="'Delete ' + file.display_name" :disabled="actionBusy" @click="requestDelete(file)"><Trash2 class="size-4" aria-hidden="true" /></Button>
                </div>
            </div>
        </template>

        <p class="sr-only" role="status" aria-live="polite">{{ feedback }}</p>
    </TalosMobileScreen>

    <!-- Image lightbox -->
    <Teleport to="body">
        <div v-if="lightboxUrl" data-testid="talos-library-lightbox" role="dialog" aria-modal="true" aria-label="Image preview" tabindex="-1" class="fixed inset-0 z-[95] flex flex-col bg-black/90 outline-none" @keydown.escape="closeLightbox">
            <div class="flex items-center justify-end gap-1 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-white">
                <button v-if="lightboxFile && !isSelected(lightboxFile.id)" type="button" :aria-label="'Attach ' + lightboxFile.display_name + ' to message'" :disabled="actionBusy" class="talos-pressable flex size-11 items-center justify-center rounded-full bg-white/15" @click="attachFromOverlay(lightboxFile)"><Paperclip class="size-5" aria-hidden="true" /></button>
                <button v-if="lightboxFile" type="button" :aria-label="'Delete ' + lightboxFile.display_name" class="talos-pressable flex size-11 items-center justify-center rounded-full bg-white/15" @click="deleteFromLightbox"><Trash2 class="size-5" aria-hidden="true" /></button>
                <button type="button" aria-label="Close preview" class="talos-pressable flex size-11 items-center justify-center rounded-full bg-white/15" @click="closeLightbox"><X class="size-5" aria-hidden="true" /></button>
            </div>
            <div class="flex min-h-0 flex-1 items-center justify-center p-4" @click="closeLightbox">
                <img :src="lightboxUrl" alt="Preview" class="max-h-full max-w-full object-contain" />
            </div>
        </div>
    </Teleport>

    <!-- Document text viewer -->
    <Teleport to="body">
        <div v-if="docView" data-testid="talos-library-doc" role="dialog" aria-modal="true" :aria-label="docView.display_name" tabindex="-1" class="fixed inset-0 z-[95] flex flex-col bg-[var(--talos-window-bg,var(--talos-background))] pt-[max(1rem,env(safe-area-inset-top))] text-[var(--talos-text)] outline-none" @keydown.escape="docView = null">
            <header class="flex items-center gap-1 border-b border-[var(--talos-border)] px-3 pb-2">
                <FileText class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{ docView.display_name }}</span>
                <button v-if="docSourceUrl" type="button" data-testid="talos-library-doc-open-source" :aria-label="'Open the original page in the browser'" class="talos-pressable flex size-11 items-center justify-center rounded-full" @click="openLink(docSourceUrl)"><ExternalLink class="size-5 text-[var(--talos-accent)]" aria-hidden="true" /></button>
                <button v-if="docView.status === 'available' && !isSelected(docView.id)" type="button" :aria-label="'Attach ' + docView.display_name + ' to message'" :disabled="actionBusy" class="talos-pressable flex size-11 items-center justify-center rounded-full" @click="attachFromOverlay(docView)"><Paperclip class="size-5 text-[var(--talos-accent)]" aria-hidden="true" /></button>
                <button type="button" :aria-label="'Delete ' + docView.display_name" class="talos-pressable flex size-11 items-center justify-center rounded-full text-[var(--talos-danger)]" @click="deleteFromDoc"><Trash2 class="size-5" aria-hidden="true" /></button>
                <button type="button" aria-label="Close" class="talos-pressable flex size-11 items-center justify-center rounded-full" @click="docView = null"><X class="size-5" aria-hidden="true" /></button>
            </header>
            <div class="min-h-0 flex-1 overflow-auto p-4">
                <pre v-if="docText" class="whitespace-pre-wrap break-words font-sans text-sm leading-6">{{ docText }}</pre>
                <p v-else class="text-sm text-[var(--talos-muted)]">No preview text is available for this file.</p>
            </div>
        </div>
    </Teleport>

    <TalosMobileConfirmDialog
        v-if="deleteOpen"
        title="Delete file?"
        :description="`${deleteTarget?.display_name} will be removed from this device. Existing chat history keeps only its safe file label.`"
        @close="actionBusy ? undefined : deleteOpen = false"
    >
        <template #footer>
            <Button type="button" variant="outline" :disabled="actionBusy" @click="deleteOpen = false">Cancel</Button>
            <Button type="button" :disabled="actionBusy" class="bg-[var(--talos-danger)] text-white" @click="confirmDelete">Delete file</Button>
        </template>
    </TalosMobileConfirmDialog>

    <TalosMobileConfirmDialog
        v-if="bulkDeleteOpen"
        title="Delete selected files?"
        :description="`${bulk.count.value} file${bulk.count.value === 1 ? '' : 's'} will be removed from this device. Existing chat history keeps only their safe file labels.`"
        @close="actionBusy ? undefined : bulkDeleteOpen = false"
    >
        <template #footer>
            <Button type="button" variant="outline" :disabled="actionBusy" @click="bulkDeleteOpen = false">Cancel</Button>
            <Button type="button" data-testid="talos-library-bulk-delete-confirm" :disabled="actionBusy" class="bg-[var(--talos-danger)] text-white" @click="confirmBulkDelete">
                <LoaderCircle v-if="actionBusy" class="size-4 motion-safe:animate-spin" aria-hidden="true" />
                {{ actionBusy ? 'Deleting…' : 'Delete' }}
            </Button>
        </template>
    </TalosMobileConfirmDialog>
</template>
