<script setup lang="ts">
import { computed } from 'vue'
import { KeyRound } from '@lucide/vue'
import { useRoute } from 'vue-router'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosMobileSettingsCenter from '@/components/talos/settings/TalosMobileSettingsCenter.vue'

const route = useRoute()
const requestedTab = computed(() => typeof route.query.tab === 'string' ? route.query.tab : null)
</script>

<template>
    <TalosMobileScreen title="Settings Center" eyebrow="Protected preferences">
        <template #eyebrow-icon>
            <KeyRound class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" />
        </template>
        <TalosMobileSettingsCenter :requested-tab="requestedTab" />
    </TalosMobileScreen>
</template>
