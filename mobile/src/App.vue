<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TalosBootLogo from '@/components/brand/TalosBootLogo.vue'
import TalosMobileBackground from '@/components/talos/workspace/TalosMobileBackground.vue'
import TalosMobileHeader from '@/components/shell/TalosMobileHeader.vue'
import TalosMobileToastRegion from '@/components/shell/TalosMobileToastRegion.vue'
import ChatScreen from '@/screens/ChatScreen.vue'
import { TALOS_MOBILE_ROUTES, type TalosMobileRouteName } from '@/lib/mobileRoutes'
import { usePreferencesStore } from '@/stores/preferences'
import { useThemeStore } from '@/stores/theme'
import { useSettingsStore } from '@/stores/settings'
import { useTalosAccountStore } from '@/stores/account'
import {
    registerNativeAppLifecycle,
    type NativeLifecycleController,
} from '@/services/nativeAppLifecycle'
import {
    registerTalosResumeRelock,
    type TalosResumeRelockController,
} from '@/services/resumeRelock'
import { talosDisabledSubsystems } from '@/main'
import { createDefaultTalosMotionV6Preferences } from '@/motion-v6/defaults'
import { talosInteractionMotionStyleV6 } from '@/motion-v6/interaction/style'
import { useChatController } from '@/stores/chatController'
import { useTalosMobileIntroState } from '@/composables/useTalosMobileIntroState'
import { TALOS_MOBILE_INTRO_KEY } from '@/lib/introInjection'
import { useTalosMobileWizardState } from '@/composables/useTalosMobileWizardState'
import { TALOS_MOBILE_WIZARD_KEY } from '@/lib/wizardInjection'
import { resolveTalosBackAction } from '@/lib/backNavigation'
import { talosOverlayBackActive, handleTalosOverlayBack } from '@/composables/useTalosOverlayBack'
import { talosLightImpact } from '@/services/haptics'
import { setTalosScreenSecure } from '@/services/privacyScreen'
import { useTalosMobileToasts } from '@/stores/toasts'
import { useTalosTabletLayout } from '@/composables/useTalosTabletLayout'
import { useTalosSheetNav } from '@/composables/useTalosSheetNav'
import { clampTalosTabletSidebarWidth } from '@/lib/tabletLayout'
import { useLauncherIconController } from '@/services/launcherIcon'
import TalosLauncherIconDialog from '@/components/talos/settings/TalosLauncherIconDialog.vue'

const router = useRouter()
const route = useRoute()
const preferences = usePreferencesStore()
const themeStore = useThemeStore()
const settingsStore = useSettingsStore()
const accountStore = useTalosAccountStore()
const chatController = useChatController()
const toastsStore = useTalosMobileToasts()
const launcherIcon = useLauncherIconController()
const disabled = talosDisabledSubsystems()
const uiFallback = disabled.has('ui')

// Animated brand intro over the static native splash; dismisses to the chat.
const showBoot = ref(true)
// R2-SF-M2 — shell-level session-action guard (re-entrancy + busy indicator).
const shellActionBusy = ref(false)

