<script setup lang="ts">
import { talosIsEphemeralSessionId } from '@/lib/chat/ephemeralSession'
import { talosChatDiscardedByModeSwitch } from '@/lib/chat/modeSwitch'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { talosTranslatableErrorMessage } from '@/i18n/uiErrors'
import type { TalosSessionCleanupPlan } from '@/lib/chat/sessionCleanup'
import TalosBootLogo from '@/components/brand/TalosBootLogo.vue'
import TalosMobileHeader from '@/components/shell/TalosMobileHeader.vue'
import TalosMobileToastRegion from '@/components/shell/TalosMobileToastRegion.vue'
import ChatScreen from '@/screens/ChatScreen.vue'
import { TALOS_MOBILE_ROUTES, talosMobileParentRoute, talosMobileStationOf, type TalosMobileRouteName } from '@/lib/mobileRoutes'
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
import {
    resolveTalosBackAction,
    TALOS_FINESTRA_USCITA_MS,
    talosUscitaConConferma,
    talosStationEntryAfter,
    talosStationExit,
    type TalosStationEntry,
} from '@/lib/backNavigation'
import { talosOnNotificationRoute, talosTakeLaunchRoute } from '@/services/doneNotification'
import { talosOverlayBackActive, handleTalosOverlayBack } from '@/composables/useTalosOverlayBack'
import { talosLightImpact } from '@/services/haptics'
import { Capacitor } from '@capacitor/core'
import { setTalosScreenSecure } from '@/services/privacyScreen'
import { talosHarnessUiAvailable } from '@/services/harnessUi'
import { applyTalosFontScale } from '@/lib/talosFontScale'
import { useTalosMobileToasts } from '@/stores/toasts'
import { useTalosTabletLayout } from '@/composables/useTalosTabletLayout'
import { useTalosSheetNav } from '@/composables/useTalosSheetNav'
import { clampTalosTabletSidebarWidth, talosTabletLeavesChatsRoute, talosTabletLeavesHarnessListRoute, talosTabletSidebarEffectiveWidth } from '@/lib/tabletLayout'
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
// The animated workspace backdrop is useful on the empty hero, but it is pure
// competition once a real thread is visible: chat scrolling must not share a
// frame budget with a decorative canvas. Keep the empty-chat presentation.
const chatHasMessages = computed(() => chatController.chat.messages.length > 0)

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
// Image consent is exceptional, so its dialog belongs outside the first-paint
// chunk just like the other optional shell overlays below.
const TalosMobileConfirmDialog = defineAsyncComponent(
    () => import('@/components/shell/TalosMobileConfirmDialog.vue'),
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
    '--talos-tablet-rail': tabletChatRailVisible.value ? `${tabletEffectiveRailWidth.value}px` : '0px',
    '--talos-tablet-sidebar-width': `${tabletEffectiveRailWidth.value}px`,
}))

// F1-T3 (D5/D6): hamburger sidebar state + the ChatScreen exposed session actions
// (attachment revocation + draft scoping stay orchestrated in one place).
const sidebarOpen = ref(false)
async function openGlobalSidebar(): Promise<void> {
    // A modal <dialog> inside Harness lives in the browser top layer: no
    // z-index can place the global drawer above it. Close that transient layer
    // first, then open the one navigation surface that owns the whole app.
    if (activeRoute.value === 'harness-session') {
        const bridge = await import('@/lib/harnessUiBridge')
        bridge.dismissTalosHarnessUiTransientLayers()
    }
    sidebarOpen.value = true
}
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
// DUE sorgenti, non una che restituisce un array.
//
// Owner 2026-08-03, con uno screenshot: cambiando il layout della Libreria
// compariva «Aggiornare l'icona dell'app?». Due difetti impilati, e nessuno dei
// due nell'icona.
//
// `setShell()` rimpiazza l'INTERO oggetto `state.shell` (`parseShellPreferences`
// costruisce un valore nuovo), quindi scrivere `library_view` invalida la
// dipendenza su `state.shell` anche se `launcher_icon_follows_theme` non si è
// mosso, e il getter rigira. Fin qui sarebbe innocuo — se non che il getter
// restituiva un ARRAY NUOVO a ogni giro, e Vue confronta per identità: un array
// nuovo è sempre «cambiato», quindi nulla filtrava il giro spurio.
//
// Con due getter separati Vue confronta elemento per elemento, e una coppia
// immutata non fa scattare niente.
watch(
    [
        () => themeStore.state.theme,
        () => settingsStore.state.shell.launcher_icon_follows_theme,
    ],
    ([theme, enabled]) => { launcherIcon.evaluate(theme, enabled) },
)
const chatScreen = ref<InstanceType<typeof ChatScreen> | null>(null)
const headerTitle = computed(() => chatController.chat.activeSession.value?.title ?? '')
const sessionBusy = computed(() =>
    Boolean((chatScreen.value as { sessionActionBusy?: boolean } | null)?.sessionActionBusy)
    || shellActionBusy.value)

/**
 * How the station you are looking at was entered, so Back can undo that exact
 * move instead of jumping to a fixed place.
 *
 * Owner 2026-08-03, on the old behaviour: «se la pagina ricerca si apre dalla
 * sidebar, se torno indietro perché mi chiude la sidebar e mi torna alla chat?»
 * Back ran `navigate('chat')` and forced the drawer open whatever had happened
 * before — so a station opened from the Settings Center took the Settings
 * Center with it on the way out.
 *
 * The drawer is state, not a route, which is why history alone cannot answer
 * this: popping back to the chat would lose the menu the person came from.
 */
