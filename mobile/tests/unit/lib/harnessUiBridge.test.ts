// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    currentTalosHarnessUiRuntime,
    dismissTalosHarnessUiTransientLayers,
    selectTalosHarnessUiSession,
    setTalosHarnessUiKeyboardOpen,
} from '@/lib/harnessUiBridge'

afterEach(() => {
    delete (window as unknown as { __talosHarnessUiRuntime?: unknown }).__talosHarnessUiRuntime
})

describe('Harness UI bridge', () => {
    it('fails closed when the static runtime is not mounted', () => {
        expect(currentTalosHarnessUiRuntime()).toBeNull()
        expect(selectTalosHarnessUiSession({ id: 'one', title: 'One' })).toBe(false)
        expect(dismissTalosHarnessUiTransientLayers()).toBe(false)
        expect(setTalosHarnessUiKeyboardOpen(true)).toBe(false)
    })

    it('forwards only the normalized AVM contract to the mounted runtime', () => {
        const selectSession = vi.fn()
        const dismissTransientLayers = vi.fn()
        const setKeyboardOpen = vi.fn()
        const runtime = { selectSession, dismissTransientLayers, setKeyboardOpen }
        ;(window as unknown as { __talosHarnessUiRuntime?: typeof runtime }).__talosHarnessUiRuntime = runtime

        expect(selectTalosHarnessUiSession({ id: 'audit-api-permissions', title: 'Audit API permissions' })).toBe(true)
        expect(dismissTalosHarnessUiTransientLayers()).toBe(true)
        expect(setTalosHarnessUiKeyboardOpen(true)).toBe(true)
        expect(selectSession).toHaveBeenCalledWith({
            id: 'audit-api-permissions',
            title: 'Audit API permissions',
        })
        expect(dismissTransientLayers).toHaveBeenCalledTimes(1)
        expect(setKeyboardOpen).toHaveBeenCalledWith(true)
    })

    it('fails closed while an older or partially loaded runtime exposes only one capability', () => {
        const dismissTransientLayers = vi.fn()
        ;(window as unknown as {
            __talosHarnessUiRuntime?: { dismissTransientLayers: () => void }
        }).__talosHarnessUiRuntime = { dismissTransientLayers }

        expect(dismissTalosHarnessUiTransientLayers()).toBe(true)
        expect(selectTalosHarnessUiSession({ id: 'one', title: 'One' })).toBe(false)
        expect(setTalosHarnessUiKeyboardOpen(true)).toBe(false)
        expect(dismissTransientLayers).toHaveBeenCalledTimes(1)
    })
})
