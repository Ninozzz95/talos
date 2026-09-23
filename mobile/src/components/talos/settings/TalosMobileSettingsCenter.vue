<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type Component } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Bell, Bot, BrainCircuit, ChevronRight, Globe2, Languages, Mail, Palette, Search, Settings, Shield, ShieldCheck, Smartphone, DatabaseBackup, User, Volume2, Wrench } from '@lucide/vue'
import { useTalosSheetNav } from '@/composables/useTalosSheetNav'
import { useTalosMediaQuery } from '@/composables/useTalosMediaQuery'
import { useTalosAccountStore } from '@/stores/account'
import TalosAccountAvatar from '@/components/talos/TalosAccountAvatar.vue'
import TalosMobileSettingsAiDefaultsPanel from './TalosMobileSettingsAiDefaultsPanel.vue'
import TalosMobileSettingsAppearancePanel from './TalosMobileSettingsAppearancePanel.vue'
import TalosMobileSettingsLanguagePanel from './TalosMobileSettingsLanguagePanel.vue'
import TalosMobileVoiceSettings from './TalosMobileVoiceSettings.vue'
import TalosMobileSettingsPrivacyPanel from './TalosMobileSettingsPrivacyPanel.vue'
import TalosMobileSettingsBackupPanel from './TalosMobileSettingsBackupPanel.vue'
import TalosMobileSettingsBrowserPanel from './TalosMobileSettingsBrowserPanel.vue'
import TalosMobileSettingsAccountPanel from './TalosMobileSettingsAccountPanel.vue'
import TalosMobileSettingsAgentToolsPanel from './TalosMobileSettingsAgentToolsPanel.vue'
import TalosMobileSettingsCapabilityPanel from './TalosMobileSettingsCapabilityPanel.vue'
import TalosMobileSettingsSearchPanel from './TalosMobileSettingsSearchPanel.vue'
import {
    TALOS_MOBILE_SETTINGS_ACCOUNT_TAB,
    TALOS_MOBILE_SETTINGS_GROUPS,
    TALOS_MOBILE_SETTINGS_MODEL_LAB_TAB,
    TALOS_MOBILE_SETTINGS_TABS,
    talosMobileSettingsTab,
    type TalosMobileSettingsTab,
    type TalosMobileSettingsTabId,
} from './settingsTabs'

const props = withDefaults(defineProps<{
    requestedTab?: string | null
}>(), {
    requestedTab: null,
})

/**
 * Which category is OPEN — the answer the address bar needs.
 *
 * `?tab=` was one-way: the query could open a category, and nothing ever wrote
 * back. So the moment anyone touched the list the URL was describing a screen
 * that was no longer there — and a deep link copied out of it reopened
 * somewhere else. Null when nothing is open, which on the phone is a real
 * state: the list is showing and no panel is.
 */
const emit = defineEmits<{ 'update:openTab': [tab: TalosMobileSettingsTabId | null] }>()

const { t } = useTalosI18n()

const activeTab = ref<TalosMobileSettingsTabId>('ai_defaults')
const mobilePane = ref<'categories' | 'detail'>('categories')
function localizedTab(tab: TalosMobileSettingsTab): TalosMobileSettingsTab {
    return {
        ...tab,
        label: t(`settingsCenter.tabs.${tab.id}.label`),
        description: t(`settingsCenter.tabs.${tab.id}.description`),
        gateReason: tab.gateReason ? t(`settingsCenter.tabs.${tab.id}.gate`) : undefined,
    }
}
const localizedTabs = computed(() => TALOS_MOBILE_SETTINGS_TABS.map(localizedTab))
const selectedTab = computed(() => localizedTabs.value.find((tab) => tab.id === activeTab.value)
    ?? localizedTab(talosMobileSettingsTab(activeTab.value)))
const accountTab = computed(() => localizedTab(talosMobileSettingsTab(TALOS_MOBILE_SETTINGS_ACCOUNT_TAB)))
// Resolve each grouped tab once (label + availability) rather than running the
// linear settingsTab() lookup twice per row on every render.
const resolvedGroups = computed(() => TALOS_MOBILE_SETTINGS_GROUPS.map((group) => ({
    // ⛔ La chiave NON tradotta serve a decidere DOVE va il controllo del
    // telefono: confrontare l'etichetta tradotta lo farebbe sparire appena
    // qualcuno cambia lingua.
    chiave: group.label,
    label: t(`settingsCenter.groups.${group.label.toLowerCase()}`),
    tabs: group.tabIds.map((id) => localizedTab(talosMobileSettingsTab(id))),
})))
const account = useTalosAccountStore()
const developmentMode = import.meta.env.DEV
// Match the Calm phone breakpoint: one pane and one contextual Back through 860px.
const sheetNav = useTalosSheetNav()
const isMdLayout = useTalosMediaQuery('(min-width: 861px)')
const categoryRoot = ref<HTMLElement | null>(null)
const detailRoot = ref<HTMLElement | null>(null)
const mobileMotionPane = ref<'categories' | 'detail' | null>(null)
let mobileMotionRevision = 0

