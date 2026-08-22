<script setup lang="ts">
import { ref } from 'vue'
import { Download, Paperclip, Trash2, X } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { useTalosModalSurface } from '@/composables/useTalosModalSurface'
import TalosMobileFileOriginCard from '@/components/talos/library/TalosMobileFileOriginCard.vue'
import type { TalosFileOriginCard } from '@/lib/files/originCard'

/**
 * Looking at one image, full screen — everywhere.
 *
 * Owner 2026-07-30, for at least the second time: «i due component devono
 * essere esattamente identici con gli stessi controlli». Opening a picture from
 * the Library and opening the SAME picture from a chat's own library gave two
 * different sets of buttons — Attach and Delete existed in one and not the
 * other — because the viewer was written twice.
 *
 * So it is written once. Any surface that shows a picture full screen mounts
 * this, and the controls cannot drift apart again because there is only one
 * place they exist. A caller that genuinely cannot offer an action omits its
 * handler and the button is not rendered — a missing capability, not a missing
 * copy of the code.
 */
const props = withDefaults(defineProps<{
    /** The object URL being shown. */
    src: string
    /** Used in every button's accessible name — never decoration. */
    name: string
    /** Attach is hidden when the file is already attached to the draft. */
    canAttach?: boolean
    /** A file still being written has nothing to save yet. */
    canSave?: boolean
    canDelete?: boolean
    busy?: boolean
    saving?: boolean
    testId?: string
    saveTestId?: string
    /**
     * Where this picture came from (owner decision P-07, famiglia B).
     *
     * It lives HERE rather than in each caller for the same reason the buttons
     * do: the Library and a chat's own gallery are the same viewer, and a card
     * added to one and forgotten in the other is exactly the drift the owner
     * has already complained about twice.
     */
    origin?: TalosFileOriginCard | null
    canOpenOriginChat?: boolean
}>(), {
    canAttach: false,
    canSave: false,
    canDelete: false,
    busy: false,
    saving: false,
    testId: 'talos-library-lightbox',
    saveTestId: undefined,
    origin: null,
    canOpenOriginChat: false,
})

const emit = defineEmits<{
    attach: []
    save: []
    delete: []
    close: []
    openOriginChat: [sessionId: string]
}>()

const { t } = useTalosI18n()

/**
 * It has always CLAIMED to be a modal — `role="dialog"`, `aria-modal`, an
 * Escape handler — and never behaved like one: nothing focused it, so Escape
 * closed nothing, and the surface behind stayed reachable by keyboard and by
 * TalkBack. Found by an adversarial review 2026-07-31, and it matters more now
 * that the origin card puts a NAVIGATION action in here: it sat after every
 * element of the Library in traversal order.
 *
 * The same composable the media panel and the confirm dialogs already use.
 */
const root = ref<HTMLElement | null>(null)
const { trapTab } = useTalosModalSurface(root)
</script>

<template>
    <div
        ref="root"
        :data-testid="props.testId"
        role="dialog"
        aria-modal="true"
        :aria-label="t('library.imagePreview')"
        tabindex="-1"
        class="fixed inset-0 z-[95] flex flex-col bg-black/90 outline-none"
        @keydown.escape="emit('close')"
        @keydown="trapTab"
    >
        <div class="flex items-center justify-end gap-1 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-white">
            <button
                v-if="canAttach"
                type="button"
                data-testid="talos-image-viewer-attach"
                :aria-label="t('library.attachNamedToMessage', { name })"
                :disabled="busy"
                class="talos-pressable flex size-12 items-center justify-center rounded-full bg-white/15 disabled:opacity-50"
                @click="emit('attach')"
            ><Paperclip class="size-5" aria-hidden="true" /></button>
            <button
                v-if="canSave"
                type="button"
                :data-testid="props.saveTestId ?? 'talos-image-viewer-save'"
                :aria-label="t('library.saveNamedToDevice', { name })"
                :disabled="saving"
                class="talos-pressable flex size-12 items-center justify-center rounded-full bg-white/15 disabled:opacity-50"
                @click="emit('save')"
            ><Download class="size-5" aria-hidden="true" /></button>
            <button
                v-if="canDelete"
                type="button"
                data-testid="talos-image-viewer-delete"
                :aria-label="t('library.deleteNamed', { name })"
                class="talos-pressable flex size-12 items-center justify-center rounded-full bg-white/15"
                @click="emit('delete')"
            ><Trash2 class="size-5" aria-hidden="true" /></button>
            <button
                type="button"
                data-testid="talos-image-viewer-close"
                :aria-label="t('chat.closePreview')"
                class="talos-pressable flex size-12 items-center justify-center rounded-full bg-white/15"
                @click="emit('close')"
            ><X class="size-5" aria-hidden="true" /></button>
        </div>
        <!-- Tapping the picture closes it, the way every gallery on a phone does. -->
        <div class="flex min-h-0 flex-1 items-center justify-center p-4" @click="emit('close')">
            <img :src="src" :alt="t('library.previewAlt')" class="max-h-full max-w-full object-contain">
        </div>
        <!--
            Under the picture, never over it: a photograph is what you came for.

            Bounded and scrollable, because it is a flex child of a full-screen
            column with nothing else able to give. Unbounded it took a fifth of a
            360x640 portrait screen from the photo, and in landscape — reachable
            on every device, the manifest pins no orientation — it pushed its own
            button off the bottom of a container that cannot scroll.
        -->
        <div
            v-if="props.origin"
            class="min-h-0 max-h-[40%] shrink overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
            <TalosMobileFileOriginCard
                :card="props.origin"
                :can-open-chat="props.canOpenOriginChat"
                on-dark
                @open-chat="(sessionId) => emit('openOriginChat', sessionId)"
            />
        </div>
    </div>
</template>