const stationEntry = ref<TalosStationEntry | null>(null)
let enteringViaSidebar = false

function sidebarNavigate(name: TalosMobileRouteName, query: LocationQueryRaw = {}): void {
    enteringViaSidebar = true
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

/**
 * F-14. The same act as New chat with one thing taken away, so it lives beside
 * it rather than in a settings screen you have to remember to switch back.
 */
/** The switch reads the other way inside incognito, so the shells need to know. */
const activeChatIsIncognito = computed(
    () => talosIsEphemeralSessionId(chatController.chat.activeSession.value?.id ?? ''),
)

/**
 * Owner 2026-07-31: «la possibilità di aprire una nuova chat in incognito
 * quando sei in una normale, dai puntini in alto a destra, deve sparire. La
 * lasciamo esclusivamente quando si inizia una nuova chat».
 *
 * The same condition the welcome pill already lives under, so the two doors
 * appear and disappear together instead of disagreeing about when they exist.
 */
const activeChatIsEmpty = computed(() => chatController.chat.messages.length === 0)

/**
 * Owner 2026-07-31: the button you press must change into its opposite. Leaving
 * incognito opens an ORDINARY chat rather than converting the one you are in —
 * the same single rule in both directions, so there is never a question about
 * what happened to what you already wrote.
 */
/**
 * Both directions of the switch, and the fate of the chat left behind decided
 * by ONE rule (see modeSwitch.ts) rather than by which button was pressed.
 */
async function switchChatMode(ephemeral: boolean): Promise<void> {
    const leaving = chatController.chat.activeSession.value?.id ?? null
    // Read BEFORE the switch: afterwards this array belongs to the new chat.
    const leavingWasEmpty = chatController.chat.messages.length === 0
    await chatController.sessionLifecycle.newSession(ephemeral ? { ephemeral: true } : undefined)
    const discarded = talosChatDiscardedByModeSwitch({
        leaving, arrived: chatController.chat.activeSession.value?.id ?? null, leavingWasEmpty,
    })
    // Deleted AFTER the new chat exists, so there is never a moment with none.
    if (discarded) await chatController.deleteSession(discarded).catch(() => undefined)
    if (isStation.value) await navigate('chat')
}

function sidebarNormalMode(): void {
    sidebarOpen.value = false
    lifecycleAction(t('chat.normalMode'), () => switchChatMode(false))
}

function sidebarTemporaryChat(): void {
    sidebarOpen.value = false
    lifecycleAction(t('chat.temporaryChat'), () => switchChatMode(true))
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
/**
 * ⛔ Il piano ha la PRECEDENZA sulla scheda del singolo tool.
 *
 * Se comparissero insieme, la persona vedrebbe una conferma in piu' invece di
 * quattro in meno — e il guadagno del piano si annullerebbe esattamente nel
 * momento in cui doveva vedersi. Vedi il `v-if` piu' sotto.
 */
const TalosMobilePlanSheet = defineAsyncComponent(
    () => import('@/components/chat/TalosMobilePlanSheet.vue'),
)
const TalosMobileToolConsentSheet = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileToolConsentSheet.vue'),
)
const TalosMobileToolAuthorizationRecoveryCard = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileToolAuthorizationRecoveryCard.vue'),
)
/**
 * ⛔⛔ MISURATO sul Pad il 21/8: montata invece dentro `TalosBarraRoot.vue`
 * (il ruolo assistente separato, avviato da `lib/barra/avvia.ts` — non
 * questa app), `pendingLocalEngineProbeConsent` si valorizzava per davvero
 * ma NESSUN componente la leggeva mai, perché quell'albero Vue non è mai
 * montato durante l'uso normale della chat. `composer_model` cambiava,
 * `local_engine_probe.consent` restava `unset` per sempre, e la modale non
 * compariva in nessuna schermata reale. La sede giusta è qui — la stessa di
 * `TalosMobileToolConsentSheet`, l'altra modale di consenso che l'app
 * mostra davvero durante la chat.
 */
const TalosLocalEngineProbeConsentSheet = defineAsyncComponent(
    () => import('@/components/shell/TalosLocalEngineProbeConsentSheet.vue'),
)
const activeToolAuthorization = computed(() =>
    chatController.pendingToolAuthorizations.value[0] ?? null)
const activeToolAuthorizationRecovery = computed(() =>
    chatController.toolAuthorizationRecoveries.value[0] ?? null)
const toolAuthorizationReviewCount = computed(() =>
    chatController.pendingToolAuthorizations.value.length
    + chatController.toolAuthorizationRecoveries.value.length)

/**
 * ⛔⭐⭐ QUALE delle superfici è davvero a schermo — non «quale sarebbe la sua
 * volta» in una catena di `v-else-if`.
 *
 * Il pulsante «Controlla azioni» è l'unica via verso un permesso in sospeso, e
 * stava in coda a quella catena: bastava un foglio del piano rimasto aperto
 * perché sparisse. Riscrivere la sua condizione a mano avrebbe ripetuto lo
 * stesso errore al contrario — nascondendolo proprio quando il piano copre la
 * scheda di consenso, cioè nel caso da salvare.
 *
 * ⇒ La catena e il pulsante leggono le STESSE tre bandiere. Se una superficie
 * mostra la richiesta, il pulsante tace; altrimenti c'è. Non esiste un terzo
 * caso, e non c'è modo di scriverne uno per sbaglio.
 */
const recoveryCardShown = computed(() =>
    activeToolAuthorizationRecovery.value !== null
    && chatController.toolAuthorizationPromptVisible.value)
