<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Bot, Boxes, KeyRound, SlidersHorizontal } from '@lucide/vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import TalosMobileProviderRuntimePanel from '@/components/talos/models/TalosMobileProviderRuntimePanel.vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import { talosMobileModelProfileIsCallable, talosMobileProviderById } from '@/lib/mobileProviders'
import { useChatController } from '@/stores/chatController'

const controller = useChatController()
const { t } = useTalosI18n()
const activeTab = ref<'providers' | 'catalog'>('providers')
const TalosMobileModelCatalog = defineAsyncComponent(
    () => import('@/components/talos/models/TalosMobileModelCatalog.vue'),
)
const TalosMobileModelAdvancedOptions = defineAsyncComponent(
    () => import('@/components/talos/models/TalosMobileModelAdvancedOptions.vue'),
)
const modelItems = computed(() => controller.profiles.value
    .map((profile) => ({
        value: profile.id,
        label: `${talosMobileProviderById(profile.provider).label} - ${profile.display_name}`,
        disabled: !profile.show_in_composer || !talosMobileModelProfileIsCallable(profile),
    })))
const tabClass = 'inline-flex min-h-11 flex-1 items-center justify-center gap-2 border-b-2 border-transparent px-3 text-sm font-semibold text-[var(--talos-muted)] outline-none data-[state=active]:border-[var(--talos-accent)] data-[state=active]:text-[var(--talos-text)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]'

onMounted(() => { void controller.init() })
</script>

<template>
    <div class="min-w-0 space-y-5">
        <section :aria-label="t('models.defaultModel')" data-testid="settings-models" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
            <h4 class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                <Bot class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ t('models.defaultModel') }}
            </h4>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ t('models.sharedSelection') }}</p>
            <TalosThemedSelect
                v-if="modelItems.length"
                class="mt-3"
                :model-value="controller.selectedModelId.value ?? ''"
                :items="modelItems"
                :aria-label="t('models.defaultChatModel')"
                :placeholder="t('models.selectDiscovered')"
                @update:model-value="controller.selectModel"
            />
            <p v-else class="mt-3 text-xs leading-5 text-[var(--talos-muted)]">{{ t('models.configureToBegin') }}</p>
        </section>

        <TabsRoot v-model="activeTab" activation-mode="automatic" orientation="horizontal" class="min-w-0">
            <TabsList :aria-label="t('models.labSections')" class="flex border-b border-[var(--talos-border)]">
                <TabsTrigger value="providers" :class="tabClass">
                    <KeyRound class="size-4" aria-hidden="true" /> {{ t('models.providers') }}
                </TabsTrigger>
                <TabsTrigger value="catalog" :class="tabClass">
                    <Boxes class="size-4" aria-hidden="true" /> {{ t('models.catalog') }}
                </TabsTrigger>
            </TabsList>

            <TabsContent
                value="providers"
                data-model-lab-section="providers"
                class="talos-motion-tab-panel mt-4 min-w-0 outline-none"
            >
                <TalosMobileProviderRuntimePanel />
                <details class="mt-4 rounded-md border border-[var(--talos-border)] bg-[var(--talos-background)] p-3">
                    <summary class="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                        <SlidersHorizontal class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ t('models.advancedManualModels') }}
                    </summary>
                    <div class="mt-3">
                        <TalosMobileModelAdvancedOptions />
                    </div>
                </details>
            </TabsContent>

            <TabsContent
                value="catalog"
                data-model-lab-section="catalog"
                class="talos-motion-tab-panel mt-4 min-w-0 outline-none"
            >
                <TalosMobileModelCatalog />
            </TabsContent>
        </TabsRoot>
    </div>
</template>
