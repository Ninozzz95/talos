<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { TALOS_SWITCH_THUMB_CLASS, TALOS_SWITCH_TRACK_CLASS } from '@/lib/switchStyles'
/**
 * F3-T4bis (owner #13, Claude screenshots) — the organized "Add to chat"
 * bottom drawer. Big single-shot tiles up top (they act and close), calm
 * toggle rows for modes (they act and stay), an inline effort segment and
 * quiet action rows. Loaded lazily by the composer only in drawer mode.
 */
import {
    Brain, Camera as CameraIcon, Database, FlaskConical, Globe2, Images, Paperclip, Sparkles,
} from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
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

const { t } = useTalosI18n()
function single(
    action: 'attach' | 'takePhoto' | 'pickPhotos' | 'openContext' | 'openModelLab' | 'enhancePrompt',
): void {
    emit(action as never)
    emit('close')
}

const realEfforts = () => props.effortLevels.filter((level) => level !== 'off')
function effortLabel(level: string): string {
    const key = `chat.effort${level.charAt(0).toUpperCase()}${level.slice(1)}`
    return t(key)
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

                <SwitchRoot
                    data-testid="talos-drawer-browse"
                    :model-value="browseMode"
                    class="talos-pressable flex min-h-13 w-full items-center gap-3 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 px-3 text-left"
                    @update:model-value="emit('toggleBrowse', $event)"
                >
                    <span class="flex size-9 items-center justify-center rounded-full bg-[var(--talos-active)]">
                        <Globe2 class="size-4" aria-hidden="true" />
                    </span>
                    <span class="min-w-0 flex-1 text-sm">{{ $t('chat.browseWeb') }}</span>
                    <!-- `data-state` a mano: reka lo mette sulla RIGA, che qui e'
                         il SwitchRoot, non su questo binario. Senza,
                         il pomello si muove e il binario resta spento. -->
                    <span :class="TALOS_SWITCH_TRACK_CLASS" :data-state="browseMode ? 'checked' : 'unchecked'" aria-hidden="true">
                        <SwitchThumb :class="TALOS_SWITCH_THUMB_CLASS" />
                    </span>
                </SwitchRoot>

                <SwitchRoot
                    v-if="supportsThinking"
                    data-testid="talos-drawer-thinking"
                    :model-value="thinking"
                    class="talos-pressable flex min-h-13 w-full items-center gap-3 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 px-3 text-left"
                    @update:model-value="emit('selectThinking', $event)"
                >
                    <span class="flex size-9 items-center justify-center rounded-full bg-[var(--talos-active)]">
                        <Brain class="size-4" aria-hidden="true" />
                    </span>
                    <span class="min-w-0 flex-1 text-sm">{{ $t('chat.extendedThinking') }}</span>
                    <!-- `data-state` a mano: reka lo mette sulla RIGA, che qui e'
                         il SwitchRoot, non su questo binario. Senza,
                         il pomello si muove e il binario resta spento. -->
                    <span :class="TALOS_SWITCH_TRACK_CLASS" :data-state="thinking ? 'checked' : 'unchecked'" aria-hidden="true">
                        <SwitchThumb :class="TALOS_SWITCH_THUMB_CLASS" />
                    </span>
                </SwitchRoot>

                <div v-if="realEfforts().length" class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3">
                    <p class="text-xs font-medium uppercase tracking-wide text-[var(--talos-muted)]">{{ $t('chat.reasoningEffort') }}</p>
                    <div class="mt-2 flex gap-1" role="radiogroup" :aria-label="$t('chat.reasoningEffort')">
                        <button
                            v-for="level in effortLevels"
                            :key="level"
                            type="button"
                            role="radio"
                            :aria-checked="level === selectedEffort"
                            :data-testid="`talos-drawer-effort-${level}`"
                            class="talos-pressable min-h-10 flex-1 rounded-full text-xs font-medium capitalize transition-colors duration-150"
                            :class="level === selectedEffort
                                ? 'bg-[var(--talos-accent,var(--primary))] text-[var(--talos-accent-contrast,var(--primary-foreground))]'
                                : 'text-[var(--talos-muted)] hover:bg-[var(--talos-active)]'"
                            @click="emit('selectEffort', level as never)"
                        >
                            {{ effortLabel(level) }}
                        </button>
                    </div>
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
