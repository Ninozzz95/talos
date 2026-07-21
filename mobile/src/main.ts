import { createApp } from 'vue'
import './style.css'
import '@fontsource/instrument-sans/400.css'
import '@fontsource/instrument-sans/500.css'
import '@fontsource/instrument-sans/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/orbitron/600.css'
import App from './App.vue'
import { router } from './router'
import { bootstrapTelemetryIdentity } from './theme/applyDesignTokens'
import { configureNativeFraming } from './services/nativeFraming'
import telemetryIdentity from './theme/telemetry.identity.json'

declare global {
    interface Window {
        // Fail-closed degraded-mode switch (charter section 11). Names present
        // in this array disable the matching subsystem; the shell must stay
        // functional. Never set in production; used only by controlled tests.
        __TALOS_M1_DISABLE__?: readonly string[]
    }
}

export function talosDisabledSubsystems(): Set<string> {
    const raw = typeof window !== 'undefined' ? window.__TALOS_M1_DISABLE__ : undefined
    return new Set(Array.isArray(raw) ? raw : [])
}

const disabled = talosDisabledSubsystems()

const prefersDark = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches

// Fail-closed: with the theme adapter disabled, or on any identity error, the
// style.css defaults remain in place and the shell stays usable.
if (!disabled.has('theme')) {
    bootstrapTelemetryIdentity(telemetryIdentity, prefersDark ? 'dark' : 'light')
}

// Frame the native chrome (status bar / keyboard) to the applied theme. No-op on
// web; fail-closed so a native error never blocks boot. Safe-area inset PADDING is
// shell-specific and rides with the shell layout, not here.
if (!disabled.has('native')) {
    const scheme = prefersDark ? 'dark' : 'light'
    const background = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
        || (prefersDark ? '#0b0f11' : '#f1f8fa')
    void configureNativeFraming({
        scheme,
        background,
        onError: (error) => console.error(`[native-framing] ${error.code}: ${error.message}`),
    })
}

createApp(App).use(router).mount('#app')
