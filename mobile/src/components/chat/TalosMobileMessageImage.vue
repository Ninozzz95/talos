<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Image as ImageIcon, Sparkles, X } from '@lucide/vue'
import { useChatController } from '@/stores/chatController'

/**
 * An image in a message bubble, shown as an image.
 *
 * Owner 2026-07-27: "quando invio qualunque immagine, qualunque, nella chat non
 * deve apparire solo il nome ma anche la suddetta immagine nella bolla invio …
 * stessa cosa nella risposta se viene generata". Until now every attachment
 * rendered as a chip with a filename, which for a photo is the one thing it is
 * not.
 *
 * Its own component so it owns its object URL. A URL created here and revoked
 * anywhere else is either a leak or a broken image, and the message list is
 * long-lived: leaking one per photo per scroll is how a chat app runs a phone
 * out of memory.
 */
const props = defineProps<{
    fileId: string
    name: string
}>()

const controller = useChatController()
const source = ref<string | null>(null)
const failed = ref(false)
let current: string | null = null

/**
 * Cosa questa immagine dichiara di se stessa.
 *
 * Non lo indoviniamo da come e' arrivata: lo LEGGE dal file. Misurato il
 * 2026-08-04, le immagini di OpenAI portano dentro un manifesto C2PA firmato
 * che dice chi le ha fatte e che vengono da un algoritmo. Cosi' l'etichetta e'
 * vera anche per una foto che la persona ha importato da fuori, e resta muta
 * quando il file non dichiara niente — che e' il caso di ogni foto scattata
 * col telefono.
 */
const provenance = ref<string | null>(null)

function release(): void {
    if (current !== null) URL.revokeObjectURL(current)
    current = null
}

watch(() => props.fileId, async (fileId) => {
    release()
    source.value = null
    failed.value = false
    provenance.value = null
    if (!fileId) return
    try {
        /*
         * I byte una volta sola: da questi nascono sia l'immagine da mostrare
         * sia la sua dichiarazione. Chiedere il file due volte per leggerlo
         * due volte costerebbe il doppio a ogni foto che scorre.
         */
        const bytes = await controller.attachments.previewBytes(fileId)
        if (bytes === null) { failed.value = true; return }
        /*
         * Il lettore di provenienza arriva quando serve, non all'avvio.
         *
         * Sa camminare i chunk di un PNG e i segmenti di un JPEG: e' lavoro che
         * ha senso solo davanti a un'immagine vera, e la prima schermata non ne
         * ha nessuna. Il budget del pacco d'avvio e' stretto — misurato, non
         * temuto — e questa e' esattamente la roba che ci va dietro.
         */
        const { readTalosImageProvenance, talosProvenanceLabel } = await import('@/lib/images/provenance')
        const letto = readTalosImageProvenance(bytes)
        provenance.value = letto.declaresAiGenerated ? talosProvenanceLabel(letto) : null
        const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart]))
        current = url
        source.value = url
    } catch {
        // A file the vault has lost is not a reason to break the message: the
        // chip below still names what was attached.
        failed.value = true
    }
}, { immediate: true })

/**
 * Tap to see it properly.
 *
 * Owner 2026-07-27: "fai in modo di aprire le immagini inviate o ricevute in
 * una galleria o lightbox". A VIEWER, deliberately not the Library's overlay:
 * that one carries attach and delete, which are the jobs of a file manager. The
 * two look alike and mean different things, and merging them would put a delete
 * button on a photo inside a conversation.
 */
const opened = ref(false)

function open(): void {
    if (source.value) opened.value = true
}

onBeforeUnmount(release)
</script>

<template>
    <button
        v-if="source"
        type="button"
        :aria-label="$t('library.openNamed', { name })"
        class="talos-pressable max-w-full"
        @click="open"
    >
        <span class="relative inline-block max-w-full">
            <img
                :src="source"
                :alt="name"
                data-testid="talos-message-image"
                loading="lazy"
                decoding="async"
                class="max-h-56 w-auto max-w-full rounded-xl border border-current/15 object-contain"
            >
            <!-- Il marchio sta SULL'immagine, non sotto: sotto verrebbe letto
                 come una didascalia della conversazione, e questa e' una cosa
                 che l'immagine dice di se stessa. La targhetta porta il proprio
                 sfondo perche' sotto puo' esserci qualsiasi colore. -->
            <span
                v-if="provenance"
                data-testid="talos-image-provenance"
                class="pointer-events-none absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-3xs font-medium leading-4 text-white/95 backdrop-blur-[2px]"
            >
                <Sparkles class="size-2.5 shrink-0" aria-hidden="true" />
                {{ $t('chat.imageAiGenerated') }}
            </span>
        </span>
    </button>
    <!-- The honest fallback: it says an image was sent, and which one, rather
         than leaving a hole where a picture should be. -->
    <span
        v-else
        data-testid="talos-message-image-fallback"
        class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-current/25 bg-black/5 px-2 py-1 text-2xs leading-4"
    >
        <ImageIcon class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="max-w-[180px] truncate">{{ name }}</span>
        <span v-if="failed" class="shrink-0 opacity-75">{{ $t('chat.imageUnavailable') }}</span>
    </span>

    <Teleport to="body">
        <div
            v-if="opened && source"
            data-testid="talos-message-lightbox"
            role="dialog"
            aria-modal="true"
            :aria-label="name"
            tabindex="-1"
            class="fixed inset-0 z-[95] flex flex-col bg-black/90 outline-none"
            @keydown.escape="opened = false"
        >
            <div class="flex justify-end p-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-white">
                <button
                    type="button"
                    :aria-label="$t('chat.closePreview')"
                    class="talos-pressable flex size-11 items-center justify-center rounded-full bg-white/15"
                    @click="opened = false"
                >
                    <X class="size-5" aria-hidden="true" />
                </button>
            </div>
            <div class="flex min-h-0 flex-1 items-center justify-center p-4" @click="opened = false">
                <img :src="source" :alt="name" class="max-h-full max-w-full object-contain">
            </div>
            <!-- Qui il nome di CHI l'ha fatta, dove c'e' spazio e nessuna
                 etichetta accanto con cui confondersi. -->
            <p
                v-if="provenance"
                data-testid="talos-image-provenance-detail"
                class="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-white/70"
            >
                {{ $t('chat.imageAiProducer', { producer: provenance }) }}
            </p>
        </div>
    </Teleport>
</template>
