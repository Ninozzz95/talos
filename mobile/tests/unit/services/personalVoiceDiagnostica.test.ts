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
    profili: [] as Array<{ id: string, compatible: boolean }>,
    diario: [] as string[],
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: { isPluginAvailable: () => nativo.registrato },
    registerPlugin: () => ({}),
}))
const impostazioni = vi.hoisted(() => ({ selezionato: null as string | null }))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({ state: { voice: { personal_profile_id: impostazioni.selezionato } } }),
}))
vi.mock('@/services/personalVoice', () => ({
    talosPersonalVoiceStatus: () => Promise.resolve(stato.status),
    talosPersonalVoiceProfiles: () => Promise.resolve(stato.profili),
    talosPersonalVoiceDiario: () => stato.diario,
}))

import { talosPersonalVoiceDiagnostics } from '@/services/personalVoiceDiagnostica'

const PRONTO = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
const ROTTO = 'ffffffff-1111-4222-8333-444444444444'

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
        stato.profili = [{ id: PRONTO, compatible: true }, { id: ROTTO, compatible: false }]
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
        stato.profili = [{ id: ROTTO, compatible: false }]
        stato.diario = []

        const report = await talosPersonalVoiceDiagnostics()

        expect(report.ready).toBe(false)
        expect(report.compatibleProfileCount).toBe(0)
        expect(report.diario).toEqual([])
    })

    /**
     * ⛔⛔⛔ Owner 11/09, QUARTA segnalazione. Questo modulo nasce per
     * separare «modello non pronto» da «richiesta accettata e mai finita»
     * da «nessun profilo compatibile» — e la QUARTA domanda, quella che
     * decide davvero se la chat parlera', non aveva risposta: «il profilo
     * SCELTO e' quello pronto?». Con due profili e uno solo compatibile,
     * `compatibleProfileCount: 1` diceva «tutto bene» mentre la preferenza
     * puntava all'altro.
     */
    it('distingue il profilo SCELTO incompatibile da un conteggio che sembra sano', async () => {
        impostazioni.selezionato = ROTTO
        stato.status = { supported: true, installed: true, ready: true, active: false, modelState: 'ready' }
        stato.profili = [{ id: PRONTO, compatible: true }, { id: ROTTO, compatible: false }]
        stato.diario = []

        const report = await talosPersonalVoiceDiagnostics()

        expect(report.compatibleProfileCount).toBe(1)
        expect(report.selectedProfileId).toBe(ROTTO)
        expect(report.selectedProfileState).toBe('incompatibile')
        // ⛔ La riga che il Doctor mostra SEMPRE, non solo con i dettagli
        // tecnici accesi: senza questo, il guasto restava invisibile.
        expect(report.failure).toContain("non e' compatibile")
    })

    it('dice ASSENTE quando la preferenza punta a un profilo che non esiste piu', async () => {
        impostazioni.selezionato = 'deadbeef-0000-4000-8000-000000000000'
        stato.status = { supported: true, installed: true, ready: true, active: false, modelState: 'ready' }
        stato.profili = [{ id: PRONTO, compatible: true }]
        stato.diario = []

        const report = await talosPersonalVoiceDiagnostics()

        expect(report.selectedProfileState).toBe('assente')
        expect(report.failure).toContain('non esiste piu')
    })

    /**
     * ⛔ AL VERSO CONTRARIO — i due casi che devono continuare a NON
     * accusare nessuno: il profilo scelto e' davvero quello compatibile
     * (nessun `failure` inventato), e nessuna preferenza salvata non e'
     * un guasto, e' solo «non l'hai ancora scelta».
     */
    it('non accusa niente quando il profilo scelto e pronto, ne quando non ne e stato scelto nessuno', async () => {
        stato.status = { supported: true, installed: true, ready: true, active: false, modelState: 'ready' }
        stato.profili = [{ id: PRONTO, compatible: true }, { id: ROTTO, compatible: false }]
        stato.diario = []

        impostazioni.selezionato = PRONTO
        const pronto = await talosPersonalVoiceDiagnostics()
        expect(pronto.selectedProfileState).toBe('pronto')
        expect(pronto.failure).toBeNull()

        impostazioni.selezionato = null
        const nessuno = await talosPersonalVoiceDiagnostics()
        expect(nessuno.selectedProfileState).toBe('nessuno')
        expect(nessuno.failure).toBeNull()
    })

    /**
     * ⛔ Un guasto del MODELLO resta il guasto riportato: la nuova riga sul
     * profilo non deve mai coprire quella che il nativo ha gia' misurato.
     */
    it('il guasto del modello vince su quello del profilo scelto', async () => {
        impostazioni.selezionato = ROTTO
        stato.status = {
            supported: true, installed: false, ready: false, active: false,
            modelState: 'missing', failure: 'Pocket model file is missing: bos_before_voice.npy',
        }
        stato.profili = [{ id: ROTTO, compatible: false }]
        stato.diario = []

        const report = await talosPersonalVoiceDiagnostics()

        expect(report.failure).toBe('Pocket model file is missing: bos_before_voice.npy')
    })
})
