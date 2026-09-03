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
        // ⛔ 29/8 — deve tornare `true`: il bug reale trovato sul dispositivo era ESATTAMENTE il wrapper che ignorava questo valore di ritorno (vedi harnessUiBridge.ts), un mock senza `true` esplicito lo avrebbe nascosto di nuovo qui.
        const selectSession = vi.fn(() => true)
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

    /**
     * ⭐⭐⭐ 28/8, "procedi in ordine" punto 4 — il modello scelto nel
     * composer di Codice viaggia fino al runtime SOLO quando presente.
     */
    it('forwards the chosen model only when one is provided', () => {
        const submitPrompt = vi.fn(() => true)
        ;(window as unknown as { __talosHarnessUiRuntime?: { submitPrompt: typeof submitPrompt } })
            .__talosHarnessUiRuntime = { submitPrompt }

        expect(submitTalosHarnessUiPrompt('ciao', 'z-ai/glm-4.7-flash')).toBe(true)
        expect(submitPrompt).toHaveBeenCalledWith('ciao', 'z-ai/glm-4.7-flash')

        submitPrompt.mockClear()
        submitTalosHarnessUiPrompt('ciao')
        // AL CONTRARIO: senza un modello, MAI un secondo argomento `undefined` esplicito.
        expect(submitPrompt).toHaveBeenCalledWith('ciao')
        expect(submitPrompt.mock.calls[0]).toHaveLength(1)
    })

    /**
     * ⭐⭐⭐ 2/9 — picker Planner (piano §15.6, K): il modello esecutore
     * viaggia fino al runtime SOLO quando presente, gemello del test sopra.
     */
    it('HARNESS-EXECUTOR-MODEL-01 forwards the chosen executor model only when one is provided', () => {
        const submitPrompt = vi.fn(() => true)
        ;(window as unknown as { __talosHarnessUiRuntime?: { submitPrompt: typeof submitPrompt } })
            .__talosHarnessUiRuntime = { submitPrompt }

        expect(submitTalosHarnessUiPrompt('ciao', 'z-ai/glm-4.7-flash', 'inclusionai/ling-3.0-flash-fin:free')).toBe(true)
        expect(submitPrompt).toHaveBeenCalledWith('ciao', 'z-ai/glm-4.7-flash', 'inclusionai/ling-3.0-flash-fin:free')

        // Un esecutore presente ma senza modello principale: tre argomenti comunque, il secondo `undefined` non è in coda.
        submitPrompt.mockClear()
        submitTalosHarnessUiPrompt('ciao', undefined, 'inclusionai/ling-3.0-flash-fin:free')
        expect(submitPrompt).toHaveBeenCalledWith('ciao', undefined, 'inclusionai/ling-3.0-flash-fin:free')
        expect(submitPrompt.mock.calls[0]).toHaveLength(3)

        // AL CONTRARIO: "Automatico" (nessun esecutore) — MAI un terzo argomento `undefined` esplicito, il modello principale da solo si comporta come prima di questa feature.
        submitPrompt.mockClear()
        submitTalosHarnessUiPrompt('ciao', 'z-ai/glm-4.7-flash')
        expect(submitPrompt).toHaveBeenCalledWith('ciao', 'z-ai/glm-4.7-flash')
        expect(submitPrompt.mock.calls[0]).toHaveLength(2)
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