// F2-T6 intro modal — versioned gating (opens after settings hydration, never
// over the boot logo); the chunk loads ONLY when gating opens it.
const TalosMobileIntroModal = defineAsyncComponent(
    () => import('@/components/intro/TalosMobileIntroModal.vue'),
)
// N1 — the guided account wizard chunk loads only when its gate opens it
// (first run after the intro, or an explicit replay from Settings).
const TalosMobileAccountWizard = defineAsyncComponent(
    () => import('@/components/onboarding/TalosMobileAccountWizard.vue'),
)
// F2-T6 app lock: armed on cold start when the opt-in flag AND a real PIN
// record exist; the lock screen chunk loads only when the lock is armed.
const TalosMobileLockScreen = defineAsyncComponent(
    () => import('@/components/security/TalosMobileLockScreen.vue'),
)
// Budget: the immersive chrome loads only when the (default-off) toggle is on.
const TalosMobileImmersiveChrome = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileImmersiveChrome.vue'),
)
// F3-T0 entry split: the sidebar chunk loads at the FIRST hamburger tap and the
// tool sheet only when a station opens — neither belongs to the first paint.
const TalosMobileSidebar = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileSidebar.vue'),
)
const TalosMobileToolSheet = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileToolSheet.vue'),
)
// F6 — tablet split view: persistent chat panel + draggable divider. Both
// chunks load only when the md breakpoint engages (phones never pay).
const TalosTabletSidebar = defineAsyncComponent(
    () => import('@/components/shell/TalosTabletSidebar.vue'),
)
const TalosTabletDivider = defineAsyncComponent(
    () => import('@/components/shell/TalosTabletDivider.vue'),
)
const sidebarEverOpened = ref(false)
const locked = ref(false)
const settingsHydrated = ref(false)
const intro = useTalosMobileIntroState({
    hydrated: () => settingsHydrated.value,
    blocked: () => showBoot.value || locked.value,
    onboarding: () => settingsStore.state.onboarding,
    setOnboarding: (patch) => settingsStore.setOnboarding(patch),
})
provide(TALOS_MOBILE_INTRO_KEY, intro)

// N1 — guided account wizard: opens after the intro is resolved (ONE fullscreen
// surface at a time), once per wizard version; replayable from Settings.
const accountWizard = useTalosMobileWizardState({
    hydrated: () => settingsHydrated.value,
    blocked: () => showBoot.value || locked.value || intro.introOpen.value,
    onboarding: () => settingsStore.state.onboarding,
    setOnboarding: (patch) => settingsStore.setOnboarding(patch),
})
provide(TALOS_MOBILE_WIZARD_KEY, accountWizard)

// F4-#18: ask for the mic permission at a MEANINGFUL moment — completing the
// intro (the user just read what TALOS does), never at cold start. Skippers
// get asked at the first mic tap instead.
function onIntroClose(outcome: 'completed' | 'skipped'): void {
    void intro.closeIntro(outcome)
    if (outcome === 'completed') {
        void import('@/services/dictation').then(({ requestTalosDictationPermission }) =>
            requestTalosDictationPermission())
    }
}

