<script setup lang="ts">
import { FileSearch } from '@lucide/vue'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
</script>

<template>
    <TalosMobileScreen title="Deep Research V3" eyebrow="Deep research">
        <template #eyebrow-icon>
            <FileSearch class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" />
        </template>
        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
            Not in this build — deep Research needs the local research worker, which is not installed yet. There is nothing to queue or select here.
        </div>
    </TalosMobileScreen>
</template>