function settingsTabDurationMs(root: HTMLElement): number {
    const raw = getComputedStyle(root)
        .getPropertyValue('--talos-motion-duration-tab-change')
        .trim()
        .toLowerCase()
    const value = Number.parseFloat(raw)
    if (!Number.isFinite(value) || value <= 0) return 0
    if (raw.endsWith('ms')) return value
    if (raw.endsWith('s')) return value * 1_000
    return 0
}

function settingsReducedMotionRequested(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

async function runMobilePaneMotion(pane: 'categories' | 'detail'): Promise<void> {
    const revision = ++mobileMotionRevision
    mobileMotionPane.value = null
    mobilePane.value = pane
    await nextTick()
    if (revision !== mobileMotionRevision || (isMdLayout.value && pane === 'detail')) return

    const target = pane === 'detail'
        ? detailRoot.value
        : categoryRoot.value?.querySelector<HTMLElement>(
            `[data-settings-tab="${activeTab.value}"]`,
        ) ?? null
    target?.focus({ preventScroll: true })
    if (isMdLayout.value) return

    const motionRoot = pane === 'detail' ? detailRoot.value : categoryRoot.value
    if (
        !motionRoot
        || settingsReducedMotionRequested()
        || settingsTabDurationMs(motionRoot) <= 0
    ) return
    mobileMotionPane.value = pane
}

function clearMobilePaneMotion(
    pane: 'categories' | 'detail',
    event: AnimationEvent,
): void {
    const root = pane === 'detail' ? detailRoot.value : categoryRoot.value
    if (event.target !== root || mobileMotionPane.value !== pane) return
    if (event.animationName && event.animationName !== 'talos-settings-tab-change') return
    mobileMotionPane.value = null
}

function openDetail(): void { void runMobilePaneMotion('detail') }
function backToCategories(): void { void runMobilePaneMotion('categories') }
watch([mobilePane, selectedTab, isMdLayout], ([pane, tab, md]) => {
    if (pane === 'detail' && !md) sheetNav.setSubView({ title: tab.label, back: backToCategories })
    else sheetNav.clear()
}, { immediate: true })

// Owner 2026-07-25: opening a panel kept the category list's scroll offset, so
// Appearance appeared to start at "Color mode" (Theme preset was above the fold).
// Every panel now opens at its top.
watch([mobilePane, activeTab], async ([pane]) => {
    if (pane !== 'detail') return
    await nextTick()
    const scroller = detailRoot.value?.closest<HTMLElement>('.overflow-y-auto')
    scroller?.scrollTo({ top: 0 })
})
onBeforeUnmount(() => { sheetNav.clear() })

/** The overview has no open category at any width. */
const openTab = computed<TalosMobileSettingsTabId | null>(
    () => mobilePane.value === 'detail' ? activeTab.value : null,
)
watch(openTab, (tab) => { emit('update:openTab', tab) })

watch(() => props.requestedTab, (requested) => {
    if (!requested) {
        if (mobilePane.value !== 'categories') backToCategories()
        return
    }
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
    voice: Volume2,
    language: Languages,
    privacy: ShieldCheck,
    backup: DatabaseBackup,
    account: User,
    agent_tools: Shield,
    system: Settings,
}

function rowId(id: TalosMobileSettingsTabId): string {
    return `talos-settings-row-${id}`
}

/**
 * Panels mount on first visit and stay mounted — which is what Reka's Presence
 * did, and worth keeping deliberately rather than inheriting. Mounting all
 * thirteen up front would pull the whole settings tree into the first paint
 * ("loads the heavy Catalog only when selected" is an existing test); throwing
 * each away on leaving would re-run `controller.init()` every time someone
 * glanced at Model Lab.
 */
const visited = ref(new Set<TalosMobileSettingsTabId>())
watch(activeTab, (id) => { visited.value = new Set(visited.value).add(id) }, { immediate: true })
const renderedTabs = computed(() => localizedTabs.value.filter((tab) => visited.value.has(tab.id)))

function selectRow(id: TalosMobileSettingsTabId): void {
    activeTab.value = id
    openDetail()
}

const LOCAL_PANELS: Partial<Record<TalosMobileSettingsTabId, Component>> = {
    ai_defaults: TalosMobileSettingsAiDefaultsPanel,
    search: TalosMobileSettingsSearchPanel,
    appearance: TalosMobileSettingsAppearancePanel,
    voice: TalosMobileVoiceSettings,
    language: TalosMobileSettingsLanguagePanel,
    privacy: TalosMobileSettingsPrivacyPanel,
    backup: TalosMobileSettingsBackupPanel,
    account: TalosMobileSettingsAccountPanel,
    agent_tools: TalosMobileSettingsAgentToolsPanel,
}

</script>

<template>
    <div
        data-testid="settings-list-detail"
        class="settings-center"
        :class="mobilePane === 'detail' ? 'settings-layout' : 'settings-home'"
    >
        <nav
            ref="categoryRoot"
            data-testid="settings-category-pane"
            class="settings-menu"
            :class="mobilePane === 'detail' && !isMdLayout ? 'hidden' : ''"
            :data-talos-motion-intent="mobileMotionPane === 'categories' ? 'tab-change' : undefined"
            :aria-label="t('settingsCenter.talosCategories')"
            @animationend="clearMobilePaneMotion('categories', $event)"
        >
            <div data-testid="settings-category-list" class="settings-category-list">
                <button
                    v-if="mobilePane === 'detail'"
                    type="button"
                    data-testid="settings-all-link"
                    class="settings-row settings-nav-row talos-pressable"
                    @click="backToCategories"
                >
                    <Settings aria-hidden="true" />
                    <span>{{ t('settingsCenter.allSettings') }}</span>
                </button>
                <button
                    type="button"
                    :id="rowId(TALOS_MOBILE_SETTINGS_ACCOUNT_TAB)"
                    :aria-current="openTab === TALOS_MOBILE_SETTINGS_ACCOUNT_TAB ? 'page' : undefined"
                    :data-settings-tab="TALOS_MOBILE_SETTINGS_ACCOUNT_TAB"
                    :data-state="openTab === TALOS_MOBILE_SETTINGS_ACCOUNT_TAB ? 'active' : 'inactive'"
                    class="settings-row talos-pressable"
                    :class="mobilePane === 'detail' ? 'settings-account-link settings-nav-row' : 'account-card'"
                    @click="selectRow(TALOS_MOBILE_SETTINGS_ACCOUNT_TAB)"
                >
                    <TalosAccountAvatar v-if="mobilePane === 'categories'" size="md" />
                    <User v-else aria-hidden="true" />
                    <span class="settings-row-copy">
                        <strong>{{ mobilePane === 'categories' ? account.state.display_name || accountTab.label : accountTab.label }}</strong>
                        <small v-if="mobilePane === 'categories'">{{ t('settingsCenter.localIdentity') }}</small>
                    </span>
                    <ChevronRight aria-hidden="true" />
                </button>

                <section v-for="group in resolvedGroups" :key="group.chiave" class="settings-group">
                    <h3 data-testid="settings-group-heading">{{ group.label }}</h3>
                    <div class="settings-group-list">
                        <RouterLink
                            v-if="group.chiave === 'Intelligence'"
                            :to="{ name: 'settings-privilege' }"
                            data-testid="settings-privilege-link"
                            class="settings-row talos-pressable"
                        >
                            <Smartphone aria-hidden="true" />
                            <span class="settings-row-copy">
                                <strong>{{ t('privilege.pageTitle') }}</strong>
                                <small v-if="mobilePane === 'categories'">{{ t('settingsCenter.phoneDescription') }}</small>
                            </span>
                            <ChevronRight aria-hidden="true" />
                        </RouterLink>
                        <template v-for="tab in group.tabs" :key="tab.id">
                            <RouterLink
                                v-if="tab.id === TALOS_MOBILE_SETTINGS_MODEL_LAB_TAB"
                                :id="rowId(tab.id)"
                                :to="{ name: 'settings-models' }"
                                data-testid="settings-model-lab-link"
                                :data-settings-route="tab.id"
                                class="settings-row talos-pressable"
                            >
                                <component :is="ICONS[tab.id]" aria-hidden="true" />
                                <span class="settings-row-copy">
                                    <strong>{{ tab.label }}</strong>
                                    <small v-if="mobilePane === 'categories'">{{ tab.description }}</small>
                                </span>
                                <ChevronRight aria-hidden="true" />
                            </RouterLink>
                            <button
                                v-else
                                type="button"
                                :id="rowId(tab.id)"
                                :aria-current="openTab === tab.id ? 'page' : undefined"
                                :data-settings-tab="tab.id"
                                :data-state="openTab === tab.id ? 'active' : 'inactive'"
                                class="settings-row talos-pressable"
                                @click="selectRow(tab.id)"
                            >
                                <component :is="ICONS[tab.id]" aria-hidden="true" />
                                <span class="settings-row-copy">
                                    <strong>{{ tab.label }}</strong>
                                    <small v-if="mobilePane === 'categories'">{{ tab.description }}</small>
                                    <small v-if="tab.availability === 'gated'">{{ t('settingsCenter.notInstalled') }}</small>
                                </span>
                                <ChevronRight aria-hidden="true" />
                            </button>
                        </template>
                    </div>
                </section>
            </div>
        </nav>

        <section
            ref="detailRoot"
            data-testid="settings-detail-pane"
            tabindex="-1"
            class="settings-detail"
            :class="mobilePane === 'categories' ? 'hidden' : ''"
            :data-talos-motion-intent="mobileMotionPane === 'detail' ? 'tab-change' : undefined"
            :aria-label="t('settingsCenter.detailLabel', { tab: selectedTab.label })"
            @animationend="clearMobilePaneMotion('detail', $event)"
        >
            <div
                v-for="tab in renderedTabs"
                :key="tab.id"
                :id="`talos-settings-panel-${tab.id}`"
                role="region"
                :aria-labelledby="rowId(tab.id)"
                :hidden="tab.id !== activeTab"
                :data-settings-panel="tab.id"
                :data-state="tab.id === activeTab ? 'active' : 'inactive'"
                class="talos-motion-tab-panel outline-none"
            >
                <header class="settings-detail-header">
                    <h2 class="talos-title">{{ tab.label }}</h2>
                    <p class="panel-intro">{{ tab.description }}</p>
                </header>
                <TalosMobileSettingsBrowserPanel
                    v-if="tab.id === 'browser'"
                    :development-mode="developmentMode"
                />
                <component
                    :is="LOCAL_PANELS[tab.id]"
                    v-else-if="tab.availability === 'available' && LOCAL_PANELS[tab.id]"
                    @vai-al-motore="selectRow('search')"
                />
                <TalosMobileSettingsCapabilityPanel v-else :tab="tab" />
            </div>
        </section>
    </div>
</template>

<style scoped>
.settings-center {
    height: 100%;
    min-height: 0;
    padding-top: var(--talos-space-page);
}
.settings-home { max-width: 49rem; margin-inline: auto; }
.settings-menu { height: 100%; min-height: 0; }
.settings-category-list {
    display: flex;
    flex-direction: column;
    gap: var(--talos-space-section);
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-bottom: var(--talos-space-page);
}
.settings-group h3 {
    margin: 0 var(--talos-space-inline) var(--talos-space-inline);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--talos-muted);
}
.settings-group-list {
    overflow: hidden;
    border: 1px solid var(--talos-border);
    border-radius: var(--talos-radius-card);
}
.settings-row {
    display: flex;
    align-items: center;
    gap: var(--talos-space-inline);
    width: 100%;
    min-height: 4rem;
    padding: var(--talos-space-inline) var(--talos-space-card);
    text-align: left;
    color: var(--talos-text);
}
.settings-row + .settings-row { border-top: 1px solid var(--talos-border); }
.settings-row:hover, .settings-row[aria-current="page"] { background: var(--talos-active); }
.settings-row:focus-visible { outline: 2px solid var(--talos-ring); outline-offset: -2px; }
.settings-row > :deep(svg) { width: var(--talos-icon-size); height: var(--talos-icon-size); flex-shrink: 0; color: var(--talos-muted); }
.settings-row-copy { flex: 1; min-width: 0; }
.settings-row strong { display: block; font-size: var(--text-sm); font-weight: 500; }
.settings-row small { display: block; margin-top: .25rem; font-size: var(--text-xs); line-height: 1.5; color: var(--talos-muted); }
.account-card { border: 1px solid var(--talos-border); border-radius: var(--talos-radius-card); background: var(--talos-panel); }
.settings-account-link { order: 1; }
.settings-detail {
    height: 100%;
    min-width: 0;
    max-width: 49rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-bottom: var(--talos-space-page);
}
.settings-detail-header { margin-bottom: var(--talos-space-section); }
.settings-detail h2 { display: none; font-size: calc(1.375rem * var(--talos-ui-scale, 1)); font-weight: 550; }
.panel-intro { color: var(--talos-muted); font-size: var(--text-sm); line-height: 1.7; margin-top: var(--talos-space-inline); }
@media (min-width: 768px) {
    .settings-center { padding: var(--talos-space-page); }
}
@media (min-width: 861px) {
    .settings-layout { display: grid; grid-template-columns: 16rem minmax(0, 1fr); gap: var(--talos-space-section); }
    .settings-layout .settings-menu { border-right: 1px solid var(--talos-border); padding-right: var(--talos-space-page); }
    .settings-layout .settings-group-list { border: 0; border-radius: 0; }
    .settings-layout .settings-row { min-height: 2.75rem; border: 0; border-radius: var(--talos-radius-control); }
    .settings-layout .settings-row > :deep(svg:last-child:not(:first-child)) { display: none; }
    .settings-detail h2 { display: block; }
}
@media (min-width: 861px) and (max-width: 1150px) {
    .settings-layout { grid-template-columns: 13rem minmax(0, 1fr); }
}
</style>
