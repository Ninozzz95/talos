<script setup lang="ts">
import { computed, ref } from 'vue'
import { Info } from '@lucide/vue'
import PopoverRoot from '../../ui/popover/Popover.vue'
import PopoverContent from '../../ui/popover/PopoverContent.vue'
import PopoverTrigger from '../../ui/popover/PopoverTrigger.vue'
import TooltipRoot from '../../ui/tooltip/Tooltip.vue'
import TooltipContent from '../../ui/tooltip/TooltipContent.vue'
import TooltipProvider from '../../ui/tooltip/TooltipProvider.vue'
import TooltipTrigger from '../../ui/tooltip/TooltipTrigger.vue'
import { resolveTalosGuideEntry } from '../../../lib/talosGuideRegistry'

const props = withDefaults(defineProps<{
    guideId: string
    compact?: boolean
    side?: 'top' | 'right' | 'bottom' | 'left'
    align?: 'start' | 'center' | 'end'
}>(), {
    compact: false,
    side: 'right',
    align: 'center',
})

const entry = computed(() => resolveTalosGuideEntry(props.guideId))
const popoverOpen = ref(false)
const tooltipOpen = ref(false)
const triggerElement = ref<HTMLButtonElement | null>(null)
const triggerLabel = computed(() => entry.value.available
    ? `Information about ${entry.value.title}`
    : 'Information unavailable')
const testId = computed(() => `talos-guide-info-${props.guideId.replace(/[^A-Za-z0-9_-]/g, '-')}`)

function updatePopover(open: boolean) {
    popoverOpen.value = open
    if (open) tooltipOpen.value = false
}

function updateTooltip(open: boolean) {
    tooltipOpen.value = open && !popoverOpen.value
}
</script>

<template>
    <TooltipProvider v-if="entry.available" :delay-duration="250" :skip-delay-duration="100">
        <PopoverRoot :open="popoverOpen" @update:open="updatePopover">
            <PopoverTrigger as-child>
                <button
                    ref="triggerElement"
                    type="button"
                    :aria-label="triggerLabel"
                    :data-testid="testId"
                    :data-guide-id="guideId"
                    data-guide-available="true"
                    class="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent text-[var(--talos-muted)] hover:border-[var(--talos-accent-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                    :class="compact ? 'h-6 w-6' : 'h-7 w-7'"
                    @click.stop
                    @pointerdown.stop
                    @mouseenter="updateTooltip(true)"
                    @mouseleave="updateTooltip(false)"
                    @focus="updateTooltip(true)"
                    @blur="updateTooltip(false)"
                >
                    <Info :class="compact ? 'h-3 w-3' : 'h-3.5 w-3.5'" aria-hidden="true" />
                </button>
            </PopoverTrigger>

            <PopoverContent
                :side="side"
                :align="align"
                :side-offset="8"
                :collision-padding="8"
                class="z-[115] max-h-[min(26rem,calc(100dvh-1rem))] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto rounded-md border-[var(--talos-border)] bg-[var(--talos-card)] p-3 text-[var(--talos-text)] shadow-xl"
                @click.stop
            >
                <p class="text-xs font-semibold text-[var(--talos-text)]">{{ entry.title }}</p>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ entry.summary }}</p>
                <p class="mt-2 border-t border-[var(--talos-border)] pt-2 text-xs leading-5 text-[var(--talos-text)]">{{ entry.details }}</p>
            </PopoverContent>
        </PopoverRoot>

        <TooltipRoot :open="tooltipOpen" :disabled="popoverOpen" @update:open="updateTooltip">
            <TooltipTrigger
                :reference="triggerElement"
                as="span"
                aria-hidden="true"
                tabindex="-1"
                class="sr-only"
            ></TooltipTrigger>
            <TooltipContent
                :side="side"
                :align="align"
                :side-offset="6"
                class="z-[120] border-neutral-700 bg-neutral-950 text-xs text-neutral-50"
            >
                {{ triggerLabel }}
            </TooltipContent>
        </TooltipRoot>
    </TooltipProvider>

    <button
        v-else
        type="button"
        disabled
        :aria-label="triggerLabel"
        :title="triggerLabel"
        :data-testid="testId"
        :data-guide-id="guideId"
        data-guide-available="false"
        class="inline-flex shrink-0 cursor-not-allowed items-center justify-center rounded-md border border-transparent text-[var(--talos-muted)] opacity-45"
        :class="compact ? 'h-6 w-6' : 'h-7 w-7'"
    >
        <Info :class="compact ? 'h-3 w-3' : 'h-3.5 w-3.5'" aria-hidden="true" />
    </button>
</template>
