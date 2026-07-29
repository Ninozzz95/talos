<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { talosTranslatableErrorMessage } from '@/i18n/uiErrors'
import type { TalosSessionCleanupPlan } from '@/lib/chat/sessionCleanup'
import TalosBootLogo from '@/components/brand/TalosBootLogo.vue'
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
import { talosInteractionMotionStyleV6 } from '@/motion-v6/interaction/style'
import { useChatController } from '@/stores/chatController'
import { useTalosMobileIntroState } from '@/composables/useTalosMobileIntroState'
import { TALOS_MOBILE_INTRO_KEY } from '@/lib/introInjection'
import { resolveTalosBackAction } from '@/lib/backNavigation'
import { talosOverlayBackActive, handleTalosOverlayBack } from '@/composables/useTalosOverlayBack'
import { talosLightImpact } from '@/services/haptics'
import { Capacitor } from '@capacitor/core'
import { setTalosScreenSecure } from '@/services/privacyScreen'
import { applyTalosFontScale } from '@/lib/talosFontScale'
import { useTalosMobileToasts } from '@/stores/toasts'
import { useTalosTabletLayout } from '@/composables/useTalosTabletLayout'
import { useTalosSheetNav } from '@/composables/useTalosSheetNav'
import { clampTalosTabletSidebarWidth } from '@/lib/tabletLayout'
import { useLauncherIconController } from '@/services/launcherIcon'
import { parseTalosSessionLibraryContextPolicy } from '@/lib/chat/libraryPolicy'
const router = useRouter()
const route = useRoute()
const { t } = useTalosI18n()
const preferences = usePreferencesStore()
const themeStore = useThemeStore()
const settingsStore = useSettingsStore()
const accountStore = useTalosAccountStore()
const chatController = useChatController()
const toastsStore = useTalosMobileToasts()
const launcherIcon = useLauncherIconController()
const disabled = talosDisabledSubsystems()
const uiFallback = disabled.has('ui')

// The static theme paints immediately. Procedural scenes and renderers are an
// optional post-entry enhancement, kept outside the first-chat bundle.
const TalosMobileBackground = defineAsyncComponent(
    () => import('@/components/talos/workspace/TalosMobileBackground.vue'),
)

// Animated brand intro over the static native splash; dismisses to the chat.
const showBoot = ref(true)
// R2-SF-M2 — shell-level session-action guard (re-entrancy + busy indicator).
const shellActionBusy = ref(false)

