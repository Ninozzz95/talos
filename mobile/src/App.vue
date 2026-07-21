<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TalosBootLogo from '@/components/brand/TalosBootLogo.vue'
import TalosMobileRail from '@/components/shell/TalosMobileRail.vue'
import TalosMobileToolSheet from '@/components/shell/TalosMobileToolSheet.vue'
import ChatScreen from '@/screens/ChatScreen.vue'
import { TALOS_MOBILE_ROUTES, type TalosMobileRouteName } from '@/lib/mobileRoutes'
import { usePreferencesStore } from '@/stores/preferences'
import {
    registerNativeAppLifecycle,
    type NativeLifecycleController,
} from '@/services/nativeAppLifecycle'
import { talosDisabledSubsystems } from '@/main'

const router = useRouter()
const route = useRoute()
const preferences = usePreferencesStore()
const disabled = talosDisabledSubsystems()
const uiFallback = disabled.has('ui')

// Animated brand intro over the static native splash; dismisses to the chat.
const showBoot = ref(true)

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

function onNewChat(): void {
    // Step-1: focus the chat base. Real new-session wiring lands with the data layer (step-2).
    void navigate('chat')
}

onMounted(async () => {
    await preferences.hydrate()
    if (preferences.state.last_route && preferences.state.last_route !== activeRoute.value) {
        await router.replace(pathFor(preferences.state.last_route))
    }
    if (!disabled.has('lifecycle')) {
        lifecycle = registerNativeAppLifecycle({
            onBack: (event) => {
                // Android Back closes an open station sheet before navigating.
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
    >
        <TalosBootLogo v-if="showBoot" @done="showBoot = false" />

        <div
            aria-hidden="true"
            data-testid="telemetry-poster"
            class="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center opacity-20"
            :style="{ backgroundImage: 'var(--talos-poster-url)' }"
        />

        <!-- Fail-closed fallback: no upstream shadcn/reka components. -->
        <template v-if="uiFallback">
            <main class="flex-1 overflow-y-auto">
                <RouterView />
            </main>
            <nav aria-label="Primary" data-testid="ui-fallback" class="flex items-stretch justify-around border-t border-[var(--talos-border)] bg-[var(--talos-sidebar)]">
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
            <TalosMobileRail
                :active-route="activeRoute"
                @navigate="navigate"
                @new-chat="onNewChat"
            />

            <main class="relative flex-1 overflow-hidden">
                <ChatScreen />
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
