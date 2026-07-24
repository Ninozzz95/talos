<script setup lang="ts">
import { useTalosAccountStore } from '@/stores/account'

/**
 * Cleanup pass 2026-07-24 — the accent avatar chip (the account initial in a
 * round accent surface) was hand-rolled three times (sidebar, settings category
 * card, account panel) and had already drifted in size/text. One component now
 * owns the look, so a future avatar image/ring lands in a single place.
 */
const props = withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })
const account = useTalosAccountStore()
const SIZES: Record<'sm' | 'md' | 'lg', string> = {
    sm: 'size-9 text-sm',
    md: 'size-10 text-sm',
    lg: 'size-12 text-lg',
}
</script>

<template>
    <span
        class="flex shrink-0 items-center justify-center rounded-full bg-[var(--talos-accent)] font-semibold text-[var(--talos-accent-contrast,var(--talos-accent-text))]"
        :class="SIZES[props.size]"
        aria-hidden="true"
    >{{ account.initial.value }}</span>
</template>
