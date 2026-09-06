<script setup lang="ts">
/**
 * F3-T4bis (owner #13, Claude screenshots) — the organized "Add to chat"
 * bottom drawer. Big single-shot tiles up top (they act and close), quiet
 * action rows below. Loaded lazily by the composer only in drawer mode.
 *
 * ⛔⛔⛔ Owner 6/9: reasoning/effort AND "browse the web" both removed from
 * here — "non hanno senso lì". Reasoning/effort has its own home (the
 * "Model & reasoning" drawer). Browse mode has none here anymore: in
 * drawer mode there is currently no way to toggle it (the classic/dropdown
 * composer keeps its own copy of the switch, untouched) — owner's explicit
 * call, not an oversight.
 */
import {
    Camera as CameraIcon, Database, FlaskConical, Images, Paperclip, Sparkles,
} from '@lucide/vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'

const props = defineProps<{
    canEnhance: boolean
    enhanceReason?: string | null
    browseMode: boolean
    thinking: boolean
    supportsThinking: boolean
    effortLevels: readonly string[]
    selectedEffort: string
    attachmentsAvailable: boolean
    contextAvailable: boolean
}>()

const emit = defineEmits<{
    close: []
    attach: []
    takePhoto: []
    pickPhotos: []
    openContext: []
    openModelLab: []
    toggleBrowse: [enabled: boolean]
    selectThinking: [enabled: boolean]
    selectEffort: [level: TalosMobileEffortLevel]
    enhancePrompt: []
}>()

function single(
    action: 'attach' | 'takePhoto' | 'pickPhotos' | 'openContext' | 'openModelLab' | 'enhancePrompt',
): void {
    emit(action as never)
    emit('close')
}

</script>

<template>
    <!-- SF-7: shared sheet shell = teleport + real modality (inert app root,
         focus trap, focus restore) for the Add-to-chat drawer too. -->
    <TalosMobileComposerSheet :title="$t('chat.addToChat')" testid="talos-composer-drawer" @close="emit('close')">
                <div class="grid grid-cols-3 gap-3">
                    <button
                        type="button"
                        data-testid="talos-drawer-attach"
                        :disabled="!attachmentsAvailable"
                        class="talos-pressable flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 text-sm text-[var(--talos-text)] disabled:opacity-50"
                        @click="single('attach')"
                    >
                        <span class="flex size-12 items-center justify-center rounded-full bg-[var(--talos-active)]">
                            <Paperclip class="size-5" aria-hidden="true" />
                        </span>
                        {{ $t('chat.attach') }}
                    </button>
                    <!--
                        F-6. Camera and Photos sit beside Attach because they are
                        the two things people reach for most and the document
                        picker serves neither well.
                        Photos is NOT a duplicate of Attach: it goes through
                        Android's Photo Picker, which hands over the chosen
                        pictures and needs no storage permission at all — the app
                        never gains the right to read the whole gallery.
                    -->
                    <button
                        type="button"
                        data-testid="talos-drawer-take-photo"
                        :disabled="!attachmentsAvailable"
                        class="talos-pressable flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 text-sm text-[var(--talos-text)] disabled:opacity-50"
                        @click="single('takePhoto')"
                    >
                        <span class="flex size-12 items-center justify-center rounded-full bg-[var(--talos-active)]">
                            <CameraIcon class="size-5" aria-hidden="true" />
                        </span>
                        {{ $t('chat.takePhoto') }}
                    </button>
                    <button
                        type="button"
                        data-testid="talos-drawer-pick-photos"
                        :disabled="!attachmentsAvailable"
                        class="talos-pressable flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 text-sm text-[var(--talos-text)] disabled:opacity-50"
                        @click="single('pickPhotos')"
                    >
                        <span class="flex size-12 items-center justify-center rounded-full bg-[var(--talos-active)]">
                            <Images class="size-5" aria-hidden="true" />
                        </span>
                        {{ $t('chat.pickPhotos') }}
                    </button>
                    <button
                        type="button"
                        data-testid="talos-drawer-context"
                        :disabled="!contextAvailable"
                        class="talos-pressable flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 text-sm text-[var(--talos-text)] disabled:opacity-50"
                        @click="single('openContext')"
                    >
                        <span class="flex size-12 items-center justify-center rounded-full bg-[var(--talos-active)]">
                            <Database class="size-5" aria-hidden="true" />
                        </span>
                        {{ $t('navigation.library') }}
                    </button>
                    <button
                        type="button"
                        data-testid="talos-drawer-model-lab"
                        class="talos-pressable flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 text-sm text-[var(--talos-text)]"
                        @click="single('openModelLab')"
                    >
                        <span class="flex size-12 items-center justify-center rounded-full bg-[var(--talos-active)]">
                            <FlaskConical class="size-5" aria-hidden="true" />
                        </span>
                        {{ $t('navigation.modelLab') }}
                    </button>
                </div>

                <!-- F4-#20: never a mute disabled row — the tap explains itself. -->
                <button
                    type="button"
                    data-testid="talos-drawer-enhance"
                    :title="enhanceReason ?? $t('chat.improvePrompt')"
                    class="talos-pressable flex min-h-13 w-full items-center gap-3 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 px-3 text-left"
                    @click="single('enhancePrompt')"
                >
                    <span class="flex size-9 items-center justify-center rounded-full bg-[var(--talos-active)]">
                        <Sparkles class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                    </span>
                    <span class="flex min-w-0 flex-1 flex-col">
                        <span class="text-sm">{{ $t('chat.improvePrompt') }}</span>
                        <span class="text-2xs text-[var(--talos-muted)]">
                            {{ enhanceReason ?? $t('chat.rewriteDraft') }}
                        </span>
                    </span>
                </button>

    </TalosMobileComposerSheet>
</template>
