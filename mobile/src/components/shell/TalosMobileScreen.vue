<script setup lang="ts">
/**
 * Reusable mobile screen shell — the analog of the desktop window title bar +
 * in-body header (parity map). Renders a single screen H1 (+ optional eyebrow)
 * over a scrollable content region. Uses the shared `--talos-*` tokens so it
 * renders identically to desktop once the `talos-shell` scope is applied.
 */
defineProps<{ title: string; eyebrow?: string }>()
</script>

<template>
    <section
        data-testid="mobile-screen"
        :aria-label="title"
        class="flex min-h-full flex-col bg-[var(--talos-background)] text-[var(--talos-text)]"
    >
        <header class="border-b border-[var(--talos-border)] p-4">
            <p
                v-if="eyebrow"
                data-testid="mobile-screen-eyebrow"
                class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]"
            >
                <slot name="eyebrow-icon" />
                {{ eyebrow }}
            </p>
            <h1
                data-testid="mobile-screen-title"
                class="text-base font-semibold text-[var(--talos-text)]"
                :class="{ 'mt-2': eyebrow }"
            >{{ title }}</h1>
        </header>
        <div class="flex-1 overflow-y-auto p-4">
            <slot />
        </div>
    </section>
</template>
