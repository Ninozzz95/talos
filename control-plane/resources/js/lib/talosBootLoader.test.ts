// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    failTalosBootLoader,
    scheduleTalosBootCompletion,
    syncTalosBootAccent,
    type TalosBootScheduler,
} from './talosBootLoader'

const buildDocument = () => {
    document.body.innerHTML = `
        <div data-talos-boot-loader="true" data-state="loading">
            <span data-talos-boot-status>Starting TALOS</span>
            <div data-talos-boot-timeout hidden>Loading is taking longer than expected.</div>
        </div>
        <div id="talos-workspace-root" aria-busy="true"></div>
    `

    return document.getElementById('talos-workspace-root') as HTMLElement
}

afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
})

describe('TALOS boot loader lifecycle', () => {
    it('keeps animated boot motion visible long enough to be perceived on a fast mount', () => {
        const root = buildDocument()
        const frames: FrameRequestCallback[] = []
        const delays: Array<{ callback: () => void, delayMs: number }> = []
        const scheduler: TalosBootScheduler = {
            requestFrame: (callback) => {
                frames.push(callback)
                return frames.length
            },
            setDelay: (callback, delayMs) => {
                delays.push({ callback, delayMs })
                return delays.length
            },
            clearDelay: vi.fn(),
            now: () => 100,
        }

        scheduleTalosBootCompletion(root, scheduler)

        const loader = document.querySelector<HTMLElement>('[data-talos-boot-loader]')
        expect(loader?.dataset.state).toBe('loading')
        expect(root.getAttribute('aria-busy')).toBe('true')

        frames.shift()?.(0)
        expect(loader?.dataset.state).toBe('loading')

        frames.shift()?.(16)
        expect(root.dataset.talosAppReady).toBe('true')
        expect(root.getAttribute('aria-busy')).toBe('false')
        expect(loader?.dataset.state).toBe('loading')
        expect(delays[0]?.delayMs).toBe(1_900)

        delays.shift()?.callback()
        expect(loader?.dataset.state).toBe('leaving')

        loader?.dispatchEvent(new Event('transitionend'))
        expect(document.querySelector('[data-talos-boot-loader]')).toBeNull()
        expect(scheduler.clearDelay).toHaveBeenCalledOnce()
    })

    it('removes the overlay through its bounded fallback when transition events are unavailable', () => {
        const root = buildDocument()
        const frames: FrameRequestCallback[] = []
        const delays: Array<{ callback: () => void, delayMs: number }> = []
        const scheduler: TalosBootScheduler = {
            requestFrame: (callback) => {
                frames.push(callback)
                return frames.length
            },
            setDelay: (callback, delayMs) => {
                delays.push({ callback, delayMs })
                return delays.length
            },
            clearDelay: vi.fn(),
            now: () => 2_000,
        }

        scheduleTalosBootCompletion(root, scheduler)
        frames.shift()?.(0)
        frames.shift()?.(16)
        delays.shift()?.callback()

        expect(document.querySelector('[data-talos-boot-loader]')).toBeNull()
    })

    it('uses the same bounded minimum lifecycle for the self-contained logo animation', () => {
        const root = buildDocument()
        const frames: FrameRequestCallback[] = []
        const delays: Array<{ callback: () => void, delayMs: number }> = []
        const scheduler: TalosBootScheduler = {
            requestFrame: (callback) => {
                frames.push(callback)
                return frames.length
            },
            setDelay: (callback, delayMs) => {
                delays.push({ callback, delayMs })
                return delays.length
            },
            clearDelay: vi.fn(),
            now: () => 100,
        }

        scheduleTalosBootCompletion(root, scheduler)
        frames.shift()?.(0)
        frames.shift()?.(16)

        expect(document.querySelector<HTMLElement>('[data-talos-boot-loader]')?.dataset.state).toBe('loading')
        expect(delays).toHaveLength(1)
        expect(delays[0]?.delayMs).toBe(1_900)
    })

    it('keeps a controlled recovery surface visible when Vue cannot mount', () => {
        const root = buildDocument()

        failTalosBootLoader(root)

        const loader = document.querySelector<HTMLElement>('[data-talos-boot-loader]')
        expect(loader?.dataset.state).toBe('failed')
        expect(loader?.getAttribute('aria-live')).toBe('assertive')
        expect(document.querySelector('[data-talos-boot-status]')?.textContent).toContain('could not start')
        expect(document.querySelector<HTMLElement>('[data-talos-boot-timeout]')?.hidden).toBe(false)
        expect(root.getAttribute('aria-busy')).toBe('false')
    })

    it('bridges the mounted Theme Engine accent into the intact loading artifact', () => {
        buildDocument()
        const themeRoot = document.createElement('div')
        themeRoot.style.setProperty('--talos-accent', '#12ab34')
        document.body.append(themeRoot)

        syncTalosBootAccent(themeRoot)

        const loader = document.querySelector<HTMLElement>('[data-talos-boot-loader]')
        expect(loader?.style.getPropertyValue('--talos-boot-accent')).toBe('#12ab34')
    })
})