// First-run setup — versioned gating (opens after settings hydration, never
// over the boot logo); the chunk loads ONLY when gating opens it. Owner
// 2026-07-27: two steps, replacing the six-slide carousel.
const TalosMobileSetupIntro = defineAsyncComponent(
    () => import('@/components/intro/TalosMobileSetupIntro.vue'),
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
// The controller remains eager so it can observe theme changes. The optional
// preview dialog (and its SVG/UI tree) loads only for a real pending decision.
const TalosLauncherIconDialog = defineAsyncComponent(
    () => import('@/components/talos/settings/TalosLauncherIconDialog.vue'),
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

/**
 * Owner 2026-07-27, from Android's own guidance: "Wait for the user to invoke
 * the task or action in your app that requires access to specific private user
 * data." Finishing setup used to fire the microphone prompt, which is a cold
 * ask — the person has not touched the mic and cannot tell why Android is
 * asking, which is exactly how a permission gets denied for good.
 *
 * The first mic tap asks instead. That path already existed for anyone who
 * skipped; now it is the only one.
 */
function onIntroClose(outcome: 'completed' | 'skipped'): void {
    void intro.closeIntro(outcome)
}

// F1-T4 animation mandate: theme-tuned interaction-motion CSS vars from the
// motion-v6 engine, applied at the shell root; components consume the vars.
const reducedMotion = ref(typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
const interactionMotionStyle = computed(() => talosInteractionMotionStyleV6({
    themeId: themeStore.state.theme,
    preferences: settingsStore.state.motion_v6,
    reducedMotion: reducedMotion.value,
    paused: false,
}))

// F6 — fixed overlays read the visible leading rail. Settings is itself a
// canonical list-detail surface: its categories replace the chat rail, so the
// station owns the full tablet width while retaining the saved rail dimension.
const shellStyle = computed(() => ({
    ...interactionMotionStyle.value,
    '--talos-tablet-rail': tabletChatRailVisible.value ? `${tabletSidebarWidth.value}px` : '0px',
    '--talos-tablet-sidebar-width': `${tabletSidebarWidth.value}px`,
}))

// F1-T3 (D5/D6): hamburger sidebar state + the ChatScreen exposed session actions
// (attachment revocation + draft scoping stay orchestrated in one place).
const sidebarOpen = ref(false)
// Interface text size: one variable on <html> drives Tailwind UI tokens.
// Message prose has its own root-relative chat_layout.bubble_scale boundary.
watch(() => settingsStore.state.shell.ui_font_scale, (scale) => {
    applyTalosFontScale(scale)
}, { immediate: true })

// Debt S1 / SF-MAJOR: the storage layer failed at boot with the key locked, and
// nothing retried once the PIN opened it — the correct PIN landed on an error
// banner over an empty session list.
async function onUnlocked(): Promise<void> {
    locked.value = false
    try {
        await chatController.chat.retryPersistence()
    } catch {
        // The banner stays; the Doctor already has the reason.
    }
}

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

function sidebarNavigate(name: TalosMobileRouteName, query: LocationQueryRaw = {}): void {
    sidebarOpen.value = false
    void navigate(name, query)
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
            const detail = talosTranslatableErrorMessage(error, t)
                ?? (error instanceof Error && error.message ? error.message : String(error))
            toastsStore.push({ message: t('common.actionFailed', { action: label, detail }), durationMs: 6000 })
        })
        .finally(() => { shellActionBusy.value = false })
}

function sidebarNewChat(): void {
    sidebarOpen.value = false
    lifecycleAction(t('chat.newChat'), async () => {
        await chatController.sessionLifecycle.newSession()
        // New Chat always LANDS in the chat — never leaves you on a station.
        if (isStation.value) await navigate('chat')
    })
}

function sidebarSelect(sessionId: string): void {
    sidebarOpen.value = false
    void talosLightImpact()
    lifecycleAction(t('chat.openNamed', { title: '' }).trim(), () => chatController.sessionLifecycle.selectSession(sessionId))
}

function sidebarRename(sessionId: string, title: string): void {
    lifecycleAction(t('chat.renameChat'), () => chatController.sessionLifecycle.renameSession(sessionId, title))
}

/**
 * Delete a chat, and — if the user asked — the files it produced.
 *
 * Owner 2026-07-26: deleting a chat left its documents in the Library with no
 * mention that it would. The files go FIRST: if that half fails the chat is
 * still there and the user can try again, whereas deleting the chat first and
 * then failing leaves orphans nobody can find their way back to.
 */
function sidebarDelete(sessionId: string, choice?: { deleteMedia: boolean }): void {
    lifecycleAction(t('chat.deleteChat'), async () => {
        const failed = choice?.deleteMedia ? await chatController.deleteSessionMedia(sessionId) : []
        await chatController.sessionLifecycle.deleteSession(sessionId)
        // Reported only AFTER the chat is actually gone: announcing it earlier
        // put "Chat deleted" on screen next to "Delete chat failed" whenever the
        // second half threw.
        if (failed.length) {
            toastsStore.push({
                message: failed.length === 1
                    ? t('chat.deletedFilesFailedOne')
                    : t('chat.deletedFilesFailedMany', { count: failed.length }),
                durationMs: 6000,
            })
        }
    })
}

const exportSheetOpen = ref(false)

/**
 * The per-chat media gallery (owner, 2026-07-26). Loaded on demand: it is a
 * whole grid with thumbnails, opened occasionally, and the chat's first paint
 * must not carry it.
 *
 * The attached-file ids are fetched when the panel opens rather than kept in
 * sync — the gallery is a snapshot of a chat the user is looking at, and a
 * standing subscription would cost a query on every send for a screen that is
 * usually closed.
 */
const TalosMobileChatMediaPanel = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileChatMediaPanel.vue'),
)
const mediaPanelOpen = ref(false)
const mediaAttachedFileIds = ref<string[]>([])
/** Drops a slow answer that belongs to a chat the user has already left. */
let mediaRequest = 0

