<script setup lang="ts">
import { Activity } from '@lucide/vue'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
</script>

<template>
    <TalosMobileScreen title="Runtime cockpit" eyebrow="Runtime">
        <template #eyebrow-icon>
            <Activity class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" />
        </template>
        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
            No execution runs returned by the run API yet.
        </div>
    </TalosMobileScreen>
</template>
