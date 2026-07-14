import { expect, type Locator, type Page } from '@playwright/test'
import { PNG } from 'pngjs'

type MidpointPresentation = {
    lifecycle: string | null
    durationMs: number
    currentTimeMs: number
    opacity: number
    transform: string
    visibility: string
    pointerEvents: string
    viewportIntersectionRatio: number
    hitTestContainsTarget: boolean
    animationTargetMatches: boolean
    animationKeyframes: PaintedAnimationKeyframe[]
}

export type PaintedScreenshotBounds = {
    x: number
    y: number
    width: number
    height: number
}

export type PaintedAnimationKeyframe = {
    transform?: string | null
    opacity?: number | string | null
}

export type PaintedTransitionEvidence = {
    before: Buffer
    midpoint: Buffer
    after: Buffer
    targetBefore: Buffer
    targetMidpoint: Buffer
    targetAfter: Buffer
    presentation: MidpointPresentation
    beforeToMidpointPixelRatio: number
    midpointToAfterPixelRatio: number
}

async function afterTwoPaintFrames(page: Page) {
    await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
}

export function hasTransformAndOpacityKeyframes(keyframes: readonly PaintedAnimationKeyframe[]): boolean {
    return keyframes.length >= 2 && keyframes.every((keyframe) => (
        typeof keyframe.transform === 'string'
        && keyframe.transform.length > 0
        && typeof keyframe.opacity === 'number'
        && Number.isFinite(keyframe.opacity)
    ))
}

export function cropPngToRegion(
    image: Buffer,
    surfaceBounds: PaintedScreenshotBounds,
    region: PaintedScreenshotBounds,
): Buffer {
    const source = PNG.sync.read(image)
    if (surfaceBounds.width <= 0 || surfaceBounds.height <= 0) {
        throw new Error('Paint surface bounds must have positive dimensions.')
    }

    const scaleX = source.width / surfaceBounds.width
    const scaleY = source.height / surfaceBounds.height
    const left = Math.max(0, Math.floor((region.x - surfaceBounds.x) * scaleX))
    const top = Math.max(0, Math.floor((region.y - surfaceBounds.y) * scaleY))
    const right = Math.min(source.width, Math.ceil((region.x + region.width - surfaceBounds.x) * scaleX))
    const bottom = Math.min(source.height, Math.ceil((region.y + region.height - surfaceBounds.y) * scaleY))
    if (right <= left || bottom <= top) {
        throw new Error('Target-bound paint region does not intersect the paint surface.')
    }

    const cropped = new PNG({ width: right - left, height: bottom - top })
    PNG.bitblt(source, cropped, left, top, right - left, bottom - top, 0, 0)
    return PNG.sync.write(cropped)
}

export function rgbaDifferenceRatio(first: Buffer, second: Buffer, channelThreshold = 12): number {
    const before = PNG.sync.read(first)
    const after = PNG.sync.read(second)
    expect({ width: before.width, height: before.height }).toEqual({ width: after.width, height: after.height })

    let changed = 0
    const pixels = before.width * before.height
    for (let offset = 0; offset < before.data.length; offset += 4) {
        const delta = Math.max(
            Math.abs(before.data[offset] - after.data[offset]),
            Math.abs(before.data[offset + 1] - after.data[offset + 1]),
            Math.abs(before.data[offset + 2] - after.data[offset + 2]),
            Math.abs(before.data[offset + 3] - after.data[offset + 3]),
        )
        if (delta >= channelThreshold) changed += 1
    }

    return pixels > 0 ? changed / pixels : 0
}

