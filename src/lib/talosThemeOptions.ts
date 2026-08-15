/**
 * Le liste di opzioni dell'Aspetto: etichette e descrizioni.
 *
 * ## Perché in un file loro
 *
 * Perché sono **testo**, e il testo pesa. Stavano in `talosThemes.ts`, che è nel
 * grafo d'avvio perché il tema serve al primo pixel — e con lui arrivavano le
 * descrizioni di ogni effetto di sfondo, di ogni curva di animazione e di ogni
 * modalità: parole che legge **solo** chi apre le Impostazioni » Aspetto.
 *
 * Misurato il 2026-08-06 sulla sourcemap del pacchetto iniziale:
 * `talosThemes.ts` contribuiva **16.165 byte**, con il tetto a 600.000 e un
 * margine sceso a **quattro**. Il tema che serve all'avvio è uno; le
 * descrizioni di tutti gli altri no.
 *
 * Chi le usa è un chunk caricato a richiesta, quindi qui non costano niente a
 * nessuno.
 */

import type {
    TalosBackgroundEffect,
    TalosThemeAreaId,
    TalosThemeMode,
    TalosThemeMotionMode,
    TalosUiAnimationEasing,
    TalosUiAnimationFeedback,
    TalosUiAnimationHover,
    TalosUiAnimationOpenClose,
    TalosUiAnimationProfile,
    TalosUiAnimationSurfaceTransition,
} from '@/lib/talosThemes'

export const TALOS_BACKGROUND_EFFECTS: Array<{ value: TalosBackgroundEffect; label: string; description: string }> = [
    { value: 'dag-flow', label: 'DAG Flow', description: 'Execution graph pulses for normal AVM work.' },
    { value: 'kahn-grid', label: 'Kahn Grid', description: 'Layered scheduling bands for topological planning.' },
    { value: 'trace-rain', label: 'Trace Rain', description: 'Vertical trace streams for replay and telemetry.' },
    { value: 'signal-mesh', label: 'Signal Mesh', description: 'Low-noise node mesh for command-center mode.' },
    { value: 'none', label: 'Solid', description: 'Static background with no procedural motion.' },
]

export const TALOS_THEME_MOTION_OPTIONS: Array<{ value: TalosThemeMotionMode; label: string; description: string }> = [
    { value: 'system', label: 'System', description: 'Follow browser and workspace reduced-motion settings.' },
    { value: 'off', label: 'Off', description: 'Disable procedural background motion.' },
    { value: 'subtle', label: 'Subtle', description: 'Low-intensity motion for long sessions.' },
    { value: 'normal', label: 'Normal', description: 'Default TALOS motion intensity.' },
    { value: 'cinematic', label: 'Cinematic', description: 'High-contrast motion for demos and review rooms.' },
]

export const TALOS_THEME_MODE_OPTIONS: Array<{ value: TalosThemeMode; label: string; description: string }> = [
    { value: 'system', label: 'System', description: 'Follow the operating system color preference.' },
    { value: 'dark', label: 'Dark', description: 'Force the high-contrast operator variant for every preset.' },
    { value: 'light', label: 'Light', description: 'Force the bright review variant for every preset.' },
]

export const TALOS_UI_ANIMATION_PROFILE_OPTIONS: Array<{ value: TalosUiAnimationProfile; label: string; description: string }> = [
    { value: 'preset', label: 'Preset', description: 'Use the motion personality attached to the active theme.' },
    { value: 'minimal', label: 'Minimal', description: 'Short fades and almost no transform for long sessions.' },
    { value: 'expressive', label: 'Expressive', description: 'Higher-depth motion for demos while staying bounded.' },
    { value: 'custom', label: 'Custom', description: 'Use the controls below for panels, commands, feedback and focus.' },
    { value: 'off', label: 'Off', description: 'Disable nonessential interface action motion.' },
]

export const TALOS_UI_ANIMATION_OPEN_CLOSE_OPTIONS: Array<{ value: TalosUiAnimationOpenClose; label: string }> = [
    { value: 'instant', label: 'Instant' },
    { value: 'standard', label: 'Standard' },
    { value: 'depth', label: 'Depth' },
    { value: 'terminal-snap', label: 'Terminal snap' },
    { value: 'soft-fade', label: 'Soft fade' },
]

export const TALOS_UI_ANIMATION_SURFACE_OPTIONS: Array<{ value: TalosUiAnimationSurfaceTransition; label: string }> = [
    { value: 'fade', label: 'Fade' },
    { value: 'slide-fade', label: 'Slide fade' },
    { value: 'scale-fade', label: 'Scale fade' },
    { value: 'scanline', label: 'Scanline' },
    { value: 'axis-shift', label: 'Axis shift' },
]

export const TALOS_UI_ANIMATION_FEEDBACK_OPTIONS: Array<{ value: TalosUiAnimationFeedback; label: string }> = [
    { value: 'none', label: 'None' },
    { value: 'pulse', label: 'Pulse' },
    { value: 'trace', label: 'Trace' },
    { value: 'edge-flash', label: 'Edge flash' },
    { value: 'status-lock', label: 'Status lock' },
]

export const TALOS_UI_ANIMATION_HOVER_OPTIONS: Array<{ value: TalosUiAnimationHover; label: string }> = [
    { value: 'none', label: 'None' },
    { value: 'lift', label: 'Lift' },
    { value: 'edge-glow', label: 'Edge glow' },
    { value: 'underline', label: 'Underline' },
    { value: 'node-glow', label: 'Node glow' },
]

export const TALOS_UI_ANIMATION_EASING_OPTIONS: Array<{ value: TalosUiAnimationEasing; label: string }> = [
    { value: 'precise', label: 'Precise' },
    { value: 'soft', label: 'Soft' },
    { value: 'elastic-light', label: 'Elastic light' },
    { value: 'linear', label: 'Linear' },
    { value: 'cinematic', label: 'Cinematic' },
]

export const TALOS_THEME_AREA_OPTIONS: Array<{ value: TalosThemeAreaId; label: string }> = [
    { value: 'sidebar', label: 'Sidebar' },
    { value: 'chat', label: 'Chat' },
    { value: 'composer', label: 'Composer' },
    { value: 'window', label: 'Floating windows' },
    { value: 'header', label: 'Header' },
    { value: 'button', label: 'Buttons' },
    { value: 'card', label: 'Cards and panels' },
    { value: 'code', label: 'Code blocks' },
]
