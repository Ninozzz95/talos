<script setup lang="ts">
import { ImageOff, Loader2 } from '@lucide/vue'
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useTalosMediaObjectUrl } from '../../../composables/useTalosMediaObjectUrl'
import type { TalosMessageAttachment } from '../../../lib/talosMessageMetadata'

const props = defineProps<{
    attachment: TalosMessageAttachment
}>()

const emit = defineEmits<{
    open: [attachment: TalosMessageAttachment]
}>()

const media = useTalosMediaObjectUrl()

function load() {
    void media.load(props.attachment.content_url)
}

onMounted(load)
watch(() => props.attachment.content_url, load)
onBeforeUnmount(media.dispose)
</script>

<template>
    <button
        v-if="media.objectUrl.value"
        type="button"
        data-testid="talos-message-image"
        class="group relative flex min-h-11 min-w-11 max-w-full overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
        :aria-label="`Open ${attachment.name}`"
        @click="emit('open', attachment)"
    >
        <img
            :src="media.objectUrl.value"
            :alt="attachment.name"
            class="max-h-80 w-auto max-w-full object-contain"
        >
    </button>
    <div
        v-else-if="media.loading.value"
        role="status"
        class="flex min-h-28 min-w-44 items-center justify-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 text-xs text-[var(--talos-muted)]"
    >
        <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
        Loading {{ attachment.name }}
    </div>
    <div
        v-else
        role="status"
        class="flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 text-xs text-[var(--talos-muted)]"
    >
        <ImageOff class="h-4 w-4 shrink-0" />
        <span class="truncate">{{ attachment.name }} could not be displayed.</span>
    </div>
</template>
