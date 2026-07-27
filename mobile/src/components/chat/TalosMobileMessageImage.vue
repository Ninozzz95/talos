<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Image as ImageIcon } from '@lucide/vue'
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

function release(): void {
    if (current !== null) URL.revokeObjectURL(current)
    current = null
}

watch(() => props.fileId, async (fileId) => {
    release()
    source.value = null
    failed.value = false
    if (!fileId) return
    try {
        const url = await controller.attachments.previewUrl(fileId)
        if (url === null) { failed.value = true; return }
        current = url
        source.value = url
    } catch {
        // A file the vault has lost is not a reason to break the message: the
        // chip below still names what was attached.
        failed.value = true
    }
}, { immediate: true })

onBeforeUnmount(release)
</script>

<template>
    <img
        v-if="source"
        :src="source"
        :alt="name"
        data-testid="talos-message-image"
        loading="lazy"
        decoding="async"
        class="max-h-56 w-auto max-w-full rounded-xl border border-current/15 object-contain"
    >
    <!-- The honest fallback: it says an image was sent, and which one, rather
         than leaving a hole where a picture should be. -->
    <span
        v-else
        data-testid="talos-message-image-fallback"
        class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-current/25 bg-black/5 px-2 py-1 text-2xs leading-4"
    >
        <ImageIcon class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="max-w-[180px] truncate">{{ name }}</span>
        <span v-if="failed" class="shrink-0 opacity-75">not available</span>
    </span>
</template>