// F1-T4 animation mandate: theme-tuned interaction-motion CSS vars from the
// motion-v6 engine, applied at the shell root; components consume the vars.
const reducedMotion = ref(typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
const interactionMotionStyle = computed(() => talosInteractionMotionStyleV6({
    themeId: themeStore.state.theme,
    preferences: createDefaultTalosMotionV6Preferences(),
    reducedMotion: reducedMotion.value,
    paused: false,
}))

// F6 — fixed overlays (station sheet) read the rail width to spare the
// persistent tablet panel; 0 on phones keeps them full-bleed.
const shellStyle = computed(() => ({
    ...interactionMotionStyle.value,
    '--talos-tablet-rail': tabletLayout.isTablet.value ? `${tabletSidebarWidth.value}px` : '0px',
}))

// F1-T3 (D5/D6): hamburger sidebar state + the ChatScreen exposed session actions
// (attachment revocation + draft scoping stay orchestrated in one place).
const sidebarOpen = ref(false)
// Debt S2: FLAG_SECURE — no screenshots, no screen recording, no readable
// recents thumbnail. SF: do NOT fire before hydration; the pre-hydration
// default would CLEAR the flag for the whole boot window, which is exactly the
// window where the restored route is already painted.
watch(() => settingsHydrated.value && settingsStore.state.security.screen_secure, (secure) => {
    if (!settingsHydrated.value) return
    void setTalosScreenSecure(secure === true)
})

watch(sidebarOpen, (open) => {
    if (open) sidebarEverOpened.value = true
})
// Owner 2026-07-24: when "launcher icon follows theme" is on, switching preset
// (or enabling the toggle while off-icon) prompts to restart-and-reskin the
// Android home-screen icon (opt-in, native).
watch(
    () => [themeStore.state.theme, settingsStore.state.shell.launcher_icon_follows_theme] as const,
    ([theme, enabled]) => { launcherIcon.evaluate(theme, enabled) },
)
const chatScreen = ref<InstanceType<typeof ChatScreen> | null>(null)
const headerTitle = computed(() => chatController.chat.activeSession.value?.title ?? '')
const sessionBusy = computed(() =>
    Boolean((chatScreen.value as { sessionActionBusy?: boolean } | null)?.sessionActionBusy)
    || shellActionBusy.value)

function sidebarNavigate(name: TalosMobileRouteName): void {
    sidebarOpen.value = false
    void navigate(name)
}

// R2-7 — the shell drives session actions through the controller's lifecycle
// facade (single orchestration point, no duck-typed casts into ChatScreen).
// Failures surface as toasts — the shell has no dialog to keep them in.
// R2-SF-M2 — the shell lost its busy guard when actions moved to the
// lifecycle facade: rapid double-tap created two empty sessions and the
// buttons showed no spinner. shellActionBusy restores both (re-entrancy
// refusal + the `:creating-session`/`:busy` indicator that feeds it).
function lifecycleAction(label: string, action: () => Promise<void>): void {
    if (shellActionBusy.value) return
    shellActionBusy.value = true
    void action()
        .catch((error: unknown) => {
            const detail = error instanceof Error && error.message ? error.message : String(error)
            toastsStore.push({ message: `${label} failed: ${detail}`, durationMs: 6000 })
        })
        .finally(() => { shellActionBusy.value = false })
}

function sidebarNewChat(): void {
    sidebarOpen.value = false
    lifecycleAction('New chat', async () => {
        await chatController.sessionLifecycle.newSession()
        // New Chat always LANDS in the chat — never leaves you on a station.
        if (isStation.value) await navigate('chat')
    })
}

function sidebarSelect(sessionId: string): void {
    sidebarOpen.value = false
    void talosLightImpact()
    lifecycleAction('Open chat', () => chatController.sessionLifecycle.selectSession(sessionId))
}

function sidebarRename(sessionId: string, title: string): void {
    lifecycleAction('Rename chat', () => chatController.sessionLifecycle.renameSession(sessionId, title))
}

function sidebarDelete(sessionId: string): void {
    lifecycleAction('Delete chat', () => chatController.sessionLifecycle.deleteSession(sessionId))
}

const exportSheetOpen = ref(false)
const TalosMobileSessionExportSheet = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileSessionExportSheet.vue'),
)

// F6 — tablet split view state. The persisted setting IS the width; a local
// override carries the live drag only, so hydration timing can never desync
// the panel from the stored value. The settings write happens once per
// gesture at `commit`.
const tabletLayout = useTalosTabletLayout()
const sheetNav = useTalosSheetNav()
const tabletDragWidth = ref<number | null>(null)
const tabletSidebarWidth = computed(() => tabletDragWidth.value
    ?? clampTalosTabletSidebarWidth(settingsStore.state.shell.tablet_sidebar_width))
function onTabletResize(width: number): void {
    tabletDragWidth.value = width
}
function commitTabletWidth(): void {
    const width = tabletSidebarWidth.value
    void settingsStore.setShell({ tablet_sidebar_width: width })
        .catch(() => undefined)
        .finally(() => {
            // SF6-F5: never wipe a SECOND drag that started while this
            // persist was in flight — clear only our own override.
            if (tabletDragWidth.value === width) tabletDragWidth.value = null
        })
}
// SF6-F9: leaving the tablet layout mid-drag would otherwise leak the
// in-flight override into the next engage.
watch(() => tabletLayout.isTablet.value, (isTablet) => {
    if (!isTablet) tabletDragWidth.value = null
})
// Picking / creating a chat in the panel while a station sheet is open must
// land in the chat — same rule as sidebarNewChat.
function onTabletActivated(): void {
    if (isStation.value) void navigate('chat')
}

