<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
    <div class="grid min-h-48 content-center gap-3 px-4 py-8" role="status" aria-live="polite" :aria-label="`Loading ${title}`">
        <div class="h-2 w-28 animate-pulse rounded-sm bg-[var(--talos-accent)]/40" />
        <div class="h-2 w-full max-w-md animate-pulse rounded-sm bg-[var(--talos-border)]" />
        <div class="h-2 w-3/4 max-w-sm animate-pulse rounded-sm bg-[var(--talos-border)]" />
        <span class="sr-only">Loading {{ title }}</span>
    </div>
</template>
