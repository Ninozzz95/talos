<script setup lang="ts">
import { computed, type Component } from 'vue'
import { Clock, Ghost, Gift, Heart, PartyPopper, Snowflake } from '@lucide/vue'
import type { TalosWelcomeEasterEggKind } from '@/lib/welcome/catalog'

const props = defineProps<{
    kind: TalosWelcomeEasterEggKind | null
}>()

const icons: Readonly<Record<TalosWelcomeEasterEggKind, Component>> = {
    'party-popper': PartyPopper,
    heart: Heart,
    ghost: Ghost,
    snowflake: Snowflake,
    gift: Gift,
    clock: Clock,
}

const icon = computed(() => props.kind ? icons[props.kind] : null)
</script>

<template>
    <span
        v-if="icon && kind"
        data-testid="talos-welcome-easter-egg"
        :data-welcome-easter-egg="kind"
        aria-hidden="true"
        class="pointer-events-none mr-1.5 inline-flex size-5 shrink-0 items-center justify-center align-[-0.2em] text-[var(--talos-accent)]"
    >
        <component :is="icon" class="size-4" :stroke-width="1.8" />
    </span>
</template>
