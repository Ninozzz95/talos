import { describe, expect, it } from 'vitest'
import {
    RIGA_A_RIPOSO_R4, aggiornaConAgenteR4, annullaConfermaR4, apriConfermaR4, confermaFermaR4, esitoFermaR4, richiestaFermaFigliaR4,
    sezioneApertaR4, testoFermaAgenteR4, tieneApertaR4, vociMenuAgenteR4,
} from '@/lib/harness/r4/fermaAgenteR4'

/*
 * «Ferma» nella scheda Agenti (owner 29/10 notte; spec SPEC-FERMA-NELLA-SCHEDA-AGENTI). Prove del PEZZO VERO: spostato in
 * `tests/unit/harness/fermaAgenteR4.test.ts`, cambia solo l'import. FA-01..FA-10.
 */
const vivo = { sessionId: 'a', padreId: 'chat', conclusa: false }
const aspetta = { sessionId: 'b', padreId: 'chat', conclusa: false, inAttesaApprovazione: true }
const finito = { sessionId: 'c', padreId: 'chat', conclusa: true }
const interrotto = { sessionId: 'd', padreId: 'chat', conclusa: false, interrotta: true }
const inPausa = { sessionId: 'e', padreId: 'chat', conclusa: true, esitoDelega: 'in-pausa' }

describe('FA — i tre puntini', () => {
    it('FA-01 «Ferma questa delega» solo per un agente vivo (al lavoro o che aspetta te); finito, interrotto, in pausa: niente', () => {
        expect(vociMenuAgenteR4(vivo, 'it').map((v) => v.label)).toEqual(['Ferma questa delega'])
        expect(vociMenuAgenteR4(aspetta, 'en').map((v) => v.label)).toEqual(['Stop this delegation'])
        for (const a of [finito, interrotto, inPausa]) expect(vociMenuAgenteR4(a, 'it')).toEqual([])
        expect(vociMenuAgenteR4(vivo, 'it')[0]).toMatchObject({ id: 'ferma', danger: true })
    })
})

describe('FA — la conferma nella riga', () => {
    it('FA-02 si apre solo per un agente vivo; «Annulla» la chiude senza mandare niente', () => {
        expect(apriConfermaR4(RIGA_A_RIPOSO_R4, finito)).toBe(RIGA_A_RIPOSO_R4)
        const aperta = apriConfermaR4(RIGA_A_RIPOSO_R4, vivo)
        expect(aperta).toEqual({ conferma: true, esito: null })
        expect(annullaConfermaR4(aperta)).toEqual({ conferma: false, esito: null })
    })
    it('FA-03 «Ferma la delega» → «Lo fermo…» (una richiesta sola) → «Fermato»', () => {
        const aperta = apriConfermaR4(RIGA_A_RIPOSO_R4, vivo)
        const via = confermaFermaR4(aperta, vivo, 1000)!
        expect(via).toEqual({ conferma: false, esito: { tipo: 'in-corso', dal: 1000 } })
        expect(confermaFermaR4(via, vivo, 2000)).toBeNull() // un secondo tocco non manda una seconda richiesta
        expect(apriConfermaR4(via, vivo)).toBe(via)
        expect(esitoFermaR4(via, { ok: true }, 'it')).toEqual({ conferma: false, esito: { tipo: 'fatto' } })
    })
    it('FA-04 una richiesta non riuscita lo dice a parole (il motivo del server, o `delegations.stopFailed` del PC)', () => {
        const via = confermaFermaR4(apriConfermaR4(RIGA_A_RIPOSO_R4, vivo), vivo, 0)!
        expect(esitoFermaR4(via, { ok: false, messaggio: 'r4 non risponde' }, 'it').esito).toEqual({ tipo: 'errore', messaggio: 'r4 non risponde' })
        // FA-G2 (Desktop 29/10 notte): le parole del PC, «Delega non fermata» / «Delegation not stopped»
        expect(esitoFermaR4(via, { ok: false }, 'en').esito).toEqual({ tipo: 'errore', messaggio: 'Delegation not stopped' })
        expect(esitoFermaR4(via, { ok: false, messaggio: null }, 'it').esito).toEqual({ tipo: 'errore', messaggio: 'Delega non fermata' })
    })
    it('FA-05 l’agente finisce da solo con la conferma aperta: la conferma si chiude, «Aveva già finito»', () => {
        const aperta = apriConfermaR4(RIGA_A_RIPOSO_R4, vivo)
        expect(aggiornaConAgenteR4(aperta, { ...vivo, conclusa: true })).toEqual({ conferma: false, esito: { tipo: 'gia-finito' } })
        expect(aggiornaConAgenteR4(aperta, vivo)).toBe(aperta)
        // e se finisce proprio mentre si tocca «Ferma la delega»: nessuna richiesta, la stessa frase
        expect(confermaFermaR4(aperta, { ...vivo, conclusa: true }, 0)).toEqual({ conferma: false, esito: { tipo: 'gia-finito' } })
        expect(testoFermaAgenteR4('esito.giaFinito', 'it')).toBe('Aveva già finito: niente da fermare')
    })
})

describe('FA — le sezioni e la rotta', () => {
    it('FA-06 una sezione con una conferma aperta (o «Lo fermo…») resta aperta quando arriva una richiesta più nuova; la scelta della persona vince', () => {
        expect(sezioneApertaR4({ id: 'r1', piuRecente: 'r2', conConfermaAperta: false })).toBe(false)
        expect(sezioneApertaR4({ id: 'r1', piuRecente: 'r2', conConfermaAperta: true })).toBe(true)
        expect(sezioneApertaR4({ id: 'r1', piuRecente: 'r2', conConfermaAperta: true, sceltaDellaPersona: false })).toBe(false)
        expect(sezioneApertaR4({ id: 'r2', piuRecente: 'r2', conConfermaAperta: false })).toBe(true)
        expect(sezioneApertaR4({ id: 'r1', piuRecente: 'r2', conConfermaAperta: false, cercando: true })).toBe(true)
        expect(tieneApertaR4({ conferma: true, esito: null })).toBe(true)
        expect(tieneApertaR4({ conferma: false, esito: { tipo: 'in-corso', dal: 0 } })).toBe(true)
        expect(tieneApertaR4({ conferma: false, esito: { tipo: 'fatto' } })).toBe(false)
        expect(tieneApertaR4(undefined)).toBe(false)
    })
    it('FA-07 la rotta: lo Stop della figlia con «figlie: tutte» (FA-G1, Desktop): lei e le sue figlie, mai `{}` (senza cascata)', () => {
        expect(richiestaFermaFigliaR4('figlia 1')).toEqual({ metodo: 'POST', percorso: '/api/v1/sessions/figlia%201/stop', corpo: { figlie: 'tutte' } })
    })
    it('FA-08 le parole del PC, IT e EN', () => {
        expect(['conferma.titolo', 'conferma.domanda', 'conferma.conseguenza', 'conferma.ferma', 'esito.inCorso', 'esito.fatto'].map((k) => testoFermaAgenteR4(k as never, 'it')))
            .toEqual(['Fermare questa delega?', 'Il lavoro già fatto resta al suo posto.', 'Quello in corso no: il giro si interrompe dove è arrivato.', 'Ferma la delega', 'Lo fermo…', 'Fermato'])
        expect(['conferma.titolo', 'conferma.ferma', 'esito.inCorso', 'esito.fatto', 'esito.giaFinito'].map((k) => testoFermaAgenteR4(k as never, 'en-GB')))
            .toEqual(['Stop this delegation?', 'Stop the delegation', 'Stopping it…', 'Stopped', 'It had already finished: nothing to stop'])
    })
})
