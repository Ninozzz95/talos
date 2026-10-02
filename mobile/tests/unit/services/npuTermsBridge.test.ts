import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
    available: vi.fn(),
    acceptNpuTerms: vi.fn(),
    withdrawNpuTerms: vi.fn(),
    declineNpuTermsPrompt: vi.fn(),
    addListener: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
    registerPlugin: () => bridge,
    Capacitor: { isNativePlatform: () => true },
}))

const {
    talosNpuState,
    talosAcceptNpuTerms,
    talosWithdrawNpuTerms,
    talosDeclineNpuTermsPrompt,
} = await import('@/services/localEngine')
const { talosNpuTermsSha256, talosNpuTermsText } = await import('@/lib/models/npuTerms')

/**
 * ⛔ PKLA Qualcomm 2.1 b — il ponte verso il registro nativo delle condizioni.
 * Il blocco vero sta nel nativo (`TalosNpuTerms`); qui si prova che l'app gli
 * manda la versione e l'impronta del testo DAVVERO mostrato.
 */
describe('il ponte delle condizioni NPU', () => {
    beforeEach(() => {
        for (const fn of Object.values(bridge)) fn.mockReset()
        bridge.addListener.mockResolvedValue({ remove: vi.fn(async () => undefined) })
    })

    it('NPU-B-01 lo stato arriva dal nativo, e nel dubbio è «spenta»', async () => {
        bridge.available.mockResolvedValue({
            available: true, backends: 'OpenCL,CPU', loadedPath: null,
            npu: { installed: true, accepted: false, termsVersion: 'npu-qualcomm-v1', promptDeclined: false },
        })
        expect(await talosNpuState()).toEqual({
            installed: true, accepted: false, promptDeclined: false, acceptedAtMs: null,
        })
        bridge.available.mockRejectedValue(new Error('ponte assente'))
        expect(await talosNpuState()).toEqual({
            installed: false, accepted: false, promptDeclined: false, acceptedAtMs: null,
        })
    })

    it('NPU-B-02 accettare manda versione, impronta e lingua del testo mostrato', async () => {
        bridge.acceptNpuTerms.mockResolvedValue({ accepted: true, loaded: true, acceptedAtMs: 1 })
        const esito = await talosAcceptNpuTerms('it-IT')
        expect(esito).toEqual({ accepted: true, loaded: true })
        expect(bridge.acceptNpuTerms).toHaveBeenCalledWith({
            version: 'npu-qualcomm-v1',
            textSha256: await talosNpuTermsSha256(talosNpuTermsText('it')),
            locale: 'it',
        })
    })

    it('NPU-B-03 un rifiuto del nativo non diventa un «accettato»', async () => {
        bridge.acceptNpuTerms.mockRejectedValue(new Error('TALOS_NPU_TERMS_VERSION_MISMATCH'))
        expect(await talosAcceptNpuTerms('en')).toEqual({ accepted: false, loaded: false })
    })

    it('NPU-B-04 ritiro e «Non ora» arrivano al nativo', async () => {
        bridge.withdrawNpuTerms.mockResolvedValue({ withdrawn: true })
        bridge.declineNpuTermsPrompt.mockResolvedValue({ declined: true })
        expect(await talosWithdrawNpuTerms()).toBe(true)
        expect(await talosDeclineNpuTermsPrompt()).toBe(true)
    })
})
