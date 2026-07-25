<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
    AlertTriangle, CheckCircle2, Database, FileText, FolderPlus, Image as ImageIcon,
    EllipsisVertical, LayoutGrid, List, LoaderCircle, Paperclip, RefreshCw, Search, Sparkles, Trash2, Upload, X,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import { useTalosOverlayBack } from '@/composables/useTalosOverlayBack'
import { parseVaultOrigin } from '@/lib/vaultLibrary'

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
const typeFilter = ref<'all' | 'images' | 'files'>('all')
const groupByChat = ref(true) // owner 2026-07-25: grouped by origin chat by default
const query = ref('')
const menuOpen = ref(false)
const TYPE_TABS: Array<{ value: typeof typeFilter.value; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'images', label: 'Images' },
    { value: 'files', label: 'Files' },
]

function isImage(file: TalosLocalVaultFile): boolean {
    return file.media_type.startsWith('image/')
}

const filtered = computed(() => {
    const q = query.value.trim().toLowerCase()
    return attachments.vaultFiles
        .filter((file) => {
            if (typeFilter.value === 'all') return true
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

// Thumbnails: an object URL per image file, loaded lazily and revoked on unmount.
const thumbs = ref<Record<string, string>>({})
const loadingThumbs = new Set<string>()
watch(filtered, async (files) => {
    for (const file of files) {
        if (!isImage(file) || file.status !== 'available' || thumbs.value[file.id] || loadingThumbs.has(file.id)) continue
        loadingThumbs.add(file.id) // guard: overlapping runs (rapid search) must not double-load + leak
        const url = await attachments.previewUrl(file.id)
        loadingThumbs.delete(file.id)
        if (!url) continue
        if (thumbs.value[file.id]) { URL.revokeObjectURL(url); continue } // lost the race — free the loser
        thumbs.value = { ...thumbs.value, [file.id]: url }
    }
}, { immediate: true })
onBeforeUnmount(() => {
    for (const url of Object.values(thumbs.value)) URL.revokeObjectURL(url)
    closeLightbox()
})

// Open: images in a lightbox, documents in a text viewer (both in-app).
const lightboxFile = ref<TalosLocalVaultFile | null>(null)
const lightboxUrl = ref<string | null>(null)
const docView = ref<TalosLocalVaultFile | null>(null)
// Perf review 2026-07-25: the list now holds bounded previews, so the viewer
// hydrates the full extracted text on open.
const docText = ref<string | null>(null)
async function openFile(file: TalosLocalVaultFile): Promise<void> {
    if (file.status !== 'available') return
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
        <template #eyebrow-icon>
            <Database class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" />
        </template>

        <div class="mb-3 flex items-center justify-between gap-3">
            <p class="font-mono text-[10px] text-[var(--talos-muted)]">{{ attachments.vaultFiles.length }} across every chat</p>
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
                    <button type="button" role="menuitem" disabled class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-[var(--talos-muted)] opacity-50"><FolderPlus class="size-4" aria-hidden="true" /> New folder</button>
                    <div class="my-1 border-t border-[var(--talos-border)]" />
                    <button type="button" role="menuitemradio" :aria-checked="viewMode === 'grid'" data-testid="talos-library-view-grid" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm" @click="viewMode = 'grid'; menuOpen = false"><LayoutGrid class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Grid <CheckCircle2 v-if="viewMode === 'grid'" class="ml-auto size-4 text-[var(--talos-accent)]" aria-hidden="true" /></button>
                    <button type="button" role="menuitemradio" :aria-checked="viewMode === 'list'" data-testid="talos-library-view-list" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm" @click="viewMode = 'list'; menuOpen = false"><List class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> List <CheckCircle2 v-if="viewMode === 'list'" class="ml-auto size-4 text-[var(--talos-accent)]" aria-hidden="true" /></button>
                    <button type="button" role="menuitemcheckbox" :aria-checked="groupByChat" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm" @click="groupByChat = !groupByChat; menuOpen = false"><Database class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Group by chat <CheckCircle2 v-if="groupByChat" class="ml-auto size-4 text-[var(--talos-accent)]" aria-hidden="true" /></button>
                </div>
                </Transition>
            </div>
        </div>

        <label class="relative mb-3 block">
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
        <div v-else-if="filtered.length === 0" class="rounded-md border border-dashed border-[var(--talos-border)] px-3 py-8 text-center text-sm text-[var(--talos-muted)]">
            {{ query.trim() ? `No files match “${query}”.` : 'No files of this type yet.' }}
        </div>

        <!-- Grouped-by-chat wraps whichever view is active. -->
        <template v-else v-for="section in (groupByChat ? grouped : [{ title: '', files: filtered }])" :key="section.title || 'all'">
            <h2 v-if="groupByChat" class="mb-2 mt-4 truncate text-xs font-semibold text-[var(--talos-muted)]">{{ section.title }}</h2>

            <!-- GRID (tap a tile to open; attach/delete live in the open view or
                 the list — a hover-only control is invisible/untappable on touch). -->
            <div v-if="viewMode === 'grid'" class="grid grid-cols-2 gap-3" role="list" aria-label="Library files">
                <div v-for="file in section.files" :key="file.id" role="listitem" :data-vault-file-id="file.id" class="relative aspect-square overflow-hidden rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]">
                    <button type="button" class="talos-pressable absolute inset-0 flex flex-col text-left" :aria-label="'Open ' + file.display_name" @click="openFile(file)">
                        <img v-if="isImage(file) && thumbs[file.id]" :src="thumbs[file.id]" :alt="file.display_name" class="absolute inset-0 h-full w-full object-cover" />
                        <template v-else>
                            <span class="line-clamp-3 px-3 pt-3 text-sm font-medium text-[var(--talos-text)]">{{ file.display_name }}</span>
                            <span class="mt-auto p-3">
                                <ImageIcon v-if="isImage(file)" class="size-7 text-[var(--talos-accent)]" aria-hidden="true" />
                                <FileText v-else class="size-7 text-[var(--talos-accent)]" aria-hidden="true" />
                            </span>
                        </template>
                    </button>
                    <span v-if="parseVaultOrigin(file.metadata) === 'generated'" class="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white"><Sparkles class="size-3" aria-hidden="true" /> Gen</span>
                </div>
            </div>

            <!-- LIST -->
            <div v-else class="space-y-1" role="list" aria-label="Library files">
                <div v-for="file in section.files" :key="file.id" :data-vault-file-id="file.id" role="listitem" class="flex min-w-0 items-center gap-3 rounded-xl px-1 py-2">
                    <button type="button" class="talos-pressable flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]" :aria-label="'Open ' + file.display_name" @click="openFile(file)">
                        <img v-if="isImage(file) && thumbs[file.id]" :src="thumbs[file.id]" :alt="file.display_name" class="h-full w-full object-cover" />
                        <ImageIcon v-else-if="isImage(file)" class="size-5 text-[var(--talos-accent)]" aria-hidden="true" />
                        <FileText v-else class="size-5 text-[var(--talos-accent)]" aria-hidden="true" />
                    </button>
                    <button type="button" class="min-w-0 flex-1 text-left" @click="openFile(file)">
                        <span class="line-clamp-2 text-sm font-medium text-[var(--talos-text)]">{{ file.display_name }}</span>
                        <span class="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--talos-muted)]">
                            <span v-if="parseVaultOrigin(file.metadata) === 'generated'" class="text-[var(--talos-accent)]">Generated</span>
                            <span v-else> Modified {{ formatModified(file.updated_at) }}</span>
                            <span v-if="!groupByChat && originChat(file)" class="truncate">· {{ originChat(file) }}</span>
                        </span>
                    </button>
                    <Button v-if="file.status === 'available'" type="button" size="icon" variant="ghost" class="min-h-11 min-w-11" :aria-label="'Attach ' + file.display_name + ' to message'" :disabled="actionBusy || isSelected(file.id)" @click="attachFile(file)"><Paperclip class="size-4" aria-hidden="true" /></Button>
                    <Button type="button" size="icon" variant="ghost" class="min-h-11 min-w-11 text-[var(--talos-danger)]" :aria-label="'Delete ' + file.display_name" :disabled="actionBusy" @click="requestDelete(file)"><Trash2 class="size-4" aria-hidden="true" /></Button>
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
</template>
