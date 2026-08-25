// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    announceTalosHarnessUiComposerAction,
    currentTalosHarnessUiRuntime,
    dismissTalosHarnessUiTransientLayers,
    selectTalosHarnessUiSession,
    setTalosHarnessUiKeyboardOpen,
    submitTalosHarnessUiPrompt,
    talosHarnessUiTransientLayersActive,
} from '@/lib/harnessUiBridge'

afterEach(() => {
    delete (window as unknown as { __talosHarnessUiRuntime?: unknown }).__talosHarnessUiRuntime
})

describe('Harness UI bridge', () => {
    it('fails closed when the static runtime is not mounted', () => {
        expect(currentTalosHarnessUiRuntime()).toBeNull()
        expect(selectTalosHarnessUiSession({ id: 'one', title: 'One' })).toBe(false)
        expect(dismissTalosHarnessUiTransientLayers()).toBe(false)
        expect(talosHarnessUiTransientLayersActive()).toBe(false)
        expect(setTalosHarnessUiKeyboardOpen(true)).toBe(false)
        expect(submitTalosHarnessUiPrompt('hello')).toBe(false)
        expect(announceTalosHarnessUiComposerAction('attach')).toBe(false)
    })

    it('forwards only the normalized AVM contract to the mounted runtime', () => {
        const selectSession = vi.fn()
        const dismissTransientLayers = vi.fn(() => true)
        const setKeyboardOpen = vi.fn()
        const transientLayersActive = vi.fn(() => true)
        const submitPrompt = vi.fn(() => true)
        const announceComposerAction = vi.fn(() => true)
        const runtime = {
            selectSession,
            dismissTransientLayers,
            transientLayersActive,
            setKeyboardOpen,
            submitPrompt,
            announceComposerAction,
        }
        ;(window as unknown as { __talosHarnessUiRuntime?: typeof runtime }).__talosHarnessUiRuntime = runtime

        expect(selectTalosHarnessUiSession({ id: 'audit-api-permissions', title: 'Audit API permissions' })).toBe(true)
        expect(dismissTalosHarnessUiTransientLayers()).toBe(true)
        expect(talosHarnessUiTransientLayersActive()).toBe(true)
        expect(setTalosHarnessUiKeyboardOpen(true)).toBe(true)
        expect(submitTalosHarnessUiPrompt('hello')).toBe(true)
        expect(announceTalosHarnessUiComposerAction('attach')).toBe(true)
        expect(selectSession).toHaveBeenCalledWith({
            id: 'audit-api-permissions',
            title: 'Audit API permissions',
        })
        expect(dismissTransientLayers).toHaveBeenCalledTimes(1)
        expect(transientLayersActive).toHaveBeenCalledTimes(1)
        expect(setKeyboardOpen).toHaveBeenCalledWith(true)
        expect(submitPrompt).toHaveBeenCalledWith('hello')
        expect(announceComposerAction).toHaveBeenCalledWith('attach')
    })

    it('fails closed while an older or partially loaded runtime exposes only one capability', () => {
        const dismissTransientLayers = vi.fn(() => true)
        ;(window as unknown as {
            __talosHarnessUiRuntime?: { dismissTransientLayers: () => boolean }
        }).__talosHarnessUiRuntime = { dismissTransientLayers }

        expect(dismissTalosHarnessUiTransientLayers()).toBe(true)
        expect(selectTalosHarnessUiSession({ id: 'one', title: 'One' })).toBe(false)
        expect(setTalosHarnessUiKeyboardOpen(true)).toBe(false)
        expect(dismissTransientLayers).toHaveBeenCalledTimes(1)
    })

    it('HARNESS-PALETTE-BACK-01 reports whether a transient layer was actually consumed', () => {
        const dismissTransientLayers = vi.fn(() => false)
        ;(window as unknown as {
            __talosHarnessUiRuntime?: { dismissTransientLayers: () => boolean }
        }).__talosHarnessUiRuntime = { dismissTransientLayers }

        expect(dismissTalosHarnessUiTransientLayers()).toBe(false)
        expect(dismissTransientLayers).toHaveBeenCalledTimes(1)
    })

    it('HARNESS-OVERLAY-REGISTRY-01 reports only a genuinely open static transient layer', () => {
        const transientLayersActive = vi.fn()
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false)
        ;(window as unknown as {
            __talosHarnessUiRuntime?: { transientLayersActive: () => boolean }
        }).__talosHarnessUiRuntime = { transientLayersActive }

        expect(talosHarnessUiTransientLayersActive()).toBe(true)
        expect(talosHarnessUiTransientLayersActive()).toBe(false)
    })
})
