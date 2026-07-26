<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { FileText, Image as ImageIcon, Sparkles, Upload, X } from '@lucide/vue'
import { useTalosModalSurface } from '@/composables/useTalosModalSurface'
import { useTalosOverlayBack } from '@/composables/useTalosOverlayBack'
import { useTalosVaultThumbnails } from '@/composables/useTalosVaultThumbnails'
import {
    filterLibraryFiles,
    isTalosLibraryFileShared,
    parseVaultOrigin,
    parseVaultOriginSession,
} from '@/lib/vaultLibrary'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

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
    previewUrl: (fileId: string) => Promise<string | null>
    setShared: (fileId: string, shared: boolean) => Promise<void>
}>()

const emit = defineEmits<{ close: []; open: [file: TalosLocalVaultFile] }>()

const root = ref<HTMLElement | null>(null)
const entered = ref(false)
const busyFileId = ref<string | null>(null)
const failure = ref<string | null>(null)
const tab = ref<'all' | 'images' | 'files'>('all')

useTalosModalSurface(root)
useTalosOverlayBack(() => emit('close'))
onMounted(() => { requestAnimationFrame(() => { entered.value = true }) })

const mine = computed(() => filterLibraryFiles(props.files, {
    query: '',
    origin: 'all',
    sessionId: props.sessionId,
    alsoFileIds: props.attachedFileIds,
}))

const visible = computed(() => mine.value.filter((file) => {
    if (tab.value === 'all') return true
    const image = file.media_type.startsWith('image/')
    return tab.value === 'images' ? image : !image
}))

const { thumbs } = useTalosVaultThumbnails(visible, props.previewUrl)

const imageCount = computed(() => mine.value.filter((f) => f.media_type.startsWith('image/')).length)

/** Where this document came from, in the user's terms rather than the schema's. */
function provenance(file: TalosLocalVaultFile): string {
    const generated = parseVaultOrigin(file.metadata) === 'generated'
    const bornHere = parseVaultOriginSession(file.metadata) === props.sessionId
    if (generated) return bornHere ? 'Made by TALOS here' : 'Made by TALOS in another chat'
    return bornHere ? 'You uploaded it here' : 'From your Library'
}

function shared(file: TalosLocalVaultFile): boolean {
    return isTalosLibraryFileShared(file.metadata)
}

/**
 * Generated documents are excluded from injection unconditionally, upstream of
 * this flag. Offering a switch that changes nothing would be a lie, so the row
 * says why instead.
 */
function canShare(file: TalosLocalVaultFile): boolean {
    return parseVaultOrigin(file.metadata) === 'uploaded'
}

async function toggleShared(file: TalosLocalVaultFile): Promise<void> {
    if (busyFileId.value) return
    busyFileId.value = file.id
    failure.value = null
    try {
        await props.setShared(file.id, !shared(file))
    } catch {
        failure.value = `TALOS could not change “${file.display_name}”. The file is still where it was.`
    } finally {
        busyFileId.value = null
    }
}

const TABS: Array<{ value: typeof tab.value; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'images', label: 'Images' },
    { value: 'files', label: 'Files' },
]
</script>