const planSheetShown = computed(() =>
    !recoveryCardShown.value && chatController.planRequest.value !== null)
const consentSheetShown = computed(() =>
    !recoveryCardShown.value
    && !planSheetShown.value
    && activeToolAuthorization.value !== null
    && chatController.toolAuthorizationPromptVisible.value)
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
let stopNotificationRoutes: (() => void) | null = null

const activeRoute = computed<TalosMobileRouteName>(() => {
    const match = TALOS_MOBILE_ROUTES.find((entry) => entry.name === route.name)
    return match ? match.name : 'chat'
})

/**
 * Model Lab is a short hierarchy rather than four unrelated sheets.
 *
 * The depth is also the motion direction: entering one of the three dedicated
 * pages moves forward, returning to the Lab moves back, and opening one model
 * repository moves forward once more. Provider wire names never leak into this
 * navigation boundary.
 */
const MODEL_LAB_ROUTE_DEPTH = {
    'settings-models': 0,
    'settings-models-providers': 1,
    'settings-models-catalog': 1,
    'settings-models-local': 1,
    'settings-models-local-repo': 2,
} satisfies Partial<Record<TalosMobileRouteName, number>>
const modelLabTransitionDirection = ref<'forward' | 'back'>('forward')
const modelLabTransitionActiveClass = 'transition-[transform,opacity] duration-[var(--talos-motion-duration-tab-change)] ease-[var(--talos-motion-ease-tab-change)] motion-reduce:transition-none'
const modelLabTransitionEnterFromClass = computed(() => [
    'opacity-[var(--talos-motion-tab-change-opacity)]',
    modelLabTransitionDirection.value === 'forward'
        ? 'translate-x-[var(--talos-motion-tab-change-x)]'
        : '-translate-x-[var(--talos-motion-tab-change-x)]',
    'motion-reduce:opacity-100 motion-reduce:transform-none',
].join(' '))
const modelLabTransitionLeaveToClass = computed(() => [
    'opacity-[var(--talos-motion-tab-change-opacity)]',
    modelLabTransitionDirection.value === 'forward'
        ? '-translate-x-[var(--talos-motion-tab-change-x)]'
        : 'translate-x-[var(--talos-motion-tab-change-x)]',
    'motion-reduce:opacity-100 motion-reduce:transform-none',
].join(' '))

function isModelLabRouteName(name: unknown): name is keyof typeof MODEL_LAB_ROUTE_DEPTH {
    return typeof name === 'string' && Object.prototype.hasOwnProperty.call(MODEL_LAB_ROUTE_DEPTH, name)
}

function focusModelLabRoute(element: Element): void {
    if (element instanceof HTMLElement) element.focus({ preventScroll: true })
}

// Chat is the persistent base; every other tab presents its screen in a sheet
// over it — the mobile mirror of the desktop windowed workspace.
const isStation = computed(() => activeRoute.value !== 'chat')
const stationLocksBodyScroll = computed(() => activeRoute.value === 'harness-session')
/**
 * Recorded when the STATION changes, never when you move within one: going from
 * the research list to a report is not entering a station, and treating it as
 * one would make Back navigate the list to itself.
 */
watch([activeRoute, () => route.params] as const, ([to], [from, fromParams]) => {
    if (isModelLabRouteName(to) && isModelLabRouteName(from)) {
        modelLabTransitionDirection.value = MODEL_LAB_ROUTE_DEPTH[to] >= MODEL_LAB_ROUTE_DEPTH[from]
            ? 'forward'
            : 'back'
    }
    stationEntry.value = talosStationEntryAfter(stationEntry.value, {
        to,
        from,
        fromParams,
        viaSidebar: enteringViaSidebar,
    })
    enteringViaSidebar = false
})

/**
 * Where a tapped notification lands.
 *
 * The address travels on the notification itself, so this stays a dumb router
 * push: the thing that finished knows which page it belongs to, and nothing
 * here has to guess from a title. Query parameters survive because other
 * notification targets may legitimately carry filters; Model Lab itself now
 * has dedicated routes.
 *
 * The sidebar closes on the way. Arriving from outside the app with the main
 * menu open over the page you asked for would be the notification landing
 * somewhere you then have to navigate out of.
 */
async function followNotificationRoute(target: string): Promise<void> {
    const [path, search] = target.split('?')
    if (!path) return
    sidebarOpen.value = false
    await router.push({
        path,
        query: search ? Object.fromEntries(new URLSearchParams(search)) : {},
    }).catch(() => undefined)
}

/** Back at a station top: undo the move that brought you here. */
function leaveStation(): void {
    const exit = talosStationExit(stationEntry.value)
    void navigate(exit.route as TalosMobileRouteName, {}, exit.params)
    sidebarOpen.value = exit.sidebar
}
/**
 * A page INSIDE a station, which System Back must leave one level at a time.
 *
 * `isStation` says "not the chat" and is true just as much for a claim as for
 * the research list, which is why Back used to throw a person all the way out
 * to the chat with the main menu open (reported on the phone, reproduced on the
 * tablet 2026-08-03). The route table now declares each nested page's parent;
 * this reads it rather than pattern-matching on names.
 */
const stationParent = computed(() => talosMobileParentRoute(
    activeRoute.value,
    route.params as Record<string, unknown>,
))
// TABLET-SETTINGS-01: Settings categories are the primary pane for that task.
// Mounting the unrelated chat rail beside them creates a redundant third pane.
/**
 * Il gradino sopra, per il pulsante in alto a sinistra.
 *
 * Owner 2026-08-04, provato sul telefono: «il pulsante indietro in alto a
 * sinistra fa chiudere tutto». La gesture di sistema risaliva la catena — usa
 * `stationParent` poche righe piu' sotto — e quel bottone no: due comandi per
 * lo stesso gesto, con due destinazioni diverse.
 *
 * Ora leggono la STESSA cosa. Se domani la catena cambia, cambia per entrambi.
 */