export async function capturePaintedTransition(options: {
    page: Page
    target: Locator
    paintSurface: Locator
    action: () => Promise<unknown>
    waitForFinal: () => Promise<unknown>
    midpointProgress?: number
}): Promise<PaintedTransitionEvidence> {
    const progress = options.midpointProgress ?? 0.5
    const paintSurfaceBounds = await options.paintSurface.boundingBox()
    if (!paintSurfaceBounds) throw new Error('A painted transition requires a visible paint surface.')
    const beforeTargetBounds = await options.target.count() > 0
        ? await options.target.boundingBox()
        : null
    const before = await options.paintSurface.screenshot({ animations: 'allow' })

    await options.action()
    await expect.poll(() => options.target.evaluate((element) => (
        element.getAnimations().some((animation) => {
            const effect = animation.effect as KeyframeEffect | null
            if (animation.playState !== 'running' || effect?.target !== element) return false
            const keyframes = effect.getKeyframes()
            return keyframes.length >= 2 && keyframes.every((keyframe) => (
                typeof keyframe.transform === 'string'
                && ((typeof keyframe.opacity === 'number' && Number.isFinite(keyframe.opacity))
                    || (typeof keyframe.opacity === 'string' && Number.isFinite(Number(keyframe.opacity))))
            ))
        })
    ))).toBe(true)

    const timing = await options.target.evaluate((element, requestedProgress) => {
        const candidates = element.getAnimations().filter((animation) => {
            const effect = animation.effect as KeyframeEffect | null
            if (effect?.target !== element) return false
            const keyframes = effect.getKeyframes()
            return keyframes.length >= 2 && keyframes.every((keyframe) => (
                typeof keyframe.transform === 'string'
                && ((typeof keyframe.opacity === 'number' && Number.isFinite(keyframe.opacity))
                    || (typeof keyframe.opacity === 'string' && Number.isFinite(Number(keyframe.opacity))))
            ))
        })
        const animation = candidates[candidates.length - 1]
        const effect = animation?.effect instanceof KeyframeEffect ? animation.effect : null
        const duration = effect?.getTiming().duration
        if (candidates.length !== 1 || !animation || !effect || typeof duration !== 'number' || duration <= 0) {
            throw new Error('A visible transition requires exactly one exact-target animation with transform/opacity keyframes and a numeric duration.')
        }
        // Keep the animation on the compositor timeline while sampling it. Chromium can
        // report the requested computed style without repainting a newly-paused layer,
        // which makes screenshot evidence disagree with what a user actually sees.
        animation.playbackRate = 0.01
        animation.currentTime = duration * requestedProgress
        return {
            durationMs: duration,
            keyframes: effect.getKeyframes().map((keyframe) => ({
                transform: typeof keyframe.transform === 'string' ? keyframe.transform : null,
                opacity: typeof keyframe.opacity === 'number'
                    ? keyframe.opacity
                    : typeof keyframe.opacity === 'string' ? Number(keyframe.opacity) : null,
            })) ?? [],
        }
    }, progress)

    await afterTwoPaintFrames(options.page)
    const presentation = await options.target.evaluate((element, animationTiming) => {
        const animation = element.getAnimations().find((candidate) => {
            const effect = candidate.effect as KeyframeEffect | null
            if (effect?.target !== element) return false
            const keyframes = effect.getKeyframes()
            return keyframes.length >= 2 && keyframes.every((keyframe) => (
                typeof keyframe.transform === 'string'
                && ((typeof keyframe.opacity === 'number' && Number.isFinite(keyframe.opacity))
                    || (typeof keyframe.opacity === 'string' && Number.isFinite(Number(keyframe.opacity))))
            ))
        })
        const currentTimeMs = animation?.currentTime
        if (!animation || typeof currentTimeMs !== 'number' || !Number.isFinite(currentTimeMs)) {
            throw new Error('A visible transition must expose a finite exact-target currentTime after paint.')
        }
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const intersectionWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0))
        const intersectionHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0))
        const area = Math.max(1, rect.width * rect.height)
        const centerX = Math.max(0, Math.min(viewportWidth - 1, rect.left + (rect.width / 2)))
        const centerY = Math.max(0, Math.min(viewportHeight - 1, rect.top + (rect.height / 2)))
        const stack = document.elementsFromPoint(centerX, centerY)

        return {
            lifecycle: element.getAttribute('data-window-motion-state'),
            durationMs: animationTiming.durationMs,
            currentTimeMs,
            opacity: Number(style.opacity),
            transform: style.transform,
            visibility: style.visibility,
            pointerEvents: style.pointerEvents,
            viewportIntersectionRatio: (intersectionWidth * intersectionHeight) / area,
            hitTestContainsTarget: stack.some((candidate) => candidate === element || element.contains(candidate)),
            animationTargetMatches: (animation.effect as KeyframeEffect | null)?.target === element,
            animationKeyframes: animationTiming.keyframes,
        }
    }, timing)
    const midpoint = await options.paintSurface.screenshot({ animations: 'allow' })

    const targetBounds = beforeTargetBounds ?? await options.target.boundingBox()
    if (!targetBounds) throw new Error('A painted transition requires a target-bound stable region.')
    const beforeTarget = cropPngToRegion(before, paintSurfaceBounds, targetBounds)
    const midpointTarget = cropPngToRegion(midpoint, paintSurfaceBounds, targetBounds)

    if (await options.target.count()) {
        await options.target.evaluate((element) => {
            for (const animation of element.getAnimations()) {
                const effect = animation.effect as KeyframeEffect | null
                if (effect?.target !== element) continue
                animation.playbackRate = 1
                if (animation.playState === 'paused') animation.play()
            }
        })
    }
    await options.waitForFinal()
    await afterTwoPaintFrames(options.page)
    const after = await options.paintSurface.screenshot({ animations: 'allow' })
    const afterTarget = cropPngToRegion(after, paintSurfaceBounds, targetBounds)

    return {
        before,
        midpoint,
        after,
        targetBefore: beforeTarget,
        targetMidpoint: midpointTarget,
        targetAfter: afterTarget,
        presentation,
        beforeToMidpointPixelRatio: rgbaDifferenceRatio(beforeTarget, midpointTarget),
        midpointToAfterPixelRatio: rgbaDifferenceRatio(midpointTarget, afterTarget),
    }
}

