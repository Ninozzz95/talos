<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { AlertCircle, CheckCircle2, Cpu, Download, Loader2, PackageCheck, ServerCog } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import Tabs from '../../ui/Tabs.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import TalosCookbookDependencies from './TalosCookbookDependencies.vue'
import TalosCookbookDownload from './TalosCookbookDownload.vue'
import TalosCookbookLaunch from './TalosCookbookLaunch.vue'
import TalosCookbookSettings from './TalosCookbookSettings.vue'
import { useTalosCookbook } from '../../../composables/useTalosCookbook'
import type { TalosCookbookCommandPreview } from '../../../lib/talosTypes'

type CookbookTab = 'launch' | 'download' | 'dependencies' | 'settings'

const tabs: Array<{
    id: CookbookTab
    label: string
    icon: typeof Cpu
}> = [
    { id: 'launch', label: 'Launch', icon: Cpu },
    { id: 'download', label: 'Download', icon: Download },
    { id: 'dependencies', label: 'Dependencies', icon: PackageCheck },
    { id: 'settings', label: 'Settings', icon: ServerCog },
]

const {
    overview,
    models,
    dependencyCatalog,
    dependencyPreview,
    loading,
    actionMessage,
    errorMessage,
    loadOverview,
    loadDependencies,
    loadCookbookPolicy,
    scanHardware,
    loadModels,
    previewDownload,
    previewDependencyPlan,
    previewServe,
} = useTalosCookbook()

const activeTab = ref<CookbookTab>('launch')
const selectedModelId = ref('')
const selectedRuntime = ref('')
const downloadPreview = ref<TalosCookbookCommandPreview | null>(null)
const servePreview = ref<TalosCookbookCommandPreview | null>(null)

const runtimes = computed(() => overview.value?.runtimes ?? [])
const profile = computed(() => overview.value?.profile ?? null)
const runtimeCount = computed(() => runtimes.value.length)
const modelCount = computed(() => models.value.length)

const firstRuntimeKind = computed(() => {
    return runtimes.value[0]?.kind
        ?? models.value[0]?.runtime_modes[0]
        ?? 'ollama'
})

function selectedModelExists(modelId: string) {
    return models.value.some((model) => model.model_id === modelId)
}

function selectedRuntimeExists(runtime: string) {
    return runtimes.value.some((candidate) => candidate.kind === runtime)
}

function selectedPreviewPayload() {
    const modelId = selectedModelId.value || models.value[0]?.model_id || ''
    const runtime = selectedRuntime.value || firstRuntimeKind.value

    if (!modelId || !runtime) {
        return null
    }

    return {
        model_id: modelId,
        runtime,
    }
}

async function runHardwareScan() {
    await scanHardware()
    await loadModels()
}

async function runDownloadPreview() {
    const payload = selectedPreviewPayload()

    if (!payload) {
        return
    }

    downloadPreview.value = await previewDownload(payload)
}

async function runServePreview() {
    const payload = selectedPreviewPayload()

    if (!payload) {
        return
    }

    servePreview.value = await previewServe(payload)
}

async function runDependencyPreview() {
    const payload = selectedPreviewPayload()

    if (!payload) {
        return
    }

    await previewDependencyPlan(payload)
}

watch(models, (nextModels) => {
    if (!nextModels.length) {
        selectedModelId.value = ''
        return
    }

    if (!selectedModelId.value || !selectedModelExists(selectedModelId.value)) {
        selectedModelId.value = nextModels[0].model_id
    }
}, { immediate: true })

watch(runtimes, () => {
    if (!selectedRuntime.value || !selectedRuntimeExists(selectedRuntime.value)) {
        selectedRuntime.value = firstRuntimeKind.value
    }
}, { immediate: true })

onMounted(() => {
    void loadOverview()
    void loadDependencies()
    void loadCookbookPolicy()
})
</script>

<template>
    <Surface aria-label="Cookbook">
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <Cpu class="h-4 w-4 text-[var(--talos-accent)]" />
                        Cookbook
                    </div>
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Local model lab</h3>
                    <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">
                        Hardware fit scoring and preview-only local runtime commands backed by `/api/talos/cookbook/*`.
                    </p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <Badge :tone="profile ? 'success' : 'warning'">{{ profile ? 'hardware scanned' : 'no scan' }}</Badge>
                    <Badge tone="neutral">{{ runtimeCount }} runtimes</Badge>
                    <Badge tone="neutral">{{ modelCount }} models</Badge>
                </div>
            </div>
        </div>

        <div class="space-y-4 p-4">
            <div v-if="errorMessage" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <AlertCircle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ errorMessage }}</span>
            </div>

            <div v-if="actionMessage" class="flex items-start gap-2 rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <CheckCircle2 class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-success)]" />
                <span>{{ actionMessage }}</span>
            </div>

            <div class="flex items-center gap-2">
                <Tabs
                    :model-value="activeTab"
                    :items="tabs"
                    label="Cookbook panels"
                    tab-id-prefix="talos-cookbook-tab"
                    panel-id-prefix="talos-cookbook-panel"
                    @update:model-value="activeTab = $event as CookbookTab"
                >
                    <template #tab="{ item }">
                        <component :is="item.icon" class="h-4 w-4" />
                        <span>{{ item.label }}</span>
                    </template>
                    <template #item-action="{ item }">
                        <TalosGuideInfoButton
                            :guide-id="`cookbook.${item.id}`"
                            compact
                            side="bottom"
                        />
                    </template>
                </Tabs>
                <div v-if="loading" class="flex shrink-0 items-center gap-2 px-2 text-xs text-[var(--talos-muted)]">
                    <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                    Syncing
                </div>
            </div>

            <div
                :id="`talos-cookbook-panel-${activeTab}`"
                role="tabpanel"
                :aria-labelledby="`talos-cookbook-tab-${activeTab}`"
            >
                <TalosCookbookLaunch
                    v-if="activeTab === 'launch'"
                    :overview="overview"
                    :models="models"
                    :loading="loading"
                    @scan="runHardwareScan"
                    @refresh="loadModels"
                />
                <TalosCookbookDownload
                    v-else-if="activeTab === 'download'"
                    v-model:selected-model-id="selectedModelId"
                    v-model:selected-runtime="selectedRuntime"
                    :models="models"
                    :runtimes="runtimes"
                    :preview="downloadPreview"
                    :loading="loading"
                    @preview="runDownloadPreview"
                />
                <TalosCookbookDependencies
                    v-else-if="activeTab === 'dependencies'"
                    :runtimes="runtimes"
                    :dependency-catalog="dependencyCatalog"
                    :dependency-preview="dependencyPreview"
                    :loading="loading"
                    @preview="runDependencyPreview"
                />
                <TalosCookbookSettings
                    v-else
                    v-model:selected-model-id="selectedModelId"
                    v-model:selected-runtime="selectedRuntime"
                    :models="models"
                    :runtimes="runtimes"
                    :preview="servePreview"
                    :loading="loading"
                    @preview="runServePreview"
                />
            </div>
        </div>
    </Surface>
</template>