// F2-T3.6 immersive chrome: 3-dot options act on the ACTIVE session.
const immersiveHeader = computed(() => settingsStore.state.shell.immersive_header)
function immersiveRename(title: string): void {
    const id = chatController.chat.activeSession.value?.id
    if (id) sidebarRename(id, title)
}
function immersiveDelete(): void {
    const id = chatController.chat.activeSession.value?.id
    if (id) sidebarDelete(id)
}

let lifecycle: NativeLifecycleController | null = null
let resumeRelock: TalosResumeRelockController | null = null

const activeRoute = computed<TalosMobileRouteName>(() => {
    const match = TALOS_MOBILE_ROUTES.find((entry) => entry.name === route.name)
    return match ? match.name : 'chat'
})

// Chat is the persistent base; every other tab presents its screen in a sheet
// over it — the mobile mirror of the desktop windowed workspace.
const isStation = computed(() => activeRoute.value !== 'chat')

const SHEET_TITLE: Record<TalosMobileRouteName, string> = {
    chat: 'Chat',
    chats: 'Chats',
    memory: 'Memory',
    tasks: 'Tasks',
    notes: 'Notes',
    doctor: 'Doctor',
    research: 'Deep Research V3',
    runs: 'Runtime cockpit',
    context: 'Library',
    settings: 'Settings Center',
}
const sheetTitle = computed(() => SHEET_TITLE[activeRoute.value])

const navItems = TALOS_MOBILE_ROUTES.map((entry) => ({
    name: entry.name,
    label: entry.name.charAt(0).toUpperCase() + entry.name.slice(1),
}))

function pathFor(name: TalosMobileRouteName): string {
    return TALOS_MOBILE_ROUTES.find((entry) => entry.name === name)?.path ?? '/'
}

async function navigate(name: TalosMobileRouteName): Promise<void> {
    await router.push(pathFor(name))
    await preferences.setLastRoute(name)
}

