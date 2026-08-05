<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { useTalosI18n } from '@/i18n'

const route = useRoute()
const { t } = useTalosI18n()
const TalosMobileLocalRepoDetail = defineAsyncComponent(
    () => import('@/components/talos/models/TalosMobileLocalRepoDetail.vue'),
)

function routeSegment(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null
    if (value.includes('/') || /[\u0000-\u001f\u007f]/.test(value)) return null
    return value
}

const owner = computed(() => routeSegment(route.params.owner))
const repo = computed(() => routeSegment(route.params.repo))
const repoId = computed(() => owner.value && repo.value ? `${owner.value}/${repo.value}` : null)
const revision = computed(() => {
    const value = route.query.revision
    return typeof value === 'string' && value.trim() && !/[\u0000-\u001f\u007f]/.test(value)
        ? value
        : 'main'
})
</script>

<template>
    <section data-testid="settings-models-local-repo-screen" class="h-full min-w-0 overflow-y-auto bg-[var(--talos-background)] p-[var(--talos-space-page)] text-[var(--talos-text)]">
        <TalosMobileLocalRepoDetail v-if="repoId" :repo-id="repoId" :revision="revision" />
        <p v-else role="alert" data-testid="talos-models-invalid-repo" class="rounded-[var(--talos-radius-card)] border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-[var(--talos-space-card)] text-sm text-[var(--talos-text)]">
            {{ t('localModels.invalidRepo') }}
        </p>
    </section>
</template>
