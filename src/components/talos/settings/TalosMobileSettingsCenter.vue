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
        description: tab.id === 'appearance' ? '' : t(`settingsCenter.tabs.${tab.id}.description`),
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
// Owner 2026-07-24: drive the sheet header — in a detail pane the header shows
// the subsection name and its Back returns to the categories list (ONE back,
// no in-body second arrow). SF-critic M1: this must engage ONLY on the phone
// master-detail. At the md breakpoint (≥768px) both panes are side-by-side
// (md:block), so a sub-view there would show a spurious Back + wrong title.
// Gate on the SAME 768px md media query that drives the layout (not the
// tablet-split threshold, which adds a min-height and would leave a broken band).
const sheetNav = useTalosSheetNav()
const isMdLayout = useTalosMediaQuery('(min-width: 768px)')
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
    if (revision !== mobileMotionRevision || isMdLayout.value) return

    const target = pane === 'detail'
        ? detailRoot.value
        : categoryRoot.value?.querySelector<HTMLElement>(
            `[data-settings-tab="${activeTab.value}"]`,
        ) ?? null
    target?.focus({ preventScroll: true })

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

/**
 * On the tablet the panel is always beside the list, so a category is always
 * open. On the phone it is open only once the detail pane has taken the screen.
 */
const openTab = computed<TalosMobileSettingsTabId | null>(
    () => (isMdLayout.value || mobilePane.value === 'detail') ? activeTab.value : null,
)
watch(openTab, (tab) => { emit('update:openTab', tab) })

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
    <!-- Owner 2026-07-24: the framed card was redundant nesting inside the
         sheet — on mobile the categories/detail go FULL-WIDTH with the coherent
         parent padding; the framed side-by-side stays on tablet (md). -->
    <div
        data-testid="settings-list-detail"
        class="flex flex-col md:h-full md:min-h-0 md:flex-row md:overflow-hidden md:rounded-none md:border-0 md:bg-[var(--talos-card)]"
    >
        <!-- One navigation model at every width. Tablet changes only the
             presentation to side-by-side; routed Model Lab and inline detail
             destinations keep the same semantics and keyboard behavior. -->
        <nav
            ref="categoryRoot"
            data-testid="settings-category-pane"
            :data-talos-motion-intent="mobileMotionPane === 'categories' ? 'tab-change' : undefined"
            class="md:flex md:min-h-0 md:w-[var(--talos-tablet-sidebar-width)] md:flex-none md:flex-col md:overflow-hidden md:border-r md:border-[var(--talos-border)] md:bg-[var(--talos-sidebar)]/80 md:p-3"
            :class="mobilePane === 'detail' ? 'hidden' : 'block'"
            :aria-label="t('settingsCenter.talosCategories')"
            @animationend="clearMobilePaneMotion('categories', $event)"
        >
            <!-- Owner 2026-07-24 (Claude-style): account summary card on top +
                 grouped cards (icon · label · gated hint · chevron).
                 Group geometry follows the active TALOS Theme Engine tokens. -->
            <!-- Owner 2026-07-24: NO own horizontal padding on the phone — the
                 parent TalosMobileScreen already provides the 16px gutter (Claude
                 parity). Adding px here double-padded to 28px ("still too wide"). -->
            <div
                data-testid="settings-category-list"
                class="flex max-h-none w-full flex-col gap-5 px-0 py-2 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:px-0 md:py-0"
            >
                <button
                    type="button"
                    :id="rowId(TALOS_MOBILE_SETTINGS_ACCOUNT_TAB)"
                    :aria-current="activeTab === TALOS_MOBILE_SETTINGS_ACCOUNT_TAB ? 'page' : undefined"
                    :data-settings-tab="TALOS_MOBILE_SETTINGS_ACCOUNT_TAB"
                    :data-state="activeTab === TALOS_MOBILE_SETTINGS_ACCOUNT_TAB ? 'active' : 'inactive'"
                    class="talos-pressable flex w-full items-center gap-3 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] data-[state=active]:border-[var(--talos-accent-border)] data-[state=active]:bg-[var(--talos-active)]"
                    @click="selectRow(TALOS_MOBILE_SETTINGS_ACCOUNT_TAB)"
                >
                    <TalosAccountAvatar size="md" />
                    <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-semibold text-[var(--talos-text)]">{{ account.state.display_name || accountTab.label }}</span>
                        <span class="block truncate text-xs text-[var(--talos-muted)]">{{ t('settingsCenter.localIdentity') }}</span>
                    </span>
                    <ChevronRight class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                </button>

                <!--
                    ⭐ Il controllo del telefono, e sta QUI e non fra le stazioni.

                    Non ci si va per fare qualcosa: ci si va per capire se si
                    può. Offrirla come stazione la presenterebbe come una
                    funzione, e finché il produttore del telefono blocca non è
                    una funzione — è una spiegazione. Misurato sul Pad il
                    2026-08-08: su ColorOS Shizuku non riesce nemmeno ad
                    autorizzarci.
                -->

                <div v-for="group in resolvedGroups" :key="group.label" class="w-full">
                    <p data-testid="settings-group-heading" class="mb-1.5 px-1 text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ group.label }}</p>
                    <div class="divide-y divide-[var(--talos-border)] overflow-hidden rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)]">
                            <RouterLink
                                v-if="group.chiave === 'Intelligence'"
                                :to="{ name: 'settings-privilege' }"
                                data-testid="settings-privilege-link"
                                class="talos-pressable flex min-h-touch w-full items-center gap-[var(--talos-space-inline)] px-[var(--talos-space-card)] text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--talos-ring)]"
                            >
                                <Smartphone class="size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                                <span class="min-w-0 flex-1">
                                    <span class="block truncate text-sm text-[var(--talos-text)]">{{ t('privilege.pageTitle') }}</span>
                                </span>
                                <ChevronRight class="size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                            </RouterLink>
                        <template v-for="tab in group.tabs" :key="tab.id">
                            <RouterLink
                                v-if="tab.id === TALOS_MOBILE_SETTINGS_MODEL_LAB_TAB"
                                :id="rowId(tab.id)"
                                :to="{ name: 'settings-models' }"
                                data-testid="settings-model-lab-link"
                                :data-settings-route="tab.id"
                                class="talos-pressable flex min-h-touch w-full items-center gap-[var(--talos-space-inline)] px-[var(--talos-space-card)] text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--talos-ring)]"
                            >
                                <component :is="ICONS[tab.id]" class="size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                                <span class="min-w-0 flex-1">
                                    <span class="block truncate text-sm text-[var(--talos-text)]">{{ t('navigation.modelLab') }}</span>
                                </span>
                                <ChevronRight class="size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                            </RouterLink>
                            <button
                                v-else
                                type="button"
                                :id="rowId(tab.id)"
                                :aria-current="activeTab === tab.id ? 'page' : undefined"
                                :data-settings-tab="tab.id"
                                :data-state="activeTab === tab.id ? 'active' : 'inactive'"
                                class="talos-pressable flex min-h-touch w-full items-center gap-[var(--talos-space-inline)] px-[var(--talos-space-card)] text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--talos-ring)] data-[state=active]:bg-[var(--talos-active)]"
                                @click="selectRow(tab.id)"
                            >
                                <component :is="ICONS[tab.id]" class="size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                                <span class="min-w-0 flex-1">
                                    <span class="block truncate text-sm text-[var(--talos-text)]">{{ tab.label }}</span>
                                    <span v-if="tab.availability === 'gated'" class="block truncate text-xs text-[var(--talos-muted)]">{{ t('settingsCenter.notInstalled') }}</span>
                                </span>
                                <ChevronRight class="size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                            </button>
                        </template>
                    </div>
                </div>
            </div>
        </nav>

        <section
            ref="detailRoot"
            data-testid="settings-detail-pane"
            tabindex="-1"
            :data-talos-motion-intent="mobileMotionPane === 'detail' ? 'tab-change' : undefined"
            class="min-w-0 px-0 py-2 md:block md:flex-1 md:overflow-y-auto md:px-4 md:py-0"
            :class="mobilePane === 'categories' ? 'hidden' : 'block'"
            :aria-label="t('settingsCenter.detailLabel', { tab: selectedTab.label })"
            @animationend="clearMobilePaneMotion('detail', $event)"
        >
            <!-- Owner 2026-07-24: the in-body "Categories" back is GONE — the
                 sheet header's single contextual Back now returns to the list. -->
            <div
                v-for="tab in renderedTabs"
                :key="tab.id"
                id="talos-settings-panel"
                role="region"
                :aria-labelledby="rowId(tab.id)"
                :hidden="tab.id !== activeTab"
                :data-settings-panel="tab.id"
                :data-state="tab.id === activeTab ? 'active' : 'inactive'"
                class="talos-motion-tab-panel outline-none"
            >
                <!-- Owner: the sheet header already shows the subsection title on
                     mobile — drop the duplicate eyebrow/title there, keep the
                     one-line description; the md side-by-side keeps the full
                     header (its sheet title stays "Settings Center"). -->
                <!-- Owner 2026-07-24: on the phone the sheet header already titles
                     the subsection, so the divider/eyebrow/title are md-only and
                     the one-line description hides when empty (Appearance dropped
                     its subtitle) — no stray bordered box above the content. -->
                <header class="md:mb-4 md:border-b md:border-[var(--talos-border)] md:pb-3">
                    <div class="hidden text-3xs font-semibold uppercase text-[var(--talos-muted)] md:block">{{ t('settingsCenter.protectedPreferences') }}</div>
                    <h3 class="talos-title hidden text-md font-semibold text-[var(--talos-text)] md:mt-1 md:block">{{ tab.label }}</h3>
                    <p v-if="tab.description" class="mb-3 text-xs leading-5 text-[var(--talos-muted)] md:mb-0 md:mt-1">{{ tab.description }}</p>
                </header>

                <TalosMobileSettingsBrowserPanel
                    v-if="tab.id === 'browser'"
                    :development-mode="developmentMode"
                />
                <!-- ⛔ «Serve un motore di ricerca» deve PORTARE dove si
                     aggiusta: un avviso che nomina una schermata e non la apre
                     lascia la persona a cercarla, che è metà del difetto che
                     l'avviso doveva chiudere. -->
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