onMounted(async () => {
    await preferences.hydrate()
    // Local account (name/avatar initial) — fail-soft: a bad read just keeps
    // the default TALOS initial.
    void accountStore.hydrate().catch(() => undefined)
    // Intro gating waits for the REAL persisted onboarding state — a failed
    // read keeps the modal closed (fail-closed, no flash).
    try {
        await settingsStore.hydrate()
        settingsHydrated.value = true
    } catch {
        settingsHydrated.value = false
    }
    // Reconcile which launcher-icon alias is currently applied (native + mirror).
    void launcherIcon.hydrate().catch(() => undefined)
    if (settingsStore.state.security.app_lock_enabled) {
        // Arm only when a REAL PIN record exists — a dangling flag without a
        // Keystore record must never brick the app (fail-open on the flag,
        // fail-closed on the verification itself).
        const { hasAppLockPin } = await import('@/services/appLock')
        locked.value = await hasAppLockPin().catch(() => false)
    }
    // SF6-F13: a phone-persisted 'chats' route is redundant on tablet — the
    // embedded panel IS the chats list; restoring it would open the station
    // sheet right next to the identical panel.
    const lastRoute = preferences.state.last_route
    if (lastRoute && lastRoute !== activeRoute.value
        && !(tabletLayout.isTablet.value && lastRoute === 'chats')) {
        await router.replace(pathFor(lastRoute))
    }
    if (!disabled.has('lifecycle')) {
        // R1-3 — the PIN protected only cold boots; the everyday path is a
        // resumed resident app. Re-arm the lock after a real background stay.
        resumeRelock = registerTalosResumeRelock({
            isEnabled: async () => {
                if (!settingsStore.state.security.app_lock_enabled) return false
                const { hasAppLockPin } = await import('@/services/appLock')
                return hasAppLockPin().catch(() => false)
            },
            onRelock: () => {
                // R1-SF-B2: an open vaul drawer sets body pointer-events:none
                // — the lock screen would be dead to taps over it.
                sidebarOpen.value = false
                locked.value = true
            },
        })
        lifecycle = registerNativeAppLifecycle({
            onBack: (event) => {
                // Owner 2026-07-24: the sidebar is the MAIN MENU. Back walks the
                // stack (wizard → sidebar → settings sub-view → station → chat).
                // A station TOP returns to the sidebar, NOT straight to chat, so
                // leaving Settings/a tool reopens the menu it was launched from.
                const action = resolveTalosBackAction({
                    composerOverlayOpen: talosOverlayBackActive(),
                    wizardOpen: accountWizard.wizardOpen.value,
                    sidebarOpen: sidebarOpen.value,
                    hasSheetSubView: sheetNav.subView.value !== null,
                    isStation: isStation.value,
                    canGoBack: event.canGoBack,
                })
                switch (action) {
                    case 'close-overlay': handleTalosOverlayBack(); return 'handled'
                    case 'dismiss-wizard': accountWizard.handleBack(); return 'handled'
                    case 'close-sidebar': sidebarOpen.value = false; return 'handled'
                    case 'sheet-subview-back': sheetNav.subView.value?.back(); return 'handled'
                    case 'station-to-sidebar': void navigate('chat'); sidebarOpen.value = true; return 'handled'
                    case 'history': return 'history'
                    case 'exit': return 'exit'
                }
            },
            onError: (error) => {
                console.error(`[native-lifecycle] ${error.code}: ${error.message}`)
            },
        })
        await lifecycle.ready.catch(() => undefined)
    }
})

onBeforeUnmount(async () => {
    await resumeRelock?.dispose()
    await lifecycle?.dispose()
})
</script>