const canOpenChatMedia = computed(() => chatController.chat.activeSession.value !== null)
const activeSessionLibraryContextPolicy = computed(() =>
    parseTalosSessionLibraryContextPolicy(
        chatController.chat.activeSession.value?.metadata.library_context_policy,
    ))

async function openChatMedia(): Promise<void> {
    const sessionId = chatController.chat.activeSession.value?.id
    if (!sessionId) return
    // SF-MAJOR: these used to survive the close, so opening the gallery on chat
    // B rendered chat A's documents — captioned "in B", labelled "From your
    // Library" — for as long as the SQLite query took. They are this chat's
    // answer or nothing.
    mediaAttachedFileIds.value = []
    const request = mediaRequest += 1
    mediaPanelOpen.value = true
    // Best effort: a gallery that opens empty because one query failed is worse
    // than one that shows the files it can name from metadata alone.
    const attached = await chatController.listChatMediaFileIds(sessionId).catch(() => [])
    if (request !== mediaRequest) return
    if (chatController.chat.activeSession.value?.id !== sessionId) return
    mediaAttachedFileIds.value = attached
    await chatController.attachments.refreshVault().catch(() => {})
}

// The chat can be deleted, or the user can start a new one, while the gallery
// is open — it would keep showing a chat that no longer exists.
watch(() => chatController.chat.activeSession.value?.id, () => { mediaPanelOpen.value = false })
// The write-consent sheet: loaded only when a tool actually asks.
const TalosMobileToolConsentSheet = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileToolConsentSheet.vue'),
)
const TalosMobileToolAuthorizationRecoveryCard = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileToolAuthorizationRecoveryCard.vue'),
)
const activeToolAuthorization = computed(() =>
    chatController.pendingToolAuthorizations.value[0] ?? null)
const activeToolAuthorizationRecovery = computed(() =>
    chatController.toolAuthorizationRecoveries.value[0] ?? null)
const toolAuthorizationReviewCount = computed(() =>
    chatController.pendingToolAuthorizations.value.length
    + chatController.toolAuthorizationRecoveries.value.length)
const toolAuthorizationRecoveryBusy = ref<string | null>(null)

async function retryToolAuthorizationRecovery(checkpointId: string): Promise<void> {
    if (toolAuthorizationRecoveryBusy.value !== null) return
    toolAuthorizationRecoveryBusy.value = checkpointId
    try {
        await chatController.retryToolAuthorization(checkpointId)
    } catch (error) {
        const detail = talosTranslatableErrorMessage(error, t)
            ?? (error instanceof Error && error.message ? error.message : String(error))
        toastsStore.push({
            message: t('common.actionFailed', {
                action: t('chat.authorizationRecoveryRetry'),
                detail,
            }),
            durationMs: 6000,
        })
    } finally {
        toolAuthorizationRecoveryBusy.value = null
    }
}

