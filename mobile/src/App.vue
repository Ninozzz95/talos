<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TalosBootLogo from '@/components/brand/TalosBootLogo.vue'
import TalosMobileBackground from '@/components/talos/workspace/TalosMobileBackground.vue'
import TalosMobileHeader from '@/components/shell/TalosMobileHeader.vue'
import TalosMobileSidebar from '@/components/shell/TalosMobileSidebar.vue'
import TalosMobileToolSheet from '@/components/shell/TalosMobileToolSheet.vue'
import ChatScreen from '@/screens/ChatScreen.vue'
import { TALOS_MOBILE_ROUTES, type TalosMobileRouteName } from '@/lib/mobileRoutes'
import { usePreferencesStore } from '@/stores/preferences'
import { useThemeStore } from '@/stores/theme'
import {
    registerNativeAppLifecycle,
    type NativeLifecycleController,
} from '@/services/nativeAppLifecycle'
import { talosDisabledSubsystems } from '@/main'
import { createDefaultTalosMotionV6Preferences } from '@/motion-v6/defaults'
import { talosInteractionMotionStyleV6 } from '@/motion-v6/interaction/style'
import { useChatController } from '@/stores/chatController'

const router = useRouter()
const route = useRoute()
const preferences = usePreferencesStore()
const themeStore = useThemeStore()
const chatController = useChatController()
const disabled = talosDisabledSubsystems()
const uiFallback = disabled.has('ui')

// Animated brand intro over the static native splash; dismisses to the chat.
const showBoot = ref(true)
const creatingSession = ref(false)

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

// F1-T3 (D5/D6): hamburger sidebar state + the ChatScreen exposed session actions
// (attachment revocation + draft scoping stay orchestrated in one place).
const sidebarOpen = ref(false)
const chatScreen = ref<InstanceType<typeof ChatScreen> | null>(null)
const headerTitle = computed(() => chatController.chat.activeSession.value?.title ?? '')
const sessionBusy = computed(() => Boolean((chatScreen.value as { sessionActionBusy?: boolean } | null)?.sessionActionBusy) || creatingSession.value)

function sidebarNavigate(name: TalosMobileRouteName): void {
    sidebarOpen.value = false
    void navigate(name)
}

function sidebarNewChat(): void {
    sidebarOpen.value = false
    const screen = chatScreen.value as { newSession?: () => void } | null
    if (screen?.newSession) screen.newSession()
    else void onNewChat()
}

function sidebarSelect(sessionId: string): void {
    sidebarOpen.value = false
    ;(chatScreen.value as { selectSession?: (id: string) => void } | null)?.selectSession?.(sessionId)
}

function sidebarRename(sessionId: string, title: string): void {
    ;(chatScreen.value as { renameSession?: (id: string, t: string) => void } | null)?.renameSession?.(sessionId, title)
}

function sidebarDelete(sessionId: string): void {
    ;(chatScreen.value as { deleteSession?: (id: string) => void } | null)?.deleteSession?.(sessionId)
}

let lifecycle: NativeLifecycleController | null = null

const activeRoute = computed<TalosMobileRouteName>(() => {
    const match = TALOS_MOBILE_ROUTES.find((entry) => entry.name === route.name)
    return match ? match.name : 'chat'
})

// Chat is the persistent base; every other tab presents its screen in a sheet
// over it — the mobile mirror of the desktop windowed workspace.
const isStation = computed(() => activeRoute.value !== 'chat')

const SHEET_TITLE: Record<TalosMobileRouteName, string> = {
    chat: 'Chat',
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

async function onNewChat(): Promise<void> {
    if (creatingSession.value || chatController.chat.state.persistenceStatus !== 'ready') return
    creatingSession.value = true
    try {
        await chatController.newSession()
        await navigate('chat')
    } finally {
        creatingSession.value = false
    }
}

onMounted(async () => {
    await preferences.hydrate()
    if (preferences.state.last_route && preferences.state.last_route !== activeRoute.value) {
        await router.replace(pathFor(preferences.state.last_route))
    }
    if (!disabled.has('lifecycle')) {
        lifecycle = registerNativeAppLifecycle({
            onBack: (event) => {
                // Android Back: sidebar first, then an open station sheet.
                if (sidebarOpen.value) {
                    sidebarOpen.value = false
                    return 'handled'
                }
                if (isStation.value) {
                    void navigate('chat')
                    return 'handled'
                }
                return event.canGoBack ? 'history' : 'exit'
            },
            onError: (error) => {
                console.error(`[native-lifecycle] ${error.code}: ${error.message}`)
            },
        })
        await lifecycle.ready.catch(() => undefined)
    }
})

onBeforeUnmount(async () => {
    await lifecycle?.dispose()
})
</script>

<template>
    <div
        class="relative flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-[var(--talos-background)] text-[var(--talos-text)]"
        :data-talos-route="activeRoute"
        :data-talos-presentation="preferences.state.presentation"
        :style="interactionMotionStyle"
    >
        <TalosBootLogo v-if="showBoot" @done="showBoot = false" />

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
            <TalosMobileHeader
                :title="headerTitle"
                :creating-session="sessionBusy || chatController.chat.state.persistenceStatus !== 'ready'"
                @open-menu="sidebarOpen = true"
                @new-chat="sidebarNewChat"
            />

            <TalosMobileSidebar
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

            <main class="relative z-10 flex-1 overflow-hidden">
                <ChatScreen ref="chatScreen" />
            </main>

            <TalosMobileToolSheet
                v-if="isStation"
                :title="sheetTitle"
                @close="navigate('chat')"
            >
                <RouterView />
            </TalosMobileToolSheet>
        </template>
    </div>
</template>
