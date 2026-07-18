<script setup lang="ts">
import { inject, ref } from 'vue'
import TooltipRoot from './tooltip/Tooltip.vue'
import TooltipContent from './tooltip/TooltipContent.vue'
import TooltipProvider from './tooltip/TooltipProvider.vue'
import TooltipTrigger from './tooltip/TooltipTrigger.vue'
import { tooltipPortalTargetKey } from './tooltip/portalTarget'

withDefaults(defineProps<{
    content: string
    align?: 'start' | 'center' | 'end'
}>(), {
    align: 'center',
})

const portalTarget = inject(tooltipPortalTargetKey, ref('#talos-portal-root'))

</script>

<template>
    <TooltipProvider :delay-duration="250" :skip-delay-duration="100">
        <TooltipRoot>
            <TooltipTrigger as-child>
                <slot />
            </TooltipTrigger>
            <TooltipContent
                :to="portalTarget"
                :align="align"
                :side-offset="8"
                :collision-padding="8"
                class="talos-elev-2 pointer-events-auto z-[120] max-w-56 rounded-md px-2 py-1 text-xs leading-5 text-[var(--talos-text)]"
            >
                {{ content }}
            </TooltipContent>
        </TooltipRoot>
    </TooltipProvider>
</template>
