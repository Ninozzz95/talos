import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ErroreDoctorR4, TESTI_DOCTOR_R4, contaGravitaDoctorR4, controlliDoctorR4, esitoDoctorR4, gravitaDoctorR4 } from '@/lib/harness/r4/doctorR4'

/**
 * ⛔ K3-C2b (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): la copia del Doctor deve dire ESATTAMENTE ciò che dice il vero
 * `doctor.js` di r4. Il golden l'ha calcolato `doctor.js` stesso @ 2161afb32 (K3-R4SPOSTA; a fc5e25d62 l'unica differenza era «1 cartella … disponibili») (moduli del frontend presi con `git archive`, in Node,
 * `impostaLingua('it'|'en')`), sui casi di prova; l'unica differenza ammessa è la riga della shell sul telefono (accordo con Nino1).
 */
interface Esito { nome: string; lingua: string; voci?: { id: string; titolo: string; gravita: string; righe: string[] }[]; errore?: string }
const golden = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'doctor-701c6c0d2.json'), 'utf8')) as {
    origine: { commit: string; percorso: string; sha256: string }
    casi: Record<string, Record<string, unknown>>
    esiti: Esito[]
}
const DISPOSITIVO: Record<string, string> = {
    it: 'Comando diagnostico eseguito direttamente sul dispositivo, senza isolamento.',
    en: 'Diagnostic command run directly on the device, not isolated.',
}
/** Ciò che il mobile deve dire: il golden, con la frase del dispositivo dove r4 vede `shell: 'desktop'`. */
function attese(e: Esito) {
    return e.voci!.map((v) => (v.id === 'shell' && golden.casi[e.nome].shell === 'desktop' ? { ...v, righe: [DISPOSITIVO[e.lingua]] } : v))
}

describe('il Doctor del Codice su r4 (K3-C2b)', () => {
    it('DOC-01 stesse voci, gravità, ordine e frasi del vero doctor.js, in italiano e in inglese', () => {
        const valide = golden.esiti.filter((e) => e.voci)
        expect(valide.length).toBeGreaterThanOrEqual(6)
        for (const e of valide) expect(controlliDoctorR4(golden.casi[e.nome], e.lingua), `${e.lingua} ${e.nome}`).toEqual(attese(e))
    })

    it('DOC-02 sul telefono «desktop» è il dispositivo: la frase del dispositivo, gravità «info» come il desktop', () => {
        const voci = controlliDoctorR4({ chiaveApi: true, shell: 'desktop', git: false, naviga: true }, 'it')
        expect(voci.find((v) => v.id === 'shell')).toEqual({ id: 'shell', titolo: 'Ambiente dei comandi', gravita: 'info', righe: [DISPOSITIVO.it] })
        expect(controlliDoctorR4({ chiaveApi: true, shell: 'desktop', git: false, naviga: true }, 'it-IT').find((v) => v.id === 'shell')!.righe)
            .toEqual([DISPOSITIVO.it])
    })

    it('DOC-03 una risposta non valida si ferma con la frase di r4, mai una lista a metà', () => {
        for (const e of golden.esiti.filter((x) => x.errore)) {
            expect(() => controlliDoctorR4(golden.casi[e.nome], e.lingua)).toThrow(ErroreDoctorR4)
            expect(() => controlliDoctorR4(golden.casi[e.nome], e.lingua)).toThrow(e.errore!)
        }
        expect(() => controlliDoctorR4(null, 'it')).toThrow('La risposta della diagnosi non è valida.')
        expect(() => controlliDoctorR4({ chiaveApi: true, shell: 'none', git: true, naviga: true, labs: { accesi: [3] } }, 'en')).toThrow(ErroreDoctorR4)
    })

    it('DOC-04 conteggi, esito in una riga e parole della gravità', () => {
        const voci = controlliDoctorR4(golden.casi.completa, 'it')
        expect(contaGravitaDoctorR4(voci)).toEqual({ danger: 1, warning: 4, info: 4, success: 2 })
        expect(esitoDoctorR4(voci, 'it')).toContain('11')
        expect(esitoDoctorR4(voci, 'it')).toContain('5')
        expect([gravitaDoctorR4('danger', 'it'), gravitaDoctorR4('warning', 'it'), gravitaDoctorR4('info', 'it'), gravitaDoctorR4('success', 'it')])
            .toEqual(['Guasto', 'Avviso', 'Nota', 'OK'])
    })

    it('DOC-05 i testi del Doctor vengono dallo stesso commit del golden, con le stesse chiavi nelle due lingue', () => {
        expect(TESTI_DOCTOR_R4.origine).toMatchObject({ commit: golden.origine.commit, percorso: 'harness-ui/frontend/src/i18n/testi/varie.js', prefisso: 'doctor.' })
        expect(golden.origine).toMatchObject({ percorso: 'harness-ui/frontend/src/components/doctor.js', sha256: 'abcd36bd81ae8472c75603dff3a94d1a40c65043d2e41d6f57ef4b780f42b85e' })
        expect(Object.keys(TESTI_DOCTOR_R4.it).sort()).toEqual(Object.keys(TESTI_DOCTOR_R4.en).sort())
        expect(TESTI_DOCTOR_R4.it['doctor.check.shell.device']).toBe(DISPOSITIVO.it)
    })
})
