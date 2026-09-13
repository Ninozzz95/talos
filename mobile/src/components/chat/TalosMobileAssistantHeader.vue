<script setup lang="ts">
defineProps<{ working?: boolean }>()
</script>

<template>
    <div class="assistant-header" data-testid="talos-assistant-header">
        <span class="talos-orb" :class="{ working }" data-testid="talos-assistant-orb" aria-hidden="true">
            <span class="talos-short-logo"><span class="talos-short-logo-mark" /></span>
        </span>
        <span>{{ $t('chat.assistantName') }}</span>
        <small class="talos-message-meta" data-testid="talos-message-meta"><slot /></small>
    </div>
</template>
