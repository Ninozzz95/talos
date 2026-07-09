<script setup lang="ts">
import Button from '../../ui/Button.vue'
import TalosGoogleIntegration from '../integrations/TalosGoogleIntegration.vue'

const emit = defineEmits<{
    openModule: [id: string]
}>()
</script>

<template>
    <TalosGoogleIntegration />
    <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
        <div class="text-sm font-semibold text-[var(--talos-text)]">Connector registry</div>
        <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
            Connectors and tools are read from the TALOS registry. Registry writes remain capability-gated server-side.
        </p>
        <Button class="mt-3" size="sm" variant="secondary" @click="emit('openModule', 'tools')">Open Tool Registry</Button>
    </div>
</template>