<template>
    <div
        class="relative flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-[var(--talos-background)] text-[var(--talos-text)]"
        :data-talos-route="activeRoute"
        :data-talos-presentation="preferences.state.presentation"
        :style="shellStyle"
    >
        <TalosBootLogo v-if="showBoot" @done="showBoot = false" />

        <!-- F2-T6 app lock: gates the workspace until a REAL unlock. -->
        <TalosMobileLockScreen
            v-if="locked"
            :biometric-enabled="settingsStore.state.security.app_lock_biometric"
            @unlocked="locked = false"
        />

        <!-- F2-T6 intro modal: mounts only when the versioned gating opens it.
             Owner 2026-07-24: a leave transition so closing FADES out instead of
             snapping (v-if unmounts instantly on its own). -->
        <Transition leave-active-class="transition-opacity duration-200 ease-in motion-reduce:transition-none" leave-to-class="opacity-0">
            <TalosMobileIntroModal
                v-if="intro.introOpen.value"
                @close="onIntroClose($event)"
            />
        </Transition>

        <!-- N1 guided account wizard: opens after the intro, once per version.
             The shell persists its own outcome via the injected wizard state.
             Owner 2026-07-24: leave transition (fade + soft lift) on close. -->
        <Transition leave-active-class="transition duration-200 ease-in motion-reduce:transition-none" leave-to-class="opacity-0 scale-[0.98]">
            <TalosMobileAccountWizard v-if="accountWizard.wizardOpen.value" />
        </Transition>

        <div
            v-if="themeStore.state.theme !== 'calm'"
            aria-hidden="true"
            data-testid="telemetry-poster"
            class="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center opacity-20"
            :style="{ backgroundImage: 'var(--talos-poster-url)' }"
        />

        <!-- Procedural motion background (motion-v6) — behind the content. -->
        <TalosMobileBackground v-if="!uiFallback" class="z-0" aria-hidden="true" />

        <!-- Fail-closed fallback: no upstream shadcn/reka components. -->
        <template v-if="uiFallback">
            <main class="flex-1 overflow-y-auto">
                <RouterView />
            </main>
            <nav aria-label="Primary" data-testid="ui-fallback" class="relative z-50 flex shrink-0 items-stretch justify-around border-t border-[var(--talos-border)] bg-[var(--talos-sidebar)]">
                <button
                    v-for="item in navItems"
                    :key="item.name"
                    type="button"
                    :data-nav="item.name"
                    :aria-label="item.label"
                    :aria-current="item.name === activeRoute ? 'page' : undefined"
                    class="min-h-11 min-w-11 flex-1 px-2 py-2 text-xs text-[var(--talos-muted)] aria-[current=page]:text-[var(--talos-accent)]"
                    @click="navigate(item.name)"
                >
                    {{ item.label }}
                </button>
            </nav>
        </template>

        <template v-else>
            <TalosMobileSessionExportSheet v-if="exportSheetOpen" @close="exportSheetOpen = false" />

            <TalosMobileSidebar
                v-if="sidebarEverOpened"
                v-model:open="sidebarOpen"
                :sessions="chatController.chat.sessions"
                :active-session-id="chatController.chat.activeSession.value?.id ?? null"
                :busy="sessionBusy"
                :creating-session="sessionBusy || chatController.chat.state.persistenceStatus !== 'ready'"
                @new-chat="sidebarNewChat"
                @select="sidebarSelect"
                @rename="sidebarRename"
                @delete="sidebarDelete"
                @navigate="sidebarNavigate"
                @open-model-lab="sidebarNavigate('settings')"
                @open-settings="sidebarNavigate('settings')"
            />

            <!-- F6 — tablet split view: [chat panel | divider | content column].
                 On phones the row degenerates to the single content column. -->
            <div class="relative z-10 flex min-h-0 flex-1">
                <template v-if="tabletLayout.isTablet.value">
                    <TalosTabletSidebar
                        :width="tabletSidebarWidth"
                        @activated="onTabletActivated"
                        @open-menu="sidebarOpen = true"
                    />
                    <TalosTabletDivider
                        :width="tabletSidebarWidth"
                        @resize="onTabletResize"
                        @commit="commitTabletWidth"
                    />
                </template>

                <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
                    <TalosMobileHeader
                        v-if="!immersiveHeader"
                        :title="headerTitle"
                        :creating-session="sessionBusy || chatController.chat.state.persistenceStatus !== 'ready'"
                        :hide-menu="tabletLayout.isTablet.value"
                        @open-menu="sidebarOpen = true"
                        @new-chat="sidebarNewChat"
                        @rename="immersiveRename"
                        @delete="immersiveDelete"
                        @export="exportSheetOpen = true"
                    />
                    <TalosMobileImmersiveChrome
                        v-else
                        :active-title="headerTitle"
                        :busy="sessionBusy"
                        :hide-menu="tabletLayout.isTablet.value"
                        @open-menu="sidebarOpen = true"
                        @new-chat="sidebarNewChat"
                        @rename="immersiveRename"
                        @delete="immersiveDelete"
                        @export="exportSheetOpen = true"
                    />

                    <main class="relative flex-1 overflow-hidden">
                        <ChatScreen ref="chatScreen" />
                    </main>
                </div>
            </div>

            <TalosMobileToastRegion />

            <TalosLauncherIconDialog />

            <Transition
                leave-active-class="transition duration-200 ease-in"
                leave-to-class="opacity-0 translate-y-4"
            >
                <TalosMobileToolSheet
                    v-if="isStation"
                    :title="sheetTitle"
                    :presentation="settingsStore.state.chat_layout.mobile_window_presentation"
                    @close="navigate('chat')"
                >
                    <RouterView />
                </TalosMobileToolSheet>
            </Transition>
        </template>
    </div>
</template>
