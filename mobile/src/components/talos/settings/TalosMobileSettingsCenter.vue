<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, type Component } from 'vue'
import { Bell, Bot, BrainCircuit, Globe2, Mail, Palette, Search, Settings, Shield, User, Wrench } from '@lucide/vue'
import { useTalosSheetNav } from '@/composables/useTalosSheetNav'
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

// Owner 2026-07-24: drive the sheet header — in a detail pane the header shows
// the subsection name and its Back returns to the categories list (ONE back,
// no in-body second arrow). Only meaningful on the mobile master-detail; the
// md side-by-side never enters a "detail-only" pane.
const sheetNav = useTalosSheetNav()
function openDetail(): void { mobilePane.value = 'detail' }
function backToCategories(): void { mobilePane.value = 'categories' }
watch([mobilePane, selectedTab], ([pane, tab]) => {
    if (pane === 'detail') sheetNav.setSubView({ title: tab.label, back: backToCategories })
    else sheetNav.clear()
}, { immediate: true })
onBeforeUnmount(() => sheetNav.clear())

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
    <!-- Owner 2026-07-24: the framed card was redundant nesting inside the
         sheet — on mobile the categories/detail go FULL-WIDTH with the coherent
         parent padding; the framed side-by-side stays on tablet (md). -->
    <TabsRoot v-model="activeTab" orientation="vertical" activation-mode="automatic" class="flex min-h-0 flex-col overflow-hidden md:min-h-[540px] md:flex-row md:rounded-md md:border md:border-[var(--talos-border)] md:bg-[var(--talos-card)]">
        <aside
            data-testid="settings-category-pane"
            class="min-h-0 flex-1 md:block md:w-56 md:flex-none md:border-r md:border-[var(--talos-border)] md:bg-[var(--talos-sidebar)]/80 md:p-3"
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
                    @click="openDetail"
                >
                    <component :is="ICONS[tab.id]" class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <span class="min-w-0 flex-1 truncate">{{ tab.label }}</span>
                    <span v-if="tab.availability === 'gated'" class="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--talos-muted)]" aria-hidden="true" />
                </TabsTrigger>
            </TabsList>
        </aside>

        <section
            data-testid="settings-detail-pane"
            class="min-w-0 flex-1 overflow-y-auto md:block md:p-4"
            :class="mobilePane === 'categories' ? 'hidden' : 'block'"
            :aria-label="`${selectedTab.label} settings`"
        >
            <!-- Owner 2026-07-24: the in-body "Categories" back is GONE — the
                 sheet header's single contextual Back now returns to the list. -->
            <TabsContent
                v-for="tab in TALOS_MOBILE_SETTINGS_TABS"
                :key="tab.id"
                :value="tab.id"
                :data-settings-panel="tab.id"
                class="outline-none"
            >
                <!-- Owner: the sheet header already shows the subsection title on
                     mobile — drop the duplicate eyebrow/title there, keep the
                     one-line description; the md side-by-side keeps the full
                     header (its sheet title stays "Settings Center"). -->
                <header class="mb-4 border-b border-[var(--talos-border)] pb-3">
                    <div class="hidden text-[10px] font-semibold uppercase text-[var(--talos-muted)] md:block">Protected preferences</div>
                    <h3 class="hidden text-base font-semibold text-[var(--talos-text)] md:mt-1 md:block">{{ tab.label }}</h3>
                    <p class="text-xs leading-5 text-[var(--talos-muted)] md:mt-1">{{ tab.description }}</p>
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