async function cancelToolAuthorizationRecovery(checkpointId: string): Promise<void> {
    if (toolAuthorizationRecoveryBusy.value !== null) return
    toolAuthorizationRecoveryBusy.value = checkpointId
    try {
        await chatController.cancelToolAuthorization(checkpointId)
    } catch (error) {
        const detail = talosTranslatableErrorMessage(error, t)
            ?? (error instanceof Error && error.message ? error.message : String(error))
        toastsStore.push({
            message: t('common.actionFailed', {
                action: t('chat.authorizationRecoveryCancel'),
                detail,
            }),
            durationMs: 6000,
        })
    } finally {
        toolAuthorizationRecoveryBusy.value = null
    }
}
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
function immersiveDelete(choice: { deleteMedia: boolean }): void {
    const id = chatController.chat.activeSession.value?.id
    if (id) sidebarDelete(id, choice)
}

/** The delete confirmation's file count, for whichever chat is being deleted. */
function cleanupPlanFor(sessionId: string): TalosSessionCleanupPlan {
    return chatController.planSessionCleanup(sessionId)
}

const activeCleanupPlan = computed<TalosSessionCleanupPlan>(() => {
    const id = chatController.chat.activeSession.value?.id
    return id ? cleanupPlanFor(id) : { documents: [], sources: [] }
})

let lifecycle: NativeLifecycleController | null = null
let resumeRelock: TalosResumeRelockController | null = null

const activeRoute = computed<TalosMobileRouteName>(() => {
    const match = TALOS_MOBILE_ROUTES.find((entry) => entry.name === route.name)
    return match ? match.name : 'chat'
})

// Chat is the persistent base; every other tab presents its screen in a sheet
// over it — the mobile mirror of the desktop windowed workspace.
const isStation = computed(() => activeRoute.value !== 'chat')
// TABLET-SETTINGS-01: Settings categories are the primary pane for that task.
// Mounting the unrelated chat rail beside them creates a redundant third pane.
const tabletChatRailVisible = computed(() => (
    tabletLayout.isTablet.value && activeRoute.value !== 'settings'
))

const SHEET_TITLE_KEY: Record<TalosMobileRouteName, string> = {
    chat: 'navigation.chat',
    chats: 'navigation.chats',
    memory: 'navigation.memory',
    tasks: 'navigation.tasks',
    notes: 'navigation.notes',
    doctor: 'navigation.doctor',
    research: 'stations.deepResearchTitle',
    runs: 'stations.runtimeCockpitTitle',
    context: 'navigation.library',
    settings: 'stations.settingsCenterTitle',
}
const sheetTitle = computed(() => t(SHEET_TITLE_KEY[activeRoute.value]))

const navItems = computed(() => TALOS_MOBILE_ROUTES.map((entry) => ({
    name: entry.name,
    label: t(SHEET_TITLE_KEY[entry.name]),
})))

function pathFor(name: TalosMobileRouteName): string {
    return TALOS_MOBILE_ROUTES.find((entry) => entry.name === name)?.path ?? '/'
}

async function navigate(name: TalosMobileRouteName, query: LocationQueryRaw = {}): Promise<void> {
    await router.push({ path: pathFor(name), query })
    await preferences.setLastRoute(name)
}

