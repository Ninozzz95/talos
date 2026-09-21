import type { SceneMotionParameters } from './sceneRegistry'

export type TalosBackgroundPresentation = Readonly<{
    intensity: number
    glowIntensity: number
    contrast: number
    style: Readonly<Record<string, string>>
}>

function bounded(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

function decimal(value: number): string {
    return String(Number(value.toFixed(3)))
}

export function resolveTalosBackgroundPresentation(
    parameters: Pick<SceneMotionParameters, 'intensity' | 'contrast'>,
    requestedGlowIntensity = 0,
): TalosBackgroundPresentation {
    const intensity = bounded(parameters.intensity, 0, 100)
    const glowIntensity = bounded(requestedGlowIntensity, 0, 100)
    const contrast = bounded(parameters.contrast, 0, 100)
    const stageOpacity = intensity / 100
    const scrimStart = 78 - (intensity * 0.42)
    const scrimEnd = 88 - (intensity * 0.35)
    const filterContrast = 0.9 + (contrast * 0.003)
    const filterSaturation = 0.95 + (contrast * 0.0035)

    return Object.freeze({
        intensity,
        glowIntensity,
        contrast,
        style: Object.freeze({
            '--talos-background-stage-opacity': decimal(stageOpacity),
            '--talos-background-glow-opacity': decimal(glowIntensity / 100),
            '--talos-background-scrim-start': `${decimal(scrimStart)}%`,
            '--talos-background-scrim-end': `${decimal(scrimEnd)}%`,
            '--talos-background-filter-contrast': decimal(filterContrast),
            '--talos-background-filter-saturation': decimal(filterSaturation),
        }),
    })
}
