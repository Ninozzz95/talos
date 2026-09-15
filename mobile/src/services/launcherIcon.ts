/**
 * Per-theme Android launcher icon controller (owner 2026-07-24).
 *
 * The icon is one of 14 `<activity-alias>` entries; switching the enabled alias
 * needs the app to be restarted (or backgrounded) before most launchers redraw,
 * so this never applies silently: `evaluate()` raises a prompt, and the user
 * chooses "restart now" (apply + exit) or "later" (apply on next pause).
 *
 * The `applyNative` step disables the previously-active alias with DONT_KILL_APP,
 * so the process is never force-killed; the applied preset is mirrored into
 * Preferences (source of truth for the UI) before the native call so a mid-switch
 * restart still resolves to the chosen icon.
 */
import { reactive, readonly, type DeepReadonly } from 'vue'
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Preferences } from '@capacitor/preferences'
import { resolveLauncherIconPlan } from '@/lib/launcherIconPlan'
import { TALOS_DEFAULT_THEME, isTalosThemeId, type TalosThemeId } from '@/lib/talosThemes'

interface TalosAppIconBridge {
    getIcon(): Promise<{ preset: string }>
    setIcon(options: { preset: string }): Promise<void>
}

const APPLIED_KEY = 'talos.mobile.launcherIcon.applied'

export interface LauncherIconDeps {
    isNative(): boolean
    /** The launcher alias currently enabled (persisted mirror, native-reconciled). */
    getApplied(): Promise<string>
    setApplied(preset: string): Promise<void>
    /** Toggle the native alias (no-op off native). */
    applyNative(preset: string): Promise<void>
    /** User-requested "restart now" — exit so the launcher redraws on relaunch. */
    restart(): Promise<void>
    /** Register a ONE-SHOT app-pause callback (used by the deferred "later" path). */
    onNextPause(cb: () => void): void
}

function defaultDeps(): LauncherIconDeps {
    let bridge: TalosAppIconBridge | null = null
    const plugin = (): TalosAppIconBridge => (bridge ??= registerPlugin<TalosAppIconBridge>('TalosAppIcon'))
    return {
        isNative: () => Capacitor.isNativePlatform(),
        async getApplied() {
            const { value } = await Preferences.get({ key: APPLIED_KEY })
            if (isTalosThemeId(value)) return value
            if (Capacitor.isNativePlatform()) {
                try {
                    const native = await plugin().getIcon()
                    if (isTalosThemeId(native.preset)) return native.preset
                } catch { /* fall through to default */ }
            }
            return TALOS_DEFAULT_THEME
        },
        async setApplied(preset) {
            await Preferences.set({ key: APPLIED_KEY, value: preset })
        },
        async applyNative(preset) {
            if (!Capacitor.isNativePlatform()) return
            await plugin().setIcon({ preset })
        },
        async restart() {
            if (Capacitor.isNativePlatform()) await App.exitApp()
        },
        onNextPause(cb) {
            if (!Capacitor.isNativePlatform()) return
            let handleRef: PluginListenerHandle | null = null
            let fired = false
            void App.addListener('pause', () => {
                if (fired) return
                fired = true
                cb()
                void handleRef?.remove()
            }).then((handle) => {
                handleRef = handle
                // If the pause already fired before the handle resolved, clean up now.
                if (fired) void handle.remove()
            })
        },
    }
}

export interface LauncherIconState {
    applied: TalosThemeId
    pending: { target: TalosThemeId } | null
}

export interface LauncherIconController {
    readonly state: DeepReadonly<LauncherIconState>
    hydrate(): Promise<void>
    /** Recompute whether a switch prompt is warranted for the given theme. */
    evaluate(themePreset: TalosThemeId, featureEnabled: boolean): void
    /** Apply the pending target now and restart. */
    confirmNow(): Promise<void>
    /** Apply the pending target on the next app pause. */
    later(): void
    /** Dismiss the prompt without applying. */
    dismiss(): void
}

let singleton: LauncherIconController | null = null
let depsOverride: LauncherIconDeps | null = null

export function useLauncherIconController(): LauncherIconController {
    if (singleton) return singleton
    const deps = depsOverride ?? defaultDeps()
    const state = reactive<LauncherIconState>({ applied: TALOS_DEFAULT_THEME, pending: null })
    // A single deferred target (latest "later" wins), applied on the next pause.
    let deferred: TalosThemeId | null = null
    let pauseArmed = false
    // Gate evaluate() until the applied alias is known. On cold start the theme
    // store hydrates (default → the user's theme), firing the theme watcher BEFORE
    // this controller's applied mirror is loaded; without this gate that stale
    // compare would raise a bogus prompt that survives every restart.
    let hydrated = false

    async function apply(target: TalosThemeId): Promise<void> {
        // Toggle the native alias FIRST; only then persist the mirror + in-memory
        // state. A native failure thus leaves state consistent (unchanged) and the
        // user is re-prompted next time instead of the feature silently wedging.
        await deps.applyNative(target)
        await deps.setApplied(target)
        state.applied = target
    }

    singleton = {
        state: readonly(state) as DeepReadonly<LauncherIconState>,
        async hydrate() {
            const applied = await deps.getApplied()
            state.applied = isTalosThemeId(applied) ? applied : TALOS_DEFAULT_THEME
            hydrated = true
        },
        evaluate(themePreset, featureEnabled) {
            // Ignore the hydration-time theme settle; only real post-boot switches prompt.
            if (!hydrated) return
            const plan = resolveLauncherIconPlan({
                featureEnabled,
                native: deps.isNative(),
                themePreset,
                appliedPreset: state.applied,
            })
            state.pending = plan.kind === 'prompt' ? { target: plan.target as TalosThemeId } : null
        },
        async confirmNow() {
            const target = state.pending?.target
            if (!target) return
            try {
                await apply(target)
            } catch {
                // Keep the prompt so the user can retry; never restart on failure.
                return
            }
            state.pending = null
            await deps.restart()
        },
        later() {
            const target = state.pending?.target
            state.pending = null
            if (!target) return
            // One deferred slot + a single armed listener: multiple "later" choices
            // must not stack pause listeners (which could toggle two aliases → two
            // home-screen icons). The latest target wins on the next pause.
            deferred = target
            if (pauseArmed) return
            pauseArmed = true
            deps.onNextPause(() => {
                pauseArmed = false
                const next = deferred
                deferred = null
                if (next) void apply(next).catch(() => undefined)
            })
        },
        dismiss() {
            state.pending = null
        },
    }
    return singleton
}

/** Test seam: inject fake deps and reset the singleton. */
export function __setLauncherIconDepsForTests(deps: LauncherIconDeps | null): void {
    depsOverride = deps
    singleton = null
}

export function __resetLauncherIconControllerForTests(): void {
    singleton = null
    depsOverride = null
}
