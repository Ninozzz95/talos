import { createApp } from 'vue'
import './style.css'
/**
 * Latin and latin-ext ONLY, per weight — never a whole family.
 *
 * `@font-face` blocks are render-blocking CSS whether or not the font file is
 * ever fetched, and the full-family imports were shipping Cyrillic, Greek and
 * Vietnamese subsets: 38 KB of the initial stylesheet, a quarter of the entire
 * budget, for scripts this app does not speak. It ships English and Italian,
 * both of which live in `latin` (Italian's accents are all inside
 * U+00C0–U+00FF), with `latin-ext` covering names from the rest of Europe.
 *
 * The honest cost: text pasted in Russian or Greek renders in the phone's own
 * font rather than the theme's. Android has those scripts, so nobody loses a
 * character — and the trade buys ~23 KB off first paint on the cheap phone this
 * whole product exists for.
 *
 * `instrument-sans`, `sora` and `orbitron` publish no further subsets, so their
 * plain weight files already are exactly this.
 */
import '@fontsource/instrument-sans/400.css'
import '@fontsource/instrument-sans/500.css'
import '@fontsource/instrument-sans/600.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-ext-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-ext-500.css'
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-ext-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-ext-500.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/latin-ext-600.css'
import '@fontsource/sora/400.css'
import '@fontsource/sora/500.css'
import '@fontsource/sora/600.css'
import '@fontsource/source-serif-4/latin-400.css'
import '@fontsource/source-serif-4/latin-ext-400.css'
import '@fontsource/source-serif-4/latin-500.css'
import '@fontsource/source-serif-4/latin-ext-500.css'
import '@fontsource/source-serif-4/latin-600.css'
import '@fontsource/source-serif-4/latin-ext-600.css'
import '@fontsource/orbitron/600.css'
import '@/css/talos-motion-v6-simple.css'
import '@/css/talos-motion-v6-complex.css'
import '@/css/talos-interaction-motion-v6.css'
import App from './App.vue'
import { router } from './router'
import { configureNativeFraming } from './services/nativeFraming'
import { applyTalosTheme, DEFAULT_THEME_STATE, useThemeStore } from '@/stores/theme'
import { applyTalosFontScale, readRememberedTalosFontScale } from '@/lib/talosFontScale'
import { useSettingsStore } from '@/stores/settings'
import { preloadTalosMobileRoutes } from '@/lib/mobileRoutes'
import { createTalosI18n } from '@/i18n'

declare global {
    interface Window {
        __TALOS_ROUTES_WARM__?: boolean
        __TALOS_ROUTES_WARM_FAILED__?: boolean
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
    // Apply the default preset synchronously for first paint, then hydrate the
    // persisted preset + color mode (async), which re-applies if it differs.
    applyTalosTheme(DEFAULT_THEME_STATE.theme, DEFAULT_THEME_STATE.mode)
    void useThemeStore().hydrate()
}

// Owner 2026-07-25 (global font size): paint the FIRST frame at the user's
// scale. The persisted value arrives over an async bridge, so boot reads the
// synchronous mirror — same pattern as the theme preset above.
applyTalosFontScale(readRememberedTalosFontScale())

// Non-secret local preferences drive layout, visibility, shortcuts and Motion V6.
// Hydration is independent from provider credentials and never requires a server.
void useSettingsStore().hydrate()

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

async function bootstrapTalosMobileApp(): Promise<void> {
    // Perf review 2026-07-25: this AWAITED the preload of all 10 route chunks + 6
    // shell chunks before mounting — 792KB of boot-blocking JS instead of the
    // 505KB the budget gate measures, and nothing (not even the boot logo) painted
    // until it finished. In a packaged APK every chunk is a local file:// asset,
    // so the "offline readiness" rationale buys nothing on device.
    // Mount first; warm the station chunks once the main thread is free.
    const i18n = await createTalosI18n()
    /*
     * ⛔ Chiamato da fuori, TALOS non apre la schermata intera: apre LA BARRA,
     * sopra l'app che stavi usando. Chi decide, e quanto costa deciderlo, sta
     * tutto in `lib/barra/avvia` — qui non ci sono byte da spendere, perche'
     * questa riga la paga anche chi apre l'app dall'icona (compito #90).
     */
    if (await (await import('@/lib/barra/avvia')).talosAvviaLaBarra(i18n)) return
    createApp(App).use(i18n).use(router).mount('#app')

    /*
     * ⛔ LA CONSEGNA DALLA BARRA: «apri in TALOS» deve aprire QUELLA
     * conversazione, non quella che l'app aveva. Owner 2026-08-11. Il perché sta
     * in `lib/barra/consegna` — in breve: barra e app sono due WebView diverse,
     * e l'unico canale che le attraversa è l'indirizzo.
     *
     * ⛔ Dopo il `mount`, e con `void`: la chat si apre da sé quando è pronta, e
     * far aspettare l'avvio dell'app per una consegna che riguarda un'apertura
     * su cento sarebbe pagare tutti per pochi.
     */
    void (async () => {
        const [{ talosAscoltaLaConsegna, talosConsegnaLaSessione }, { useChatController }] = await Promise.all([
            import('@/lib/barra/consegna'),
            import('@/stores/chatController'),
        ])
        const controller = useChatController()
        // ⛔ Sceglierla e APRIRLA sono due cose: vedi `talosConsegnaLaSessione`.
        await talosAscoltaLaConsegna((sessione) => talosConsegnaLaSessione(controller, router, sessione))
    })()

    const warm = (): void => {
        void preloadTalosMobileRoutes()
            // Observable signal: the shell is interactive BEFORE this resolves, but
            // offline navigation only becomes safe once the chunks are warm. It must
            // NOT be set on failure — a green airplane-mode test would be a lie.
            .then(() => { window.__TALOS_ROUTES_WARM__ = true })
            .catch((error: unknown) => {
                window.__TALOS_ROUTES_WARM_FAILED__ = true
                console.error('[mobile-routes] Packaged station preload failed; stations load on demand.', error)
            })
    }
    if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 3_000 })
    else setTimeout(warm, 0)
}

void bootstrapTalosMobileApp()
