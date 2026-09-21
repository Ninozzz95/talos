import { describe, expect, it, vi } from 'vitest'

/**
 * Owner 24/8, terza segnalazione: voce codificata, anteprima e chat mute,
 * e il Doctor incollato non aveva UNA riga sulla sintesi. Questo file
 * prova la sonda in isolamento — vedi doctorScreen.test.ts per la riga
 * dentro lo schermo vero.
 */
const nativo = vi.hoisted(() => ({ registrato: true }))
const stato = vi.hoisted(() => ({
    status: { supported: true, installed: true, ready: false, active: false } as Record<string, unknown>,
    profili: [] as Array<{ compatible: boolean }>,
    diario: [] as string[],
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: { isPluginAvailable: () => nativo.registrato },
    registerPlugin: () => ({}),
}))
vi.mock('@/services/personalVoice', () => ({
    talosPersonalVoiceStatus: () => Promise.resolve(stato.status),
    talosPersonalVoiceProfiles: () => Promise.resolve(stato.profili),
    talosPersonalVoiceDiario: () => stato.diario,
}))

import { talosPersonalVoiceDiagnostics } from '@/services/personalVoiceDiagnostica'

describe('talosPersonalVoiceDiagnostics', () => {
    it('dichiara il plugin assente quando non è registrato — costruzione, non un\'ipotesi', async () => {
        nativo.registrato = false
        const report = await talosPersonalVoiceDiagnostics()

        expect(report.registered).toBe(false)
        expect(report.supported).toBe(false)
        expect(report.error).toContain('NOT registered')
        nativo.registrato = true
    })

    it('mostra modello, conteggio profili compatibili e il diario quando il plugin risponde', async () => {
        stato.status = {
            supported: true, installed: true, ready: true, active: false,
            backend: 'pocket-v2', engineBuild: 'x'.repeat(64), modelState: 'ready',
        }
        stato.profili = [{ compatible: true }, { compatible: false }]
        stato.diario = ['12:00:00.000 speak(chat):r1 accepted:true']

        const report = await talosPersonalVoiceDiagnostics()

        expect(report.registered).toBe(true)
        expect(report.ready).toBe(true)
        expect(report.modelState).toBe('ready')
        expect(report.profileCount).toBe(2)
        expect(report.compatibleProfileCount).toBe(1)
        expect(report.diario).toEqual(stato.diario)
        expect(report.error).toBeNull()
    })

    /**
     * AL CONTRARIO: proprio il caso segnalato — un modello installato ma
     * senza un profilo pronto, o un profilo pronto ma la richiesta che poi
     * non finisce mai (il diario lo mostrerebbe: "accepted:true" senza un
     * "done"/"errore" dopo). Qui si prova solo che il report non nasconde
     * un `ready:false`/diario vuoto dietro un `ok` generico.
     */
    it('non dichiara pronto un modello installato senza un profilo compatibile', async () => {
        stato.status = { supported: true, installed: true, ready: false, active: false, modelState: 'ready' }
        stato.profili = [{ compatible: false }]
        stato.diario = []

        const report = await talosPersonalVoiceDiagnostics()

        expect(report.ready).toBe(false)
        expect(report.compatibleProfileCount).toBe(0)
        expect(report.diario).toEqual([])
    })
})