function goToStationParent(): void {
    const parent = stationParent.value
    if (parent) void router.push(parent)
}

/** Il nome del posto dove si torna, perche' il pulsante possa dirlo. */
const stationParentTitle = computed(() => {
    const parent = stationParent.value
    if (!parent) return undefined
    const key = SHEET_TITLE_KEY[parent.name as TalosMobileRouteName]
    return key ? t(key) : undefined
})

const tabletChatRailVisible = computed(() => (
    tabletLayout.isTablet.value && talosMobileStationOf(activeRoute.value) !== 'settings'
))

// F6 sidebar refactor (24/8): quale contenuto mostra il rail persistente.
// Ferma alla stessa domanda già risposta sopra (talosMobileStationOf), non
// una seconda lettura di rotta — solo Harness sostituisce la chat; ogni
// altra stazione (Memoria, Note, ecc.) resta un foglio SOPRA il rail chat,
// invariato.
//
// ⛔⛔⛔ 3/9 — owner, urgente: questo leggeva SOLO il nome della rotta, mai
// se Codice fosse disponibile su QUESTA build — su un APK di release
// (dove talosHarnessUiAvailable() torna sempre false, il plugin nativo non
// compila) la barra tablet mostrava comunque tutta la chrome "harness"
// (titolo, elenco sessioni) se la rotta corrente era /harness/*, mentre il
// contenuto diceva onestamente "not available": l'app "diceva di avere
// Codice" da un pannello e lo negava dall'altro. Il guard nuovo in
// router/index.ts impedisce ormai di ARRIVARE su quella rotta senza
// disponibilità; questo controllo resta come seconda rete, non l'unica.
const tabletRailVariant = computed<'chat' | 'harness'>(() => (
    talosMobileStationOf(activeRoute.value) === 'harness' && talosHarnessUiAvailable() ? 'harness' : 'chat'
))
const tabletHarnessRailCollapsed = computed(() => (
    tabletRailVariant.value === 'harness'
    && settingsStore.state.shell.tablet_harness_sidebar_collapsed
))
const tabletEffectiveRailWidth = computed(() => talosTabletSidebarEffectiveWidth(
    tabletSidebarWidth.value,
    tabletRailVariant.value,
    tabletHarnessRailCollapsed.value,
))
function toggleTabletHarnessRail(): void {
    void settingsStore.setShell({
        tablet_harness_sidebar_collapsed: !settingsStore.state.shell.tablet_harness_sidebar_collapsed,
    }).catch(() => undefined)
}

const SHEET_TITLE_KEY: Record<TalosMobileRouteName, string> = {
    'settings-privilege': 'privilege.pageTitle',
    chat: 'navigation.chat',
    chats: 'navigation.chats',
    memory: 'navigation.memory',
    tasks: 'navigation.tasks',
    notes: 'navigation.notes',
    /*
     * Le pagine di dettaglio tengono il nome della STAZIONE nell'intestazione.
     *
     * La stessa scelta gia' fatta per le pagine interne della Ricerca: ogni
     * pagina si intitola da se' col titolo della cosa che mostra, e ripetere
     * quel titolo anche nella cornice spenderebbe l'unica riga che c'e' su un
     * telefono per dire due volte la stessa parola.
     */
    'memory-item': 'navigation.memory',
    'task-item': 'navigation.tasks',
    'note-item': 'navigation.notes',
    doctor: 'navigation.doctor',
    research: 'stations.deepResearchTitle',
    // The inner research surfaces keep the station's name in the sheet header:
    // each page titles itself, and repeating that title twice on a phone spends
    // the one line of chrome there is on saying the same thing.
    'research-new': 'research.newTitle',
    // Le pagine di creazione dicono cosa STANNO creando, e non il nome della
    // stazione: qui la cornice è l'unica cosa che distingue «una nota nuova»
    // dall'elenco delle note che sta dietro.
    'note-new': 'notes.add',
    'memory-new': 'memory.newMemory',
    'task-new': 'tasks.add',
    'research-report': 'stations.deepResearchTitle',
    // These two DO name themselves: on the device the sheet header wins over
    // the screen's own title, so leaving the station's name there made a claim
    // page and a source page indistinguishable from the list behind them.
    'research-claim': 'research.claimTitle',
    'research-source': 'research.sourceTitle',
    context: 'navigation.library',
    // Harness UI (24/8): the "detail" is a trampoline, not a page anyone
    // reads a distinct title on — reuse the same key as the list, like
    // memory/memory-item, tasks/task-item, notes/note-item do.
    harness: 'navigation.harness',
    'harness-session': 'navigation.harness',
    toolforge: 'navigation.toolForge',
    settings: 'stations.settingsCenterTitle',
    'settings-models': 'models.labTitle',
    'settings-models-providers': 'models.providerAccessTitle',
    'settings-models-catalog': 'models.catalogTitle',
    'settings-models-local': 'models.localTitle',
    'settings-models-local-repo': 'models.localTitle',
}
const sheetTitle = computed(() => t(SHEET_TITLE_KEY[activeRoute.value]))

const navItems = computed(() => TALOS_MOBILE_ROUTES.map((entry) => ({
    name: entry.name,
    label: t(SHEET_TITLE_KEY[entry.name]),
})))