onMounted(async () => {
    await preferences.hydrate()
    // Identity must hydrate before the unified setup opens, otherwise a
    // returning user can briefly see an empty name and duplicate work.
    await accountStore.hydrate().catch(() => undefined)
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
    // Debt S1 / SF-CRITICAL: the KEY decides, not the preference flag. If the
    // key is wrapped and the flag never made it to disk, deriving the lock from
    // the flag alone left the user with intact data, a valid PIN, and no
    // surface anywhere in the app that would accept it.
    // Only native has an encrypted database — on web this was a Keystore
    // round-trip on the boot path that bought nothing and delayed first paint.
    const keyProtected = Capacitor.isNativePlatform()
        ? await import('@/services/databaseKey')
            .then((module) => module.talosDatabaseKeyIsProtected())
            .catch(() => false)
        : false
    if (keyProtected) {
        locked.value = true
    } else if (settingsStore.state.security.app_lock_enabled) {
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
            // Owner 2026-07-29: the phone's own lock has to take TALOS with it —
            // immediately, not on the next resume and not after the grace
            // window. Asking Android WHY the app went away is what keeps a quick
            // app switch cheap while making a screen lock absolute.
            isDeviceLocked: async () => {
                const { talosDeviceIsLocked } = await import('@/services/privacyScreen')
                return talosDeviceIsLocked()
            },
            onRelock: () => {
                // R1-SF-B2: an open vaul drawer sets body pointer-events:none
                // — the lock screen would be dead to taps over it.
                sidebarOpen.value = false
                locked.value = true
                // Hide arguments while locked. “Later” is not denial and the
                // encrypted durable request remains available after unlock.
                chatController.hideToolAuthorizations()
                // SF-MAJOR: the in-flight send survived the lock. Every tool read
                // then threw TALOS_DB_KEY_LOCKED, the answer could not be
                // persisted and was lost — and, worse, the conversation kept
                // being sent to the provider while the screen showed a PIN pad.
                // Stop the send BEFORE taking the key away.
                chatController.chat.stopStreaming()
                // Debt S1: the screen is not the lock. The key leaves memory and
                // the plugin's store, so the database really closes. Imported on
                // demand: re-locking is never part of the first paint.
                void import('@/services/databaseProtection').then((module) => module.relockTalosDatabase())
            },
        })
        lifecycle = registerNativeAppLifecycle({
            onBack: (event) => {
                // Owner 2026-07-24: the sidebar is the MAIN MENU. Back walks the
                // stack (setup → sidebar → settings sub-view → station → chat).
                // A station TOP returns to the sidebar, NOT straight to chat, so
                // leaving Settings/a tool reopens the menu it was launched from.
                const action = resolveTalosBackAction({
                    composerOverlayOpen: talosOverlayBackActive(),
                    wizardOpen: intro.introOpen.value,
                    sidebarOpen: sidebarOpen.value,
                    hasSheetSubView: sheetNav.subView.value !== null,
                    isStation: isStation.value,
                    canGoBack: event.canGoBack,
                })
                switch (action) {
                    case 'close-overlay': handleTalosOverlayBack(); return 'handled'
                    case 'dismiss-wizard': intro.handleBack(); return 'handled'
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
            @unlocked="onUnlocked"
        />

        <!-- First-run setup: mounts only when the versioned gating opens it.
             Owner 2026-07-24: a leave transition so closing FADES out instead of
             snapping (v-if unmounts instantly on its own). -->
        <Transition leave-active-class="transition-opacity duration-200 ease-in motion-reduce:transition-none" leave-to-class="opacity-0">
            <TalosMobileSetupIntro
                v-if="intro.introOpen.value"
                :replay="intro.replaying.value"
                @close="onIntroClose($event)"
            />
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
            <nav :aria-label="$t('navigation.primary')" data-testid="ui-fallback" class="relative z-50 flex shrink-0 items-stretch justify-around border-t border-[var(--talos-border)] bg-[var(--talos-sidebar)]">
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

            <TalosMobileChatMediaPanel
                v-if="mediaPanelOpen && chatController.chat.activeSession.value"
                :session-id="chatController.chat.activeSession.value.id"
                :session-title="headerTitle"
                :files="chatController.attachments.vaultFiles"
                :attached-file-ids="mediaAttachedFileIds"
                :library-context-enabled="settingsStore.state.shell.library_context_enabled === true"
                :global-library-context-policy="settingsStore.state.shell.library_context_policy"
                :session-library-context-policy="activeSessionLibraryContextPolicy"
                :preview-url="chatController.attachments.previewUrl"
                :read-text="chatController.attachments.hydrateText"
                :read-bytes="chatController.attachments.previewBytes"
                :set-shared="chatController.attachments.setVaultFileShared"
                :set-session-library-context-policy="chatController.chat.setSessionLibraryContextPolicy"
                @close="mediaPanelOpen = false"
                @open="mediaPanelOpen = false"
            />

            <TalosMobileToolAuthorizationRecoveryCard
                v-if="activeToolAuthorizationRecovery && chatController.toolAuthorizationPromptVisible.value"
                :session-title="activeToolAuthorizationRecovery.session_title"
                :tools="activeToolAuthorizationRecovery.tools"
                :recovery-count="chatController.toolAuthorizationRecoveries.value.length"
                :busy="toolAuthorizationRecoveryBusy === activeToolAuthorizationRecovery.checkpoint_id"
                @retry="void retryToolAuthorizationRecovery(activeToolAuthorizationRecovery.checkpoint_id)"
                @cancel="void cancelToolAuthorizationRecovery(activeToolAuthorizationRecovery.checkpoint_id)"
                @later="chatController.dismissToolAuthorization()"
            />
            <TalosMobileToolConsentSheet
                v-else-if="activeToolAuthorization && chatController.toolAuthorizationPromptVisible.value"
                :title="activeToolAuthorization.title"
                :description="activeToolAuthorization.description"
                :input="activeToolAuthorization.input"
                :actions="activeToolAuthorization.actions"
                :session-title="activeToolAuthorization.session_title"
                :pending-count="chatController.pendingToolAuthorizations.value.length"
                :allow-persistent="activeToolAuthorization.allow_persistent"
                @allow-once="void chatController.decideToolAuthorization(activeToolAuthorization.request_id, 'allow_once')"
                @always-allow="void chatController.decideToolAuthorization(activeToolAuthorization.request_id, 'always_allow')"
                @deny="void chatController.decideToolAuthorization(activeToolAuthorization.request_id, 'deny')"
                @later="chatController.dismissToolAuthorization()"
            />
            <button
                v-else-if="toolAuthorizationReviewCount > 0"
                type="button"
                data-testid="talos-tool-authorization-reopen"
                class="talos-pressable pointer-events-auto fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 z-[94] min-h-11 rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] px-4 text-xs font-medium text-[var(--talos-text)] shadow-lg"
                @click="chatController.showToolAuthorization()"
            >
                {{ $t('chat.reviewToolActions', {
                    count: toolAuthorizationReviewCount,
                }) }}
            </button>

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
                :cleanup-plan-for="cleanupPlanFor"
                @delete="sidebarDelete"
                @navigate="sidebarNavigate"
                @open-model-lab="sidebarNavigate('settings', { tab: 'models' })"
                @open-settings="sidebarNavigate('settings')"
            />

            <!-- F6 — tablet split view: [chat panel | divider | content column].
                 On phones the row degenerates to the single content column. -->
            <div class="relative z-10 flex min-h-0 flex-1">
                <template v-if="tabletChatRailVisible">
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
                        :cleanup-plan="activeCleanupPlan"
                        :session-busy="sessionBusy"
                        @delete="immersiveDelete"
                        @export="exportSheetOpen = true"
                        :can-open-media="canOpenChatMedia"
                        @media="openChatMedia"
                    />
                    <TalosMobileImmersiveChrome
                        v-else
                        :active-title="headerTitle"
                        :busy="sessionBusy"
                        :hide-menu="tabletLayout.isTablet.value"
                        @open-menu="sidebarOpen = true"
                        @new-chat="sidebarNewChat"
                        @rename="immersiveRename"
                        :cleanup-plan="activeCleanupPlan"
                        @delete="immersiveDelete"
                        @export="exportSheetOpen = true"
                        :can-open-media="canOpenChatMedia"
                        @media="openChatMedia"
                    />

                    <main class="relative flex-1 overflow-hidden">
                        <ChatScreen ref="chatScreen" @export="exportSheetOpen = true" />
                    </main>
                </div>
            </div>

            <TalosMobileToastRegion />

            <TalosLauncherIconDialog v-if="launcherIcon.state.pending" />

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
