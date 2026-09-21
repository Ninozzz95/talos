<script setup lang="ts">
/**
 * Reusable mobile screen shell — the analog of the desktop window title bar +
 * in-body header (parity map). Renders a single screen H1 (+ optional eyebrow)
 * over a scrollable content region. Uses the shared `--talos-*` tokens so it
 * renders identically to desktop once the `talos-shell` scope is applied.
 * F3-T3 chrome dedup: inside the tool sheet (which already titles the surface)
 * the header self-hides — one title per surface.
 */
import { inject } from 'vue'
import { TALOS_SHEET_CONTEXT_KEY } from '@/lib/sheetContext'

withDefaults(defineProps<{
    title: string
    eyebrow?: string
    /**
     * A canonical list-detail station owns pane scrolling at expanded widths.
     * Compact/mobile layout retains this shell's established gutter/scroller.
     */
    tabletEdgeToEdge?: boolean
    /** The child surface owns its own responsive gutters and scrollports at
     * every width, so this generic shell must not add a second inset. */
    edgeToEdge?: boolean
    /**
     * F6 sidebar refactor (24/8): mounted as a persistent panel's OWN content
     * (the tablet rail showing Harness instead of chats — TalosTabletSidebar.vue),
     * not as a routed/sheeted station. Same reason `insideSheet` already hides
     * this shell's H1 ("one title per surface"): the rail already has a brand
     * header. Also drops the opaque background — the rail is translucent
     * (`bg-[var(--talos-sidebar)]/60 backdrop-blur-sm`), and painting over it
     * would defeat the blur, exactly the "un casino" look the owner rejected
     * for the mockup's own duplicate sidebar. ChatsScreen, the rail's other
     * variant, never had this problem because it never used this shell at all.
     */
    embedded?: boolean
}>(), {
    tabletEdgeToEdge: false,
    edgeToEdge: false,
    embedded: false,
})
const insideSheet = inject(TALOS_SHEET_CONTEXT_KEY, false)
</script>

<template>
    <!-- Owner 2026-07-24: h-full (NOT min-h-full) so the inner content div is a
         BOUNDED single scroller — min-h-full grew to content, leaving the inner
         overflow-y-auto with no room and overscroll-contain swallowing the
         touch scroll (Settings Center wouldn't scroll on device). -->
    <section
        data-testid="mobile-screen"
        :aria-label="title"
        class="flex h-full flex-col text-[var(--talos-text)]"
        :class="embedded ? '' : 'bg-[var(--talos-background)]'"
    >
        <header v-if="!insideSheet && !embedded" class="border-b border-[var(--talos-border)] p-4">
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
                class="talos-title text-md font-semibold text-[var(--talos-text)]"
                :class="{ 'mt-2': eyebrow }"
            >{{ title }}</h1>
        </header>
        <!-- Owner 2026-07-24: no TOP padding on the scroll container so a
             sticky section header (Appearance tabs) can pin FLUSH to the top
             (top-0 was landing 16px inside the old p-4). Sides/bottom keep the
             16px gutter; screens add their own top breathing room. -->
        <div
            data-testid="mobile-screen-body"
            class="min-h-0 flex-1"
            :class="[
                edgeToEdge ? 'overflow-hidden p-0' : 'overflow-y-auto px-4 pb-4 pt-0',
                { 'md:overflow-hidden md:p-0': tabletEdgeToEdge && !edgeToEdge },
            ]"
        >
            <slot />
        </div>
    </section>
</template>
