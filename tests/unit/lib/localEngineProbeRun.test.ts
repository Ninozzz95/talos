import { describe, expect, it, vi } from 'vitest'
import { talosRunLocalEngineProbeAndEnsureGranted } from '@/lib/localEngineProbeRun'

const QUALIFIED: Parameters<typeof talosRunLocalEngineProbeAndEnsureGranted>[1]['qualify'] = async () => ({
    ran: true, reason: null, probedCpu: true, cpuInconclusive: false,
    probedGpu: false, gpuInconclusive: false, decisionBackend: 'cpu', decisionReason: 'unproven',
})

describe('talosRunLocalEngineProbeAndEnsureGranted', () => {
    it('runs the probe with the given path', async () => {
        const qualify = vi.fn(QUALIFIED)
        await talosRunLocalEngineProbeAndEnsureGranted('/models/qwen.gguf', {
            qualify, getConsent: () => 'granted', setConsent: vi.fn(),
        })
        expect(qualify).toHaveBeenCalledWith('/models/qwen.gguf')
    })

    it('re-grants consent when a run actually happened and consent was not already granted', async () => {
        const setConsent = vi.fn(async () => {})
        await talosRunLocalEngineProbeAndEnsureGranted('/models/qwen.gguf', {
            qualify: QUALIFIED, getConsent: () => 'declined', setConsent,
        })
        expect(setConsent).toHaveBeenCalledWith('granted')
    })

    it("re-grants from 'unset' too — the manual command is not only for people who said no", async () => {
        const setConsent = vi.fn(async () => {})
        await talosRunLocalEngineProbeAndEnsureGranted('/models/qwen.gguf', {
            qualify: QUALIFIED, getConsent: () => 'unset', setConsent,
        })
        expect(setConsent).toHaveBeenCalledWith('granted')
    })

    /**
     * ⛔ Il verso contrario: già `granted` non deve riscrivere niente. Non è
     * solo un'ottimizzazione — un test che asserisse solo il caso positivo
     * non distinguerebbe "chiama sempre" da "chiama quando serve".
     */
    it('does not write anything when consent was already granted', async () => {
        const setConsent = vi.fn(async () => {})
        await talosRunLocalEngineProbeAndEnsureGranted('/models/qwen.gguf', {
            qualify: QUALIFIED, getConsent: () => 'granted', setConsent,
        })
        expect(setConsent).not.toHaveBeenCalled()
    })

    it('does not re-grant when the probe did not actually run', async () => {
        const setConsent = vi.fn(async () => {})
        await talosRunLocalEngineProbeAndEnsureGranted('/models/qwen.gguf', {
            qualify: async () => ({
                ran: false, reason: 'hot', probedCpu: false, cpuInconclusive: false,
                probedGpu: false, gpuInconclusive: false, decisionBackend: null, decisionReason: null,
            }),
            getConsent: () => 'declined',
            setConsent,
        })
        expect(setConsent).not.toHaveBeenCalled()
    })

    it('returns exactly what the probe returned', async () => {
        const result = await talosRunLocalEngineProbeAndEnsureGranted('/models/qwen.gguf', {
            qualify: QUALIFIED, getConsent: () => 'granted', setConsent: vi.fn(),
        })
        expect(result).toEqual({
            ran: true, reason: null, probedCpu: true, cpuInconclusive: false,
            probedGpu: false, gpuInconclusive: false, decisionBackend: 'cpu', decisionReason: 'unproven',
        })
    })
})
