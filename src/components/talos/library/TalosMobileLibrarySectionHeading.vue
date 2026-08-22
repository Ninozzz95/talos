<script setup lang="ts">
/**
 * The heading of one Library section: the chat it came from, and when it was
 * last touched.
 *
 * A component because the heading was written twice — once in the file branch,
 * once in the link branch — and the owner's request to add a date to it would
 * otherwise have been two edits, which is the shape every defect in this screen
 * has had so far.
 *
 * The date is the section's most recent item (D-17): the one that MOVES when the
 * section changes, and the key the sort orders by. A creation date next to a
 * "most recent first" order would put a heading labelled March at the top and
 * look broken.
 *
 * No date is rendered rather than a guess when the section has nothing to date
 * itself by — a heading that invents a date is worse than one without.
 */
defineProps<{
    title: string
    dateLabel: string | null
}>()
</script>

<template>
    <h2
        data-testid="talos-library-section-heading"
        class="mb-2 mt-4 flex min-w-0 items-baseline gap-2 text-xs font-semibold text-[var(--talos-muted)]"
    >
        <span class="min-w-0 flex-1 truncate">{{ title }}</span>
        <span v-if="dateLabel" class="shrink-0 font-normal opacity-80">{{ dateLabel }}</span>
    </h2>
</template>