function pathFor(name: TalosMobileRouteName): string {
    return TALOS_MOBILE_ROUTES.find((entry) => entry.name === name)?.path ?? '/'
}
/**
 * ⛔⛔ LISTA-DOPPIA-01 — la stessa lista, due volte, affiancata.
 *
 * FOTOGRAFATO dall'owner il 2026-08-20: barra laterale con l'elenco delle
 * chat a sinistra, e a destra — dove va la conversazione — lo stesso elenco,
 * con la sua intestazione e la sua freccia indietro.
 *
 * ⛔ Una guardia esisteva già, ma solo per il ripristino ad avvio freddo.
 * Ci si arriva anche a caldo, e per due strade che capitano davvero: dal
 * telefono si tocca «Tutte le chat» e poi si ruota, oppure si allarga la
 * finestra in affiancata. Per questo la sorveglianza è su ENTRAMBI —
 * il formato e la rotta — e non su uno dei due: cambiarne uno solo basta a
 * produrre il difetto.
 *
 * `replace` e non `push`: non è una pagina che la persona ha chiesto, è una
 * pagina che sul tablet non esiste. Lasciarla nella storia vorrebbe dire che
 * il tasto indietro ci riporta dentro.
 */
watch(
    () => [tabletLayout.isTablet.value, activeRoute.value] as const,
    ([isTablet, rotta]) => {
        if (talosTabletLeavesChatsRoute(isTablet, rotta)) void router.replace(pathFor('chat'))
        // Stessa domanda, per Harness: la barra laterale ora mostra il suo
        // elenco (vedi tabletRailVariant) quando la stazione è Harness, quindi
        // la rotta-elenco nuda nel riquadro principale la duplicherebbe.
        else if (talosTabletLeavesHarnessListRoute(isTablet, rotta)) void openDefaultHarnessSession()
    },
    { immediate: true },
)

/**
 * 28/8 — le sessioni Codice sono vere ora: niente più un id demo fisso
 * (`HARNESS_DEFAULT_SESSION_ID`, ritirato insieme all'array che descriveva).
 * Il riquadro principale del tablet apre la sessione più di recente
 * aggiornata se ce n'è una, altrimenti la pagina di bozza ('new') — mai un
 * id inventato che potrebbe non esistere (nessuna sessione ancora creata,
 * o una cancellata).
 *
 * ⛔ `import()` dinamico e non statico in cima al file: la stessa trappola
 * già misurata qui sopra per `HARNESS_DEFAULT_SESSION_ID` (peso eager
 * trascinato dentro App.vue) — `codiceSessions.ts` importa il repository di
 * produzione, e questa funzione gira SOLO dentro un `watch`, mai
 * all'avvio: nessun motivo per pagarla nel chunk iniziale.
 */
async function openDefaultHarnessSession(): Promise<void> {
    const { listCodiceSessions } = await import('@/lib/harness/codiceSessions')
    const sessions = await listCodiceSessions()
    void router.replace({ name: 'harness-session', params: { id: sessions[0]?.id ?? 'new' } })
}

async function navigate(
    name: TalosMobileRouteName,
    query: LocationQueryRaw = {},
    params: Readonly<Record<string, string | string[]>> = {},
): Promise<void> {
    await router.push({ name, params, query })
    await preferences.setLastRoute(name)
}

/**
 * ⛔ Il guardiano delle capacità: si stacca quando l'app se ne va.
 *
 * Owner 2026-08-07: «ogni volta che i permessi si spengono per colpa dell'OS
 * dobbiamo segnalarlo in maniera efficace». Shizuku muore a ogni riavvio del
 * telefono, quindi non è un caso limite: è la normalità di ogni mattina.
 */
let staccaGuardiano: (() => void) | null = null

onMounted(async () => {
    /*
     * Importato in modo DINAMICO come gli altri: il grafo d'avvio ha meno di
     * 4 KB di margine, e questo file l'ha già sfondato una volta.
     */
    void import('@/services/capabilityWatchService')
        .then((modulo) => { staccaGuardiano = modulo.talosStartCapabilityWatch() })
        .catch(() => { /* un guardiano che non parte non deve fermare l'app */ })

    /**
     * Il centro notifiche prende le sue due superfici.
     *
     * Owner 2026-08-06: «ogni funzione, tool, download, installazione deve avere
     * notifica toast E Android». Il registro sa gia' DOVE va ogni evento; qui gli
     * si dice soltanto come si fa un toast e come si posta su Android.
     *
     * Importati in modo DINAMICO, e non e' pignoleria: importarli in testa li
     * tirerebbe nel grafo d'avvio, che ha meno di 4 KB di margine — e importare
     * i trasferimenti dentro questo stesso file lo ha gia' sfondato una volta,
     * di 1.379 byte. La visibilita' si aggancia qui perche' cambia dove va un
     * evento: a schermo spento un toast non lo vede nessuno.
     */
    void (async () => {
        const [centro, ponte] = await Promise.all([
            import('@/stores/notificationCentre'),
            import('@/services/notificationBridge'),
        ])
        centro.talosOnNotificationToast((evento) => {
            toastsStore.push({
                message: evento.body ?? evento.title,
                // Chi chiede una decisione resta piu' a lungo: e' l'unico che
                // costa qualcosa se sfugge.
                durationMs: evento.weight === 'demanding' ? 8_000 : 4_000,
            })
        })
        centro.talosOnNotificationAndroid((evento) => {
            void ponte.talosPostSystemNotification(evento)
        })
        const aggiornaVisibilita = () => {
            centro.talosSetAppVisible(document.visibilityState === 'visible')
        }
        aggiornaVisibilita()
        document.addEventListener('visibilitychange', aggiornaVisibilita)
    })()

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
    // Router installation and App mount intentionally run without blocking the
    // first paint. Synchronize only this restoration decision so a lazy initial
    // deep link is no longer mistaken for the temporary START_LOCATION/chat.
    await router.isReady()
    const lastRoute = preferences.state.last_route
    // A remembered station is a convenience only for the neutral launcher
    // address. A copied/deep-linked URL is an explicit user request and must
    // survive cold boot and reload, including Model Lab child pages.
    if (activeRoute.value === 'chat' && lastRoute
        && !(tabletLayout.isTablet.value && lastRoute === 'chats')) {
        await router.replace(pathFor(lastRoute))
    }
    /**
     * A notification tapped while the app was closed, taken AFTER the remembered
     * route is restored — restoring it afterwards would overwrite the very page
     * the person asked for by tapping.
     */
    const launched = await talosTakeLaunchRoute()
    if (launched) await followNotificationRoute(launched)
    // And one tapped while the app was already up, which arrives as an event
    // because there is nobody to ask at that point.
    stopNotificationRoutes = talosOnNotificationRoute((target) => { void followNotificationRoute(target) })
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
            onBack: (event) => talosIndietro(event.canGoBack),
            onError: (error) => {
                console.error(`[native-lifecycle] ${error.code}: ${error.message}`)
            },
        })
        await lifecycle.ready.catch(() => undefined)
    }
})

