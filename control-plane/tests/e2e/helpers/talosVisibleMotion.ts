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
}

export type PaintedTransitionEvidence = {
    before: Buffer
    midpoint: Buffer
    after: Buffer
    presentation: MidpointPresentation
    beforeToMidpointPixelRatio: number
    midpointToAfterPixelRatio: number
}

async function afterTwoPaintFrames(page: Page) {
    await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
}

function rgbaDifferenceRatio(first: Buffer, second: Buffer, channelThreshold = 12): number {
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
    const before = await options.paintSurface.screenshot({ animations: 'allow' })

    await options.action()
    await expect.poll(() => options.target.evaluate((element) => (
        element.getAnimations().filter((animation) => animation.playState === 'running').length
    ))).toBeGreaterThan(0)

    const timing = await options.target.evaluate((element, requestedProgress) => {
        const running = element.getAnimations().filter((animation) => animation.playState === 'running')
        const animation = running.at(-1)
        const duration = animation?.effect?.getTiming().duration
        if (!animation || typeof duration !== 'number' || duration <= 0) {
            throw new Error('A visible transition requires one running animation with a numeric duration.')
        }
        animation.pause()
        animation.currentTime = duration * requestedProgress
        return { durationMs: duration, currentTimeMs: duration * requestedProgress }
    }, progress)

    await afterTwoPaintFrames(options.page)
    const presentation = await options.target.evaluate((element, animationTiming) => {
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
            currentTimeMs: animationTiming.currentTimeMs,
            opacity: Number(style.opacity),
            transform: style.transform,
            visibility: style.visibility,
            pointerEvents: style.pointerEvents,
            viewportIntersectionRatio: (intersectionWidth * intersectionHeight) / area,
            hitTestContainsTarget: stack.some((candidate) => candidate === element || element.contains(candidate)),
        }
    }, timing)
    const midpoint = await options.paintSurface.screenshot({ animations: 'allow' })

    await options.target.evaluate((element) => {
        for (const animation of element.getAnimations()) {
            if (animation.playState === 'paused') animation.play()
        }
    })
    await options.waitForFinal()
    await afterTwoPaintFrames(options.page)
    const after = await options.paintSurface.screenshot({ animations: 'allow' })

    return {
        before,
        midpoint,
        after,
        presentation,
        beforeToMidpointPixelRatio: rgbaDifferenceRatio(before, midpoint),
        midpointToAfterPixelRatio: rgbaDifferenceRatio(midpoint, after),
    }
}

export function expectPaintedTransition(
    evidence: PaintedTransitionEvidence,
    options: { minimumDurationMs: number; minimumPixelRatio?: number; midpointInteractive?: boolean },
) {
    const minimumPixelRatio = options.minimumPixelRatio ?? 0.002
    const presentation = evidence.presentation

    expect(presentation.durationMs, JSON.stringify(presentation, null, 2)).toBeGreaterThanOrEqual(options.minimumDurationMs)
    expect(presentation.currentTimeMs, JSON.stringify(presentation, null, 2)).toBeGreaterThan(0)
    expect(presentation.currentTimeMs, JSON.stringify(presentation, null, 2)).toBeLessThan(presentation.durationMs)
    expect(presentation.visibility).toBe('visible')
    expect(presentation.opacity).toBeGreaterThan(0.05)
    expect(presentation.viewportIntersectionRatio).toBeGreaterThan(0.05)
    if (options.midpointInteractive !== false) {
        expect(presentation.pointerEvents).not.toBe('none')
        expect(presentation.hitTestContainsTarget).toBe(true)
    }
    expect(evidence.beforeToMidpointPixelRatio, JSON.stringify(evidence.presentation, null, 2)).toBeGreaterThanOrEqual(minimumPixelRatio)
    expect(evidence.midpointToAfterPixelRatio, JSON.stringify(evidence.presentation, null, 2)).toBeGreaterThanOrEqual(minimumPixelRatio)
}