<template>
    <Teleport to="body">
        <section
            ref="root"
            role="dialog"
            aria-modal="true"
            :aria-label="`Media in ${sessionTitle || 'this chat'}`"
            data-testid="talos-chat-media-panel"
            class="pointer-events-auto fixed inset-0 z-[95] flex flex-col bg-[var(--talos-bg,var(--background))] transition-opacity duration-200"
            :class="entered ? 'opacity-100' : 'opacity-0'"
        >
            <header class="flex items-start gap-2 border-b border-[var(--talos-border)] px-3 py-2.5">
                <div class="min-w-0 flex-1">
                    <p class="talos-title truncate text-sm text-[var(--talos-text)]">Media</p>
                    <!-- "che fa capire che sia relativo a quella chat": the chat's
                         name is the subtitle, not a generic "Library". -->
                    <p data-testid="talos-chat-media-scope" class="truncate text-2xs text-[var(--talos-muted)]">
                        in “{{ sessionTitle.trim() || 'New chat' }}” · {{ mine.length }}
                        {{ mine.length === 1 ? 'item' : 'items' }}<span v-if="imageCount">, {{ imageCount }} image{{ imageCount === 1 ? '' : 's' }}</span>
                    </p>
                </div>
                <button
                    type="button"
                    data-testid="talos-chat-media-close"
                    aria-label="Close media"
                    class="talos-pressable -mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--talos-muted)]"
                    @click="emit('close')"
                >
                    <X class="size-4" aria-hidden="true" />
                </button>
            </header>

            <div v-if="mine.length" class="flex gap-1 px-3 pt-2">
                <button
                    v-for="entry in TABS"
                    :key="entry.value"
                    type="button"
                    class="talos-pressable min-h-8 rounded-full px-3 text-2xs"
                    :class="tab === entry.value
                        ? 'bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,#000)]'
                        : 'text-[var(--talos-muted)]'"
                    @click="tab = entry.value"
                >{{ entry.label }}</button>
            </div>

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
                Chats cannot read your Library right now — the switch is off in
                Settings, so nothing here reaches the model whatever these say.
            </p>

            <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-2">
                <p
                    v-if="!mine.length"
                    data-testid="talos-chat-media-empty"
                    class="px-1 py-8 text-center text-xs leading-5 text-[var(--talos-muted)]"
                >
                    Nothing has been shared in this chat yet.<br>
                    Files you upload here, and documents TALOS makes for you, will collect on this screen.
                </p>

                <ul v-else class="grid grid-cols-2 gap-3" data-testid="talos-chat-media-grid">
                    <li
                        v-for="file in visible"
                        :key="file.id"
                        class="overflow-hidden rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/50"
                    >
                        <button
                            type="button"
                            class="talos-pressable block aspect-square w-full"
                            :aria-label="`Open ${file.display_name}`"
                            @click="emit('open', file)"
                        >
                            <img
                                v-if="thumbs[file.id]"
                                :src="thumbs[file.id]"
                                :alt="file.display_name"
                                class="size-full object-cover"
                            >
                            <span v-else class="flex size-full items-center justify-center text-[var(--talos-muted)]">
                                <ImageIcon v-if="file.media_type.startsWith('image/')" class="size-6" aria-hidden="true" />
                                <FileText v-else class="size-6" aria-hidden="true" />
                            </span>
                        </button>
                        <div class="px-2 pb-2 pt-1.5">
                            <p class="truncate text-2xs text-[var(--talos-text)]">{{ file.display_name }}</p>
                            <p class="mt-0.5 flex items-center gap-1 truncate text-3xs text-[var(--talos-muted)]">
                                <Sparkles v-if="parseVaultOrigin(file.metadata) === 'generated'" class="size-2.5 shrink-0" aria-hidden="true" />
                                <Upload v-else class="size-2.5 shrink-0" aria-hidden="true" />
                                {{ provenance(file) }}
                            </p>
                            <label
                                v-if="canShare(file)"
                                class="mt-1.5 flex items-center justify-between gap-2 text-3xs text-[var(--talos-muted)]"
                            >
                                <span>Readable by this chat</span>
                                <input
                                    type="checkbox"
                                    role="switch"
                                    :data-testid="`talos-chat-media-share-${file.id}`"
                                    :aria-label="`Let the model read ${file.display_name}`"
                                    :checked="shared(file)"
                                    :disabled="busyFileId === file.id"
                                    class="size-4 accent-[var(--talos-accent)]"
                                    @change="toggleShared(file)"
                                >
                            </label>
                            <p v-else class="mt-1.5 text-3xs text-[var(--talos-muted)] opacity-80">
                                TALOS never re-reads what it wrote.
                            </p>
                        </div>
                    </li>
                </ul>
            </div>
        </section>
    </Teleport>
</template>