/**
 * ⛔ Il gesto Indietro e il TASTO Indietro passano da qui, tutti e due.
 *
 * Owner 2026-08-06: «il pulsante indietro in alto a sinistra non si comporta
 * come la gesture indietro».
 *
 * La decisione era già una funzione pura e provata — `resolveTalosBackAction` —
 * ma la usava **solo il gesto di sistema**. Il tasto nel foglio aveva una
 * logica sua, più povera: conosceva la sotto-vista e il genitore, e ignorava
 * l'overlay del compositore, l'intro e la sidebar. Due strade per lo stesso
 * atto che finivano in posti diversi, e che avrebbero continuato a divergere a
 * ogni pagina nuova.
 *
 * La linea guida Android dice esattamente questo: gesto e tasto devono
 * percorrere **lo stesso codice**, o il preview del gesto predittivo mostra una
 * destinazione e il tasto ne raggiunge un'altra.
 */
/** Quando e' stato chiesto l'ultimo indietro dalla radice. Vedi il caso `exit`. */
let ultimaUscita: number | null = null

function talosIndietro(canGoBack: boolean): 'handled' | 'history' | 'exit' {
    const action = resolveTalosBackAction({
        composerOverlayOpen: talosOverlayBackActive(),
        wizardOpen: intro.introOpen.value,
        sidebarOpen: sidebarOpen.value,
        hasSheetSubView: sheetNav.subView.value !== null,
        isStationSubPage: stationParent.value !== null,
        isStation: isStation.value,
        canGoBack,
    })
    switch (action) {
        case 'close-overlay': handleTalosOverlayBack(); return 'handled'
        case 'dismiss-wizard': intro.handleBack(); return 'handled'
        case 'close-sidebar': sidebarOpen.value = false; return 'handled'
        case 'sheet-subview-back': sheetNav.subView.value?.back(); return 'handled'
        case 'station-subpage-parent': {
            // Only reached with nothing to undo, so this is a push to the level
            // above rather than a pop.
            const parent = stationParent.value
            if (parent) void router.push(parent)
            return 'handled'
        }
        case 'leave-station': leaveStation(); return 'handled'
        case 'history': return 'history'
        case 'exit': {
            /*
             * ⛔ DUE COLPI PER USCIRE. Il perche', col numero che l'ha
             * provocato, sta su `talosUscitaConConferma`: dalla chat un solo
             * indietro chiudeva TALOS senza avvisare, e `history.length` era 1
             * — nessuna pila da risalire, solo la porta.
             */
            const ora = Date.now()
            if (talosUscitaConConferma({ ora, ultimaRichiesta: ultimaUscita }) === 'esci') {
                ultimaUscita = null
                return 'exit'
            }
            ultimaUscita = ora
            toastsStore.push({
                message: t('navigation.pressBackAgainToExit'),
                durationMs: TALOS_FINESTRA_USCITA_MS,
            })
            return 'handled'
        }
    }
}


