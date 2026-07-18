import type {
    TalosInterfaceMotionCategories,
    TalosInterfaceMotionPreferences,
    TalosMotionV6Preferences,
} from './contracts'

const DEFAULT_CATEGORIES = Object.freeze({
    windows: true,
    surfaces: true,
    navigation: true,
    composer: true,
    messages: true,
    feedback: true,
} satisfies TalosInterfaceMotionCategories)

const DEFAULT_INTERFACE = Object.freeze({
    profile: 'preset',
    duration_scale: 50,
    intensity: 65,
    easing: 'precise',
    stagger: 40,
    categories: DEFAULT_CATEGORIES,
} satisfies TalosInterfaceMotionPreferences)

export const TALOS_MOTION_V6_DEFAULTS = Object.freeze({
    schema_version: 1,
    mode: 'off',
    background_enabled: true,
    interface_enabled: true,
    scene_override: null,
    speed: 100,
    intensity: 65,
    glow_intensity: 0,
    density: 100,
    depth: 50,
    trails: 35,
    contrast: 60,
    parallax: 20,
    quality: 'adaptive',
    fps_cap: 30,
    dpr_cap: 1.25,
    pause_when_hidden: true,
    respect_data_saver: true,
    interface: DEFAULT_INTERFACE,
} satisfies TalosMotionV6Preferences)

export function createDefaultTalosMotionV6Preferences(): TalosMotionV6Preferences {
    return {
        schema_version: TALOS_MOTION_V6_DEFAULTS.schema_version,
        mode: TALOS_MOTION_V6_DEFAULTS.mode,
        background_enabled: TALOS_MOTION_V6_DEFAULTS.background_enabled,
        interface_enabled: TALOS_MOTION_V6_DEFAULTS.interface_enabled,
        scene_override: TALOS_MOTION_V6_DEFAULTS.scene_override,
        speed: TALOS_MOTION_V6_DEFAULTS.speed,
        intensity: TALOS_MOTION_V6_DEFAULTS.intensity,
        glow_intensity: TALOS_MOTION_V6_DEFAULTS.glow_intensity,
        density: TALOS_MOTION_V6_DEFAULTS.density,
        depth: TALOS_MOTION_V6_DEFAULTS.depth,
        trails: TALOS_MOTION_V6_DEFAULTS.trails,
        contrast: TALOS_MOTION_V6_DEFAULTS.contrast,
        parallax: TALOS_MOTION_V6_DEFAULTS.parallax,
        quality: TALOS_MOTION_V6_DEFAULTS.quality,
        fps_cap: TALOS_MOTION_V6_DEFAULTS.fps_cap,
        dpr_cap: TALOS_MOTION_V6_DEFAULTS.dpr_cap,
        pause_when_hidden: TALOS_MOTION_V6_DEFAULTS.pause_when_hidden,
        respect_data_saver: TALOS_MOTION_V6_DEFAULTS.respect_data_saver,
        interface: {
            profile: TALOS_MOTION_V6_DEFAULTS.interface.profile,
            duration_scale: TALOS_MOTION_V6_DEFAULTS.interface.duration_scale,
            intensity: TALOS_MOTION_V6_DEFAULTS.interface.intensity,
            easing: TALOS_MOTION_V6_DEFAULTS.interface.easing,
            stagger: TALOS_MOTION_V6_DEFAULTS.interface.stagger,
            categories: {
                windows: TALOS_MOTION_V6_DEFAULTS.interface.categories.windows,
                surfaces: TALOS_MOTION_V6_DEFAULTS.interface.categories.surfaces,
                navigation: TALOS_MOTION_V6_DEFAULTS.interface.categories.navigation,
                composer: TALOS_MOTION_V6_DEFAULTS.interface.categories.composer,
                messages: TALOS_MOTION_V6_DEFAULTS.interface.categories.messages,
                feedback: TALOS_MOTION_V6_DEFAULTS.interface.categories.feedback,
            },
        },
    }
}
