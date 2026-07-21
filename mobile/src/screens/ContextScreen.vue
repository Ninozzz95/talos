<script setup lang="ts">
import { Database } from '@lucide/vue'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
</script>

<template>
    <TalosMobileScreen title="Library" eyebrow="Context Vault">
        <template #eyebrow-icon>
            <Database class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" />
        </template>
        <!-- Registry sections: Context Vault / Documents (inert in step-1). -->
        <div class="mb-4 flex gap-1 border-b border-[var(--talos-border)]" role="tablist" aria-label="Library sections">
            <span role="tab" aria-selected="true" class="border-b-2 border-[var(--talos-accent)] px-3 py-2 text-sm font-medium text-[var(--talos-text)]">Context Vault</span>
            <span role="tab" aria-selected="false" class="px-3 py-2 text-sm text-[var(--talos-muted)]">Documents</span>
        </div>
        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
            No context sets returned by `/api/talos/context-sets`.
        </div>
    </TalosMobileScreen>
</template>