onBeforeUnmount(async () => {
    staccaGuardiano?.()
    staccaGuardiano = null
    stopNotificationRoutes?.()
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
        <TalosMobileBackground
            v-if="!uiFallback"
            class="z-0"
            aria-hidden="true"
            :paused="activeRoute === 'chat' && chatHasMessages"
        />

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
                    class="min-h-touch min-w-touch flex-1 px-2 py-2 text-xs text-[var(--talos-muted)] aria-[current=page]:text-[var(--talos-accent)]"
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
                :attach-file="chatController.attachments.attachExisting"
                :delete-file="chatController.attachments.deleteVaultFile"
                :set-session-library-context-policy="chatController.chat.setSessionLibraryContextPolicy"
                @close="mediaPanelOpen = false"
                @open="mediaPanelOpen = false"
            />

            <!-- Owner 2026-08-04: un'immagine che esce dal telefono e' una
                 DECISIONE, non un gesto. Sta sopra i cartellini dei tool perche'
                 blocca un'ingestione gia' cominciata: la foto non e' ancora nel
                 Vault, e la risposta decide se ci entra. -->
            <TalosMobileConfirmDialog
                v-if="chatController.imageConsentRequest?.value"
                data-testid="talos-image-consent"
                :title="t('chat.imageConsentTitle')"
                :description="t(
                    chatController.imageConsentRequest.value!.count > 1
                        ? 'chat.imageConsentBodyMany'
                        : 'chat.imageConsentBody',
                    { provider: chatController.imageConsentRequest.value!.provider },
                )"
                @close="void chatController.answerImageConsent?.('deny')"
            >
                <template #footer>
                    <Button variant="ghost" data-testid="talos-image-consent-no" @click="void chatController.answerImageConsent?.('deny')">
                        {{ t('chat.imageConsentNever') }}
                    </Button>
                    <Button variant="outline" data-testid="talos-image-consent-always" @click="void chatController.answerImageConsent?.('allow')">
                        {{ t('chat.imageConsentAlways') }}
                    </Button>
                    <Button data-testid="talos-image-consent-once" @click="void chatController.answerImageConsent?.('once')">
                        {{ t('chat.imageConsentOnce') }}
                    </Button>
                </template>
            </TalosMobileConfirmDialog>

            <TalosMobileToolAuthorizationRecoveryCard
                v-if="recoveryCardShown && activeToolAuthorizationRecovery"
                :session-title="activeToolAuthorizationRecovery.session_title"
                :tools="activeToolAuthorizationRecovery.tools"
                :recovery-count="chatController.toolAuthorizationRecoveries.value.length"
                :error="activeToolAuthorizationRecovery.error ?? null"
                :busy="toolAuthorizationRecoveryBusy === activeToolAuthorizationRecovery.checkpoint_id"
                @retry="void retryToolAuthorizationRecovery(activeToolAuthorizationRecovery.checkpoint_id)"
                @cancel="void cancelToolAuthorizationRecovery(activeToolAuthorizationRecovery.checkpoint_id)"
                @later="chatController.dismissToolAuthorization()"
            />
            <TalosMobilePlanSheet
                v-else-if="planSheetShown && chatController.planRequest.value"
                :plan="chatController.planRequest.value"
                :session-title="chatController.chat.activeSession.value?.title ?? ''"
                @approve="(stepIds) => chatController.answerPlan(stepIds)"
                @cancel="chatController.answerPlan(null)"
                @later="chatController.answerPlan(null)"
            />
            <TalosMobileToolConsentSheet
                v-else-if="consentSheetShown && activeToolAuthorization"
                :title="activeToolAuthorization.title"
                :description="activeToolAuthorization.description"
                :input="activeToolAuthorization.input"
                :actions="activeToolAuthorization.actions"
                :session-title="activeToolAuthorization.session_title"
                :pending-count="chatController.pendingToolAuthorizations.value.length"
                :allow-persistent="activeToolAuthorization.allow_persistent"
                @allow-turn="void chatController.decideToolAuthorization(activeToolAuthorization.request_id, 'allow_turn')"
                @always-allow="void chatController.decideToolAuthorization(activeToolAuthorization.request_id, 'always_allow')"
                @deny="void chatController.decideToolAuthorization(activeToolAuthorization.request_id, 'deny')"
                @later="chatController.dismissToolAuthorization()"
            />

            <!-- §1-bis: la modale del sondaggio GPU, alla prima scelta esplicita
                 di un modello locale. Indipendente dalla catena qui sopra, come
                 il consenso sulle immagini — due domande diverse non condividono
                 una coda. -->
            <TalosLocalEngineProbeConsentSheet
                v-if="chatController.pendingLocalEngineProbeConsent.value"
                @decide="chatController.decideLocalEngineProbeConsent"
            />
            <!--
                ⛔⭐⭐ Questo pulsante è l'UNICA via verso un permesso in
                sospeso, e stava in fondo a una catena di `v-else-if` insieme
                a superfici che non c'entrano.

                Bastava che il foglio del piano restasse aperto — e `planRequest`
                si azzera SOLO da `answerPlan`, cioè solo dai tre pulsanti di
                quel foglio: un invio interrotto lo lascia lì — perché il ramo
                del piano vincesse per sempre e sia la scheda di consenso sia
                questo pulsante diventassero irraggiungibili. La chat continuava
                a dire «una richiesta è in attesa» (e diceva il vero: l'id era
                vivo) e non c'era niente da toccare.

                ⇒ La condizione ora è esplicita e NON dipende dagli altri rami:
                c'è qualcosa da rivedere, e nessuna delle due schede lo sta già
                mostrando. Un permesso è il pavimento della sicurezza: la strada
                per rispondergli non può essere il ramo di scarto di qualcos'altro.
            -->
            <button
                v-if="toolAuthorizationReviewCount > 0 && !recoveryCardShown && !consentSheetShown"
                type="button"
                data-testid="talos-tool-authorization-reopen"
                class="talos-pressable pointer-events-auto fixed right-3 min-h-touch rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] px-4 text-xs font-medium text-[var(--talos-text)] shadow-lg"
                :class="planSheetShown
                    ? 'top-[max(1rem,env(safe-area-inset-top))] z-[97]'
                    : 'bottom-[max(1rem,env(safe-area-inset-bottom))] z-[94]'"
                @click="chatController.showToolAuthorization()"
            >
                {{ $t('chat.reviewToolActions', {
                    count: toolAuthorizationReviewCount,
                }) }}
            </button>

            <TalosMobileSidebar
                v-if="sidebarEverOpened"
                v-model:open="sidebarOpen"
                :sessions="chatController.chat.history"
                :active-session-id="chatController.chat.activeSession.value?.id ?? null"
                :busy="sessionBusy"
                :creating-session="sessionBusy || chatController.chat.state.persistenceStatus !== 'ready'"
                @new-chat="sidebarNewChat"
                @temporary-chat="sidebarTemporaryChat"
                @normal-mode="sidebarNormalMode"
                :incognito="activeChatIsIncognito"
                :can-go-incognito="activeChatIsEmpty"
                @select="sidebarSelect"
                @rename="sidebarRename"
                :cleanup-plan-for="cleanupPlanFor"
                @delete="sidebarDelete"
                @navigate="sidebarNavigate"
                @open-settings="sidebarNavigate('settings')"
            />

            <!-- F6 — tablet split view: [chat panel | divider | content column].
                 On phones the row degenerates to the single content column. -->
            <div class="relative z-10 flex min-h-0 flex-1">
                <template v-if="tabletChatRailVisible">
                    <TalosTabletSidebar
                        :width="tabletEffectiveRailWidth"
                        :variant="tabletRailVariant"
                        :collapsed="tabletHarnessRailCollapsed"
                        @activated="onTabletActivated"
                        @open-menu="openGlobalSidebar"
                        @toggle-collapsed="toggleTabletHarnessRail"
                    />
                    <TalosTabletDivider
                        v-if="!tabletHarnessRailCollapsed"
                        :width="tabletEffectiveRailWidth"
                        @resize="onTabletResize"
                        @commit="commitTabletWidth"
                    />
                </template>

                <div
                    class="relative flex min-h-0 min-w-0 flex-1 flex-col"
                    :class="{ invisible: stationLocksBodyScroll }"
                >
                    <TalosMobileHeader
                        v-if="!immersiveHeader"
                        :title="headerTitle"
                        :creating-session="sessionBusy || chatController.chat.state.persistenceStatus !== 'ready'"
                        :hide-menu="tabletLayout.isTablet.value"
                        :hide-app-actions="tabletLayout.isTablet.value"
                        @open-menu="openGlobalSidebar"
                        @new-chat="sidebarNewChat"
                @temporary-chat="sidebarTemporaryChat"
                @normal-mode="sidebarNormalMode"
                :incognito="activeChatIsIncognito"
                :can-go-incognito="activeChatIsEmpty"
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
                        :hide-app-actions="tabletLayout.isTablet.value"
                        @open-menu="openGlobalSidebar"
                        @new-chat="sidebarNewChat"
                @temporary-chat="sidebarTemporaryChat"
                @normal-mode="sidebarNormalMode"
                :incognito="activeChatIsIncognito"
                :can-go-incognito="activeChatIsEmpty"
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

                    <!--
                        ⛔ Owner 2026-08-27: stessa richiesta del velo in testa
                        (`TalosMobileImmersiveChrome.vue`) ma per la striscia
                        GEMELLA in fondo — la vera barra di sistema del
                        telefono (`env(safe-area-inset-bottom)`, il gesto di
                        navigazione), non il compositore. Il compositore è
                        già opaco al 95% per suo conto; questo velo copre
                        solo lo spazio fra il suo bordo tondo e il bordo vero
                        dello schermo, dove prima non c'era NESSUNA sfumatura
                        — la richiesta era di scurirne una esistente, ma qui
                        non esisteva ancora. Stessa grammatica del gemello in
                        alto: tre fermate, MAI blur, `pointer-events-none`
                        cosi' il tocco passa al compositore sotto.
                    -->
                    <div
                        aria-hidden="true"
                        data-testid="talos-mobile-bottom-veil"
                        class="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[calc(env(safe-area-inset-bottom)+2rem)] bg-gradient-to-t from-[var(--talos-background)]/92 via-[var(--talos-background)]/60 to-transparent"
                    />
                </div>
            </div>

            <TalosMobileToastRegion />

            <TalosLauncherIconDialog v-if="launcherIcon.state.pending" />

            <Transition name="station">
                <TalosMobileToolSheet
                    v-if="isStation"
                    :title="sheetTitle"
                    :hide-app-actions="tabletLayout.isTablet.value && tabletChatRailVisible"
                    :presentation="settingsStore.state.chat_layout.mobile_window_presentation"
                    :parent-back="stationParent ? goToStationParent : null"
                    :shell-back="talosIndietro"
                    :parent-title="stationParentTitle"
                    :lock-body-scroll="stationLocksBodyScroll"
                    :hide-chrome="stationLocksBodyScroll"
                    @close="navigate('chat')"
                >
                    <RouterView v-slot="{ Component, route: renderedRoute }">
                        <Transition
                            v-if="isModelLabRouteName(renderedRoute.name)"
                            mode="out-in"
                            :enter-active-class="modelLabTransitionActiveClass"
                            :enter-from-class="modelLabTransitionEnterFromClass"
                            enter-to-class="translate-x-0 opacity-100"
                            :leave-active-class="modelLabTransitionActiveClass"
                            leave-from-class="translate-x-0 opacity-100"
                            :leave-to-class="modelLabTransitionLeaveToClass"
                            @after-enter="focusModelLabRoute"
                        >
                            <div
                                :key="renderedRoute.fullPath"
                                data-testid="talos-model-lab-route-view"
                                :data-transition-direction="modelLabTransitionDirection"
                                data-motion-duration="--talos-motion-duration-tab-change"
                                tabindex="-1"
                                class="min-h-full outline-none motion-reduce:transform-none"
                            >
                                <component :is="Component" />
                            </div>
                        </Transition>
                        <component :is="Component" v-else />
                    </RouterView>
                </TalosMobileToolSheet>
            </Transition>
        </template>
    </div>
</template>
