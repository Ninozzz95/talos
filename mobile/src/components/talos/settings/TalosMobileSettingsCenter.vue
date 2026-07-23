<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { ArrowLeft, Bell, Bot, BrainCircuit, Globe2, Mail, Palette, Search, Settings, Shield, User, Wrench } from '@lucide/vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import TalosMobileSettingsModelsPanel from './TalosMobileSettingsModelsPanel.vue'
import TalosMobileSettingsAiDefaultsPanel from './TalosMobileSettingsAiDefaultsPanel.vue'
import TalosMobileSettingsAppearancePanel from './TalosMobileSettingsAppearancePanel.vue'
import TalosMobileSettingsBrowserPanel from './TalosMobileSettingsBrowserPanel.vue'
import TalosMobileSettingsAccountPanel from './TalosMobileSettingsAccountPanel.vue'
import TalosMobileSettingsCapabilityPanel from './TalosMobileSettingsCapabilityPanel.vue'
import { TALOS_MOBILE_SETTINGS_TABS, talosMobileSettingsTab, type TalosMobileSettingsTabId } from './settingsTabs'

const props = withDefaults(defineProps<{
    requestedTab?: string | null
}>(), {
    requestedTab: null,
})

const activeTab = ref<TalosMobileSettingsTabId>('models')
const mobilePane = ref<'categories' | 'detail'>('categories')
const selectedTab = computed(() => talosMobileSettingsTab(activeTab.value))
const developmentMode = import.meta.env.DEV

watch(() => props.requestedTab, (requested) => {
    if (!requested) return
    const match = TALOS_MOBILE_SETTINGS_TABS.find((tab) => tab.id === requested)
    if (!match) return
    activeTab.value = match.id
    mobilePane.value = 'detail'
}, { immediate: true })

const ICONS: Record<TalosMobileSettingsTabId, Component> = {
    models: Bot,
    ai_defaults: BrainCircuit,
    search: Search,
    browser: Globe2,
    integrations: Wrench,
    email: Mail,
    reminders: Bell,
    appearance: Palette,
    account: User,
    agent_tools: Shield,
    system: Settings,
}

const LOCAL_PANELS: Partial<Record<TalosMobileSettingsTabId, Component>> = {
    models: TalosMobileSettingsModelsPanel,
    ai_defaults: TalosMobileSettingsAiDefaultsPanel,
    appearance: TalosMobileSettingsAppearancePanel,
    account: TalosMobileSettingsAccountPanel,
}

const triggerClass = 'flex min-h-11 w-full items-center gap-2 rounded-md border border-transparent px-2 text-left text-sm font-medium text-[var(--talos-muted)] outline-none transition-colors data-[state=active]:border-[var(--talos-accent-border)] data-[state=active]:bg-[var(--talos-panel)] data-[state=active]:text-[var(--talos-text)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]'
</script>

<template>
    <TabsRoot v-model="activeTab" orientation="vertical" activation-mode="automatic" class="flex min-h-0 flex-col overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] md:min-h-[540px] md:flex-row">
        <aside
            data-testid="settings-category-pane"
            class="min-h-0 flex-1 border-b border-[var(--talos-border)] bg-[var(--talos-sidebar)]/80 p-3 md:block md:w-56 md:flex-none md:border-b-0 md:border-r"
            :class="mobilePane === 'detail' ? 'hidden' : 'block'"
            aria-label="Settings categories"
        >
            <TabsList aria-label="TALOS settings categories" class="flex max-h-none w-full flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pr-1">
                <TabsTrigger
                    v-for="tab in TALOS_MOBILE_SETTINGS_TABS"
                    :key="tab.id"
                    :value="tab.id"
                    :data-settings-tab="tab.id"
                    :class="triggerClass"
                    @click="mobilePane = 'detail'"
                >
                    <component :is="ICONS[tab.id]" class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <span class="min-w-0 flex-1 truncate">{{ tab.label }}</span>
                    <span v-if="tab.availability === 'gated'" class="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--talos-muted)]" aria-hidden="true" />
                </TabsTrigger>
            </TabsList>
        </aside>

        <section
            data-testid="settings-detail-pane"
            class="min-w-0 flex-1 overflow-y-auto p-4 md:block"
            :class="mobilePane === 'categories' ? 'hidden' : 'block'"
            :aria-label="`${selectedTab.label} settings`"
        >
            <button
                type="button"
                aria-label="Back to settings categories"
                class="mb-3 inline-flex min-h-11 items-center gap-2 rounded-md pr-3 text-sm font-medium text-[var(--talos-muted)] md:hidden"
                @click="mobilePane = 'categories'"
            >
                <ArrowLeft class="h-4 w-4" aria-hidden="true" />
                Categories
            </button>
            <TabsContent
                v-for="tab in TALOS_MOBILE_SETTINGS_TABS"
                :key="tab.id"
                :value="tab.id"
                :data-settings-panel="tab.id"
                class="outline-none"
            >
                <header class="mb-4 border-b border-[var(--talos-border)] pb-3">
                    <div class="text-[10px] font-semibold uppercase text-[var(--talos-muted)]">Protected preferences</div>
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">{{ tab.label }}</h3>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ tab.description }}</p>
                </header>

                <TalosMobileSettingsBrowserPanel
                    v-if="tab.id === 'browser'"
                    :development-mode="developmentMode"
                />
                <component :is="LOCAL_PANELS[tab.id]" v-else-if="tab.availability === 'available' && LOCAL_PANELS[tab.id]" />
                <TalosMobileSettingsCapabilityPanel v-else :tab="tab" />
            </TabsContent>
        </section>
    </TabsRoot>
</template>
