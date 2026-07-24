<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, type Component } from 'vue'
import { Bell, Bot, BrainCircuit, ChevronRight, Globe2, Mail, Palette, Search, Settings, Shield, User, Wrench } from '@lucide/vue'
import { useTalosSheetNav } from '@/composables/useTalosSheetNav'
import { useTalosMediaQuery } from '@/composables/useTalosMediaQuery'
import { useTalosAccountStore } from '@/stores/account'
import TalosAccountAvatar from '@/components/talos/TalosAccountAvatar.vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import TalosMobileSettingsModelsPanel from './TalosMobileSettingsModelsPanel.vue'
import TalosMobileSettingsAiDefaultsPanel from './TalosMobileSettingsAiDefaultsPanel.vue'
import TalosMobileSettingsAppearancePanel from './TalosMobileSettingsAppearancePanel.vue'
import TalosMobileSettingsBrowserPanel from './TalosMobileSettingsBrowserPanel.vue'
import TalosMobileSettingsAccountPanel from './TalosMobileSettingsAccountPanel.vue'
import TalosMobileSettingsCapabilityPanel from './TalosMobileSettingsCapabilityPanel.vue'
import {
    TALOS_MOBILE_SETTINGS_ACCOUNT_TAB,
    TALOS_MOBILE_SETTINGS_GROUPS,
    TALOS_MOBILE_SETTINGS_TABS,
    talosMobileSettingsTab,
    type TalosMobileSettingsTabId,
} from './settingsTabs'

const props = withDefaults(defineProps<{
    requestedTab?: string | null
}>(), {
    requestedTab: null,
})

const activeTab = ref<TalosMobileSettingsTabId>('models')
const mobilePane = ref<'categories' | 'detail'>('categories')
const selectedTab = computed(() => talosMobileSettingsTab(activeTab.value))
const accountTab = talosMobileSettingsTab(TALOS_MOBILE_SETTINGS_ACCOUNT_TAB)
// Resolve each grouped tab once (label + availability) rather than running the
// linear settingsTab() lookup twice per row on every render.
const resolvedGroups = computed(() => TALOS_MOBILE_SETTINGS_GROUPS.map((group) => ({
    label: group.label,
    tabs: group.tabIds.map((id) => talosMobileSettingsTab(id)),
})))
const account = useTalosAccountStore()
const developmentMode = import.meta.env.DEV

// Owner 2026-07-24: drive the sheet header — in a detail pane the header shows
// the subsection name and its Back returns to the categories list (ONE back,
// no in-body second arrow). SF-critic M1: this must engage ONLY on the phone
// master-detail. At the md breakpoint (≥768px) both panes are side-by-side
// (md:block), so a sub-view there would show a spurious Back + wrong title.
// Gate on the SAME 768px md media query that drives the layout (not the
// tablet-split threshold, which adds a min-height and would leave a broken band).
const sheetNav = useTalosSheetNav()
const isMdLayout = useTalosMediaQuery('(min-width: 768px)')
function openDetail(): void { mobilePane.value = 'detail' }
function backToCategories(): void { mobilePane.value = 'categories' }
watch([mobilePane, selectedTab, isMdLayout], ([pane, tab, md]) => {
    if (pane === 'detail' && !md) sheetNav.setSubView({ title: tab.label, back: backToCategories })
    else sheetNav.clear()
}, { immediate: true })
onBeforeUnmount(() => { sheetNav.clear() })

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

</script>

<template>
    <!-- Owner 2026-07-24: the framed card was redundant nesting inside the
         sheet — on mobile the categories/detail go FULL-WIDTH with the coherent
         parent padding; the framed side-by-side stays on tablet (md). -->
    <TabsRoot v-model="activeTab" orientation="vertical" activation-mode="automatic" class="flex flex-col md:min-h-[540px] md:flex-row md:overflow-hidden md:rounded-md md:border md:border-[var(--talos-border)] md:bg-[var(--talos-card)]">
        <aside
            data-testid="settings-category-pane"
            class="md:block md:min-h-0 md:w-56 md:flex-none md:border-r md:border-[var(--talos-border)] md:bg-[var(--talos-sidebar)]/80 md:p-3"
            :class="mobilePane === 'detail' ? 'hidden' : 'block'"
            aria-label="Settings categories"
        >
            <!-- Owner 2026-07-24 (Claude-style): account summary card on top +
                 grouped rounded cards (icon · label · gated hint · chevron).
                 Uniform radius (rounded-xl ≈ 12px). -->
            <TabsList aria-label="TALOS settings categories" class="flex max-h-none w-full flex-col gap-5 px-4 py-4 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:px-0 md:py-0">
                <TabsTrigger
                    :value="TALOS_MOBILE_SETTINGS_ACCOUNT_TAB"
                    :data-settings-tab="TALOS_MOBILE_SETTINGS_ACCOUNT_TAB"
                    class="talos-pressable flex w-full items-center gap-3 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] data-[state=active]:border-[var(--talos-accent-border)] data-[state=active]:bg-[var(--talos-active)]"
                    @click="openDetail"
                >
                    <TalosAccountAvatar size="md" />
                    <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-semibold text-[var(--talos-text)]">{{ account.state.display_name || accountTab.label }}</span>
                        <span class="block truncate text-xs text-[var(--talos-muted)]">Local workspace identity</span>
                    </span>
                    <ChevronRight class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                </TabsTrigger>

                <div v-for="group in resolvedGroups" :key="group.label" class="w-full">
                    <p class="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ group.label }}</p>
                    <div class="divide-y divide-[var(--talos-border)] overflow-hidden rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]">
                        <TabsTrigger
                            v-for="tab in group.tabs"
                            :key="tab.id"
                            :value="tab.id"
                            :data-settings-tab="tab.id"
                            class="talos-pressable flex min-h-14 w-full items-center gap-3 px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--talos-ring)] data-[state=active]:bg-[var(--talos-active)]"
                            @click="openDetail"
                        >
                            <component :is="ICONS[tab.id]" class="size-5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                            <span class="min-w-0 flex-1">
                                <span class="block truncate text-sm text-[var(--talos-text)]">{{ tab.label }}</span>
                                <span v-if="tab.availability === 'gated'" class="block truncate text-xs text-[var(--talos-muted)]">Not installed in this build</span>
                            </span>
                            <ChevronRight class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                        </TabsTrigger>
                    </div>
                </div>
            </TabsList>
        </aside>

        <section
            data-testid="settings-detail-pane"
            class="min-w-0 px-4 py-2 md:flex-1 md:overflow-y-auto md:px-4 md:py-0"
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
                    <h3 class="talos-serif hidden text-base font-semibold text-[var(--talos-text)] md:mt-1 md:block">{{ tab.label }}</h3>
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
