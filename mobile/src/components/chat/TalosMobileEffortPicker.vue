<script setup lang="ts">
import { computed } from 'vue'
import { useTalosI18n } from '@/i18n'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'
import { mobileEffortLadderFromLevels } from '@/lib/mobileEffort'
import TalosThemedSegmentedSlider from '@/components/talos/ui/TalosThemedSegmentedSlider.vue'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'

/**
 * Drop-in replacement for the effort picker at TALOS
 * e7760d8fac95b84c0bda0e710be8df6d0d9ba74d.
 *
 * Props and events intentionally remain identical. The parent drawer,
 * composer state and provider capability plumbing do not change; only the
 * effort interaction moves from several radio buttons to one discrete slider.
 */
const props = defineProps<{
    effortLevels: string[]
    selectedEffort: string
    supportsThinking: boolean
    thinking: boolean
}>()

const emit = defineEmits<{
    selectEffort: [level: TalosMobileEffortLevel]
    selectThinking: [enabled: boolean]
    requestClose: []
}>()

const { t } = useTalosI18n()
const effortLadder = computed(() => mobileEffortLadderFromLevels(props.effortLevels))

function effortLabel(level: string): string {
    const key = `chat.effort${level.charAt(0).toUpperCase()}${level.slice(1)}`
    return t(key)
}

const effortOptions = computed(() => effortLadder.value.map((level) => ({
    value: level,
    label: effortLabel(level),
    // Keep the hook already used by unit/E2E tests in the repository.
    testId: 'talos-mobile-effort-level',
})))

const selectedLevel = computed<TalosMobileEffortLevel>(() => {
    const supported = effortLadder.value.find((level) => level === props.selectedEffort)
    return supported ?? effortLadder.value[0] ?? 'off'
})

const selectedLabel = computed(() => effortLabel(selectedLevel.value))

function chooseEffort(value: string): void {
    const supported = effortLadder.value.find((level) => level === value)
    if (supported) emit('selectEffort', supported)
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    emit('requestClose')
}
</script>

<template>
    <div
        data-testid="talos-mobile-effort-picker"
        class="space-y-3"
        @keydown="onKeydown"
    >
        <template v-if="effortLadder.length > 1">
            <div class="flex min-w-0 items-end justify-between gap-3 px-1">
                <div class="text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted,var(--muted-foreground))]">
                    {{ $t('chat.reasoningEffort') }}
                    <div
                        data-testid="talos-mobile-effort-selected"
                        class="mt-1 truncate text-base font-semibold text-[var(--talos-accent,var(--primary))]"
                    >
                        {{ selectedLabel }}
                    </div>
                </div>
                <div
                    v-if="supportsThinking"
                    class="flex shrink-0 items-center gap-2 text-xs text-[var(--talos-muted,var(--muted-foreground))]"
                >
                    <span>{{ $t('chat.extendedThinking') }}</span>
                    <TalosThemedSwitch
                        test-id="talos-mobile-thinking-toggle"
                        :model-value="thinking"
                        :aria-label="$t('chat.extendedThinking')"
                        @update:model-value="emit('selectThinking', $event)"
                    />
                </div>
            </div>

            <TalosThemedSegmentedSlider
                test-id="talos-mobile-effort-slider"
                :model-value="selectedLevel"
                :options="effortOptions"
                :ariaLabel="$t('chat.reasoningEffortLevels')"
                @update:model-value="chooseEffort"
            />
        </template>

        <p
            v-else
            class="text-2xs leading-4 text-[var(--talos-muted,var(--muted-foreground))]"
        >
            {{ $t('chat.noReasoningSetting') }}
        </p>

        <div
            v-if="supportsThinking && effortLadder.length <= 1"
            class="flex min-h-touch items-center justify-between gap-3 border-t border-[var(--talos-border,var(--border))] pt-3 text-sm text-[var(--talos-text,var(--foreground))]"
        >
            <span class="min-w-0">{{ $t('chat.extendedThinking') }}</span>
            <TalosThemedSwitch
                test-id="talos-mobile-thinking-toggle"
                :model-value="thinking"
                :aria-label="$t('chat.extendedThinking')"
                @update:model-value="emit('selectThinking', $event)"
            />
        </div>
    </div>
</template>
