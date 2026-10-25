// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
    codiceBreve, conteggiDelleSessioni, dimenticaRicordo, leggiRicordo, nomeConCodice, ricordaEffimero, ricordaProgramma, ricordaSessioni, ricordaVisto,
} from '@/lib/remoto/ricordiDelPc'
import type { TalosRigaSessioneR4 } from '@/lib/harness/r4/elencoSessioniR4'

/**
 * Mockup remoto, tavola 1 (owner 23/10, Desktop (3) 24/10): «visto alle» e gli ultimi numeri restano SUL dispositivo, per `pcId`,
 * mai mandati a nessuno; il codice breve sono le prime 4 cifre di `pcId` in minuscolo, come le mostrerà il PC.
 */
const riga = (id: string, stato: Partial<TalosRigaSessioneR4['stato']> = {}): TalosRigaSessioneR4 => ({
    id, title: id, updated_at: '2026-10-24T10:00:00.000Z',
    stato: { conclusa: true, interrotta: false, ultimoMessaggio: null, inAttesaApprovazione: false, ultimoEsito: null, ...stato },
})

beforeEach(() => { localStorage.clear() })

describe('ricordi del PC sul dispositivo', () => {
    it('RIC-01 codice breve: le prime 4 cifre di pcId in minuscolo', () => {
        expect(codiceBreve('31AB9f00c0ffee')).toBe('31ab')
    })

    it('RIC-02 il codice compare solo se un altro PC ha lo stesso nome', () => {
        const elenco = [
            { pcId: '31ab0000', nome: 'UFFICIO' }, { pcId: '77cd0000', nome: 'UFFICIO' }, { pcId: 'aa000000', nome: 'PORTATILE' },
        ]
        expect(nomeConCodice(elenco[0], elenco, 'Computer')).toBe('UFFICIO · 31ab')
        expect(nomeConCodice(elenco[2], elenco, 'Computer')).toBe('PORTATILE')
    })

    it('RIC-03 conteggi: totale, in corso, aspetta te (un\'attesa non è anche «in corso»)', () => {
        const righe = [
            riga('a'), riga('b', { conclusa: false }), riga('c', { conclusa: false, inAttesaApprovazione: true }),
            riga('d', { conclusa: false, interrotta: true }),
        ]
        expect(conteggiDelleSessioni(righe)).toEqual({ totale: 4, inCorso: 1, aspettaTe: 1 })
    })

    it('RIC-04 visto e numeri restano per pcId, con l\'ora della lettura; «Dimentica» li toglie', () => {
        ricordaVisto('pc-a', 1000)
        ricordaSessioni('pc-a', { totale: 12, inCorso: 1, aspettaTe: 1 }, 2000)
        expect(leggiRicordo('pc-a')).toEqual({ vistoAlle: 2000, sessioni: { totale: 12, inCorso: 1, aspettaTe: 1, letteAlle: 2000 }, programma: null, effimero: false })
        expect(leggiRicordo('pc-b')).toEqual({ vistoAlle: null, sessioni: null, programma: null, effimero: false })
        dimenticaRicordo('pc-a')
        expect(leggiRicordo('pc-a')).toEqual({ vistoAlle: null, sessioni: null, programma: null, effimero: false })
    })

    it('RIC-05 un archivio guasto o scritto male non rompe la schermata', () => {
        localStorage.setItem('talos.remoto.ricordi.v1', '{non json')
        expect(leggiRicordo('pc-a')).toEqual({ vistoAlle: null, sessioni: null, programma: null, effimero: false })
        localStorage.setItem('talos.remoto.ricordi.v1', JSON.stringify({ 'pc-a': { vistoAlle: 'ieri', sessioni: { totale: -1 }, programma: 7 } }))
        expect(leggiRicordo('pc-a')).toEqual({ vistoAlle: null, sessioni: null, programma: null, effimero: false })
    })

    /* Fetta C, Desktop (3) 24/10: `pc.programma` di `pair.ok` (`servizio.mjs:125`, «TALOS desktop» o il valore della CLI) distingue
       il desktop dalla CLI sullo stesso PC. Il nativo non lo salva: lo ricorda il dispositivo all'accoppiamento, accanto al resto. */
    it('RIC-06 il programma del PC si ricorda quando si accoppia, corto e solo testo; i numeri letti dopo non lo cancellano', () => {
        ricordaProgramma('pc-a', 'TALOS desktop')
        ricordaSessioni('pc-a', { totale: 1, inCorso: 0, aspettaTe: 0 }, 5)
        expect(leggiRicordo('pc-a').programma).toBe('TALOS desktop')
        ricordaProgramma('pc-b', 'x'.repeat(200))
        expect(leggiRicordo('pc-b').programma).toHaveLength(40)
        ricordaProgramma('pc-c', null)
        expect(leggiRicordo('pc-c').programma).toBeNull()
    })

    it('RIC-07 «di prova» (pc.effimero) si ricorda solo se proprio true; numeri e programma letti dopo non lo cancellano', () => {
        ricordaEffimero('pc-a', true)
        ricordaProgramma('pc-a', 'TALOS desktop')
        ricordaSessioni('pc-a', { totale: 1, inCorso: 0, aspettaTe: 0 }, 3000)
        expect(leggiRicordo('pc-a').effimero).toBe(true)
        ricordaEffimero('pc-a', false)
        expect(leggiRicordo('pc-a').effimero).toBe(false)
        localStorage.setItem('talos.remoto.ricordi.v1', JSON.stringify({ 'pc-b': { effimero: 'true' } }))
        expect(leggiRicordo('pc-b').effimero).toBe(false)
    })
})