export function expectPaintedTransition(
    evidence: PaintedTransitionEvidence,
    options: { minimumDurationMs: number; minimumPixelRatio?: number; midpointInteractive?: boolean },
) {
    const minimumPixelRatio = options.minimumPixelRatio ?? 0.002
    const presentation = evidence.presentation
    const diagnostics = JSON.stringify({
        presentation,
        pixelRatios: {
            threshold1: {
                beforeToMidpoint: rgbaDifferenceRatio(evidence.targetBefore, evidence.targetMidpoint, 1),
                midpointToAfter: rgbaDifferenceRatio(evidence.targetMidpoint, evidence.targetAfter, 1),
            },
            threshold4: {
                beforeToMidpoint: rgbaDifferenceRatio(evidence.targetBefore, evidence.targetMidpoint, 4),
                midpointToAfter: rgbaDifferenceRatio(evidence.targetMidpoint, evidence.targetAfter, 4),
            },
            threshold8: {
                beforeToMidpoint: rgbaDifferenceRatio(evidence.targetBefore, evidence.targetMidpoint, 8),
                midpointToAfter: rgbaDifferenceRatio(evidence.targetMidpoint, evidence.targetAfter, 8),
            },
            threshold12: {
                beforeToMidpoint: evidence.beforeToMidpointPixelRatio,
                midpointToAfter: evidence.midpointToAfterPixelRatio,
            },
        },
    }, null, 2)

    expect(presentation.durationMs, diagnostics).toBeGreaterThanOrEqual(options.minimumDurationMs)
    expect(presentation.currentTimeMs, diagnostics).toBeGreaterThan(0)
    expect(presentation.currentTimeMs, diagnostics).toBeLessThan(presentation.durationMs)
    expect(presentation.animationTargetMatches, diagnostics).toBe(true)
    expect(hasTransformAndOpacityKeyframes(presentation.animationKeyframes), diagnostics).toBe(true)
    expect(presentation.visibility).toBe('visible')
    expect(presentation.opacity).toBeGreaterThan(0.05)
    expect(presentation.viewportIntersectionRatio).toBeGreaterThan(0.05)
    if (options.midpointInteractive !== false) {
        expect(presentation.pointerEvents).not.toBe('none')
        expect(presentation.hitTestContainsTarget).toBe(true)
    }
    expect(evidence.beforeToMidpointPixelRatio, diagnostics).toBeGreaterThanOrEqual(minimumPixelRatio)
    expect(evidence.midpointToAfterPixelRatio, diagnostics).toBeGreaterThanOrEqual(minimumPixelRatio)
}
