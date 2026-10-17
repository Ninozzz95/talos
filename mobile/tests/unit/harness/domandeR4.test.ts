import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    annuncioDomandaR4, chiEQuandoDomandaR4, dopoLaSceltaR4, erroreInvioDomandaR4, esitoDomandaR4, progressoDomandaR4,
    messaggioRifiutoDomandaR4, pulsantiDomandaR4, revisioneDomandaR4, ricevutaDomandaR4, rispostaDallaBozzaR4, testoDomandaR4, type BozzaDomandaR4,
} from '@/lib/harness/r4/domandeR4'
import type { DomandaUtenteR4 } from '@/lib/harness/r4/domandaChiave'

/*
 * ⛔ K3-AP2 (ledger `LEDGER-K3-DOMANDE-2026-10-16.md`; owner 16/10: carta nella conversazione, una alla volta, parità col desktop).
 * Il golden è calcolato MONTANDO il vero `components/user-question-dock.js` del desktop r4 @ 2161afb32 in jsdom, col vero
 * `lingua.js` (scratchpad `doctor/golden-domande.mjs`): ciò che il dock mostra e fa, per ogni bozza e ogni esito, in it e en.
 */
const golden = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'domande-golden-701c6c0d2.json'), 'utf8'))
const D_SINGOLA: DomandaUtenteR4 = { id: 'database', header: 'Database', question: 'Quale database uso?', why: 'decide lo schema',
    options: [{ label: 'SQLite', description: 'Un file, niente server', recommended: true }, { label: 'PostgreSQL', description: 'Server vero' }] }
const D_MULTI: DomandaUtenteR4 = { id: 'funzioni', question: 'Quali funzioni aggiungo?', multiSelect: true,
    options: [{ label: 'Login', description: 'Accesso con password' }, { label: 'Ricerca', description: 'Cerca nei testi' }, { label: 'Esporta', description: 'File CSV' }] }
const D_LIBERA: DomandaUtenteR4 = { id: 'nome', question: 'Come si chiama il progetto?', why: 'va nel titolo' }
const D_SECONDA: DomandaUtenteR4 = { id: 'stile', question: 'Che stile uso?', options: [{ label: 'Chiaro', description: 'Sfondo chiaro' }, { label: 'Scuro', description: 'Sfondo scuro' }] }
const INSIEMI: Record<string, DomandaUtenteR4[]> = { una: [D_SINGOLA], tre: [D_SINGOLA, D_MULTI, D_LIBERA], dueSingole: [D_SINGOLA, D_SECONDA] }
const BOZZE: Record<string, BozzaDomandaR4> = {
    vuota: {},
    unaSingola: { database: { scelte: ['SQLite'], altro: '', testo: '' } },
    singolaAltro: { database: { scelte: [], altro: 'MySQL', testo: '' } },
    singolaSceltaEAltro: { database: { scelte: ['SQLite'], altro: 'MySQL', testo: '' } },
    treComplete: { database: { scelte: ['PostgreSQL'], altro: '', testo: '' }, funzioni: { scelte: ['Login', 'Esporta'], altro: 'Backup', testo: '' }, nome: { scelte: [], altro: '', testo: '  Atlas  ' } },
    treMancaUna: { database: { scelte: ['SQLite'], altro: '', testo: '' }, funzioni: { scelte: ['Ricerca'], altro: '', testo: '' } },
    treMancanoDue: { funzioni: { scelte: [], altro: 'Solo login', testo: '' } },
    treDoppione: { database: { scelte: ['SQLite'], altro: '', testo: '' }, funzioni: { scelte: ['Login'], altro: 'Login', testo: '' }, nome: { scelte: [], altro: '', testo: 'X' } },
}
const LINGUE = ['it', 'en'] as const

describe('le domande di TALOS nel Codice su r4 (K3-AP2)', () => {
    it('DOM-01 il golden copre il dock vero (sanità della fixture)', () => {
        expect(golden.origine.r4).toMatch(/^701c6c0d2/)
        expect(golden.casi.it.esiti.length).toBe(37)
        expect(golden.casi.en.ricevute.length).toBe(4)
    })

    it('DOM-02 progresso, pulsanti della fase di risposta e risposta letta dalla bozza, come il dock', () => {
        for (const lingua of LINGUE) {
            const casi = golden.casi[lingua]
            for (const p of casi.progresso) expect(progressoDomandaR4(p.corrente, INSIEMI[p.insieme].length, lingua), `${lingua} ${p.insieme} ${p.corrente}`).toBe(p.testo)
            for (const p of casi.pulsanti) expect(pulsantiDomandaR4('answer', p.corrente, 3, lingua).map((b) => b.testo), `${lingua} ${p.corrente}`).toEqual(p.pulsanti)
            for (const r of casi.risposte) expect(rispostaDallaBozzaR4(INSIEMI[r.insieme], BOZZE[r.bozza]), `${lingua} ${r.bozza}`).toEqual(r.risposta)
        }
    })

    it('DOM-03 il tocco di un\'opzione: avanti, invio dell\'ultima singola, niente con multiple o «Altro» (dopoLaScelta)', () => {
        for (const lingua of LINGUE) {
            for (const s of golden.casi[lingua].scelte) {
                const domande = INSIEMI[s.insieme]
                const azione = dopoLaSceltaR4(domande, s.bozzaDopo, s.indice, s.corrente)
                expect(azione, `${s.insieme} ${s.bozza} ${s.indice}/${s.corrente}#${s.opzione}`).toBe(s.azione)
                if (s.inviato) expect(rispostaDallaBozzaR4(domande, s.bozzaDopo)).toEqual(s.inviato.answers)
            }
        }
    })

    it('DOM-04 la revisione e la conferma del salto, con le parole e il blocco dell\'invio del dock', () => {
        for (const lingua of LINGUE) {
            const casi = golden.casi[lingua]
            for (const r of casi.revisioni) {
                const v = revisioneDomandaR4(INSIEMI.tre, BOZZE[r.bozza], lingua)
                expect({ titolo: v.titolo, righe: v.righe, avviso: v.avviso, puoInviare: v.puoInviare }, `${lingua} ${r.bozza}`)
                    .toEqual({ titolo: r.titolo, righe: r.righe, avviso: r.avviso, puoInviare: r.puoInviare })
                expect(pulsantiDomandaR4('review', 2, 3, lingua).map((b) => b.testo)).toEqual(r.pulsanti)
            }
            expect(testoDomandaR4('chat.question.skipAll.title', lingua)).toBe(casi.salta.titolo)
            expect(testoDomandaR4('chat.question.skipAll.warning', lingua)).toBe(casi.salta.avviso)
            expect(pulsantiDomandaR4('skip-review', 0, 3, lingua).map((b) => b.testo)).toEqual(casi.salta.pulsanti)
        }
    })

    it('DOM-05 esito, badge «Decisione», chi e quando, e la ricevuta con le opzioni offerte', () => {
        for (const lingua of LINGUE) {
            const casi = golden.casi[lingua]
            for (const e of casi.esiti) {
                const richiesta = { at: e.at ?? '2026-10-16T15:01:00', origine: e.origine }
                const esito = e.at ? {} : { at: '2026-10-16T15:02:00', ...(e.da ? { da: e.da } : {}), ...(e.motivo ? { motivo: e.motivo } : {}) }
                const nome = `${lingua} ${e.status}/${e.motivo}/${e.altrove}/${JSON.stringify(e.origine)}`
                expect(testoDomandaR4('chat.question.decision', lingua), nome).toBe(e.badge)
                expect(esitoDomandaR4(e.status, e.motivo, e.altrove, lingua), nome).toBe(e.frase)
                expect(chiEQuandoDomandaR4(richiesta, e.status, esito, e.altrove, lingua) || null, nome).toBe(e.meta)
            }
            for (const r of casi.ricevute) {
                expect(ricevutaDomandaR4(INSIEMI[r.insieme], r.status, r.answers ? { answers: r.answers } : {}, lingua), `${lingua} ${r.insieme} ${r.status}`).toEqual(r.righe)
            }
        }
    })

    it('DOM-06 gli errori dell\'invio: 404/409/410 non più attiva, 400/422 riapre col motivo, il resto non verificato; e l\'annuncio del mobile', () => {
        for (const lingua of LINGUE) {
            const casi = golden.casi[lingua]
            for (const e of casi.errori) {
                const r = erroreInvioDomandaR4(e.stato, e.message, lingua)
                expect({ testo: r.testo, fase: r.fase ?? 'review', bloccata: r.bloccata }, `${lingua} ${e.stato}`).toEqual({ testo: e.avviso, fase: e.fase, bloccata: e.bloccata })
            }
            expect(testoDomandaR4('chat.question.submit.received', lingua)).toBe(casi.ricevuto)
        }
        // la frase del mobile: la domanda sta nella conversazione, non «sopra il campo di scrittura»
        expect(annuncioDomandaR4([D_SINGOLA], 'it')).toBe('TALOS chiede una decisione: Quale database uso? La domanda è nella conversazione.')
        expect(annuncioDomandaR4([D_SINGOLA, D_SECONDA], 'en')).toBe('TALOS asks for 2 decisions: Quale database uso? · Che stile uso? The questions are in the conversation.')
        expect(annuncioDomandaR4([{ id: 'x', question: 'Pronto.' }], 'it')).toBe('TALOS chiede una decisione: Pronto. La domanda è nella conversazione.')
    })

    it('DOM-07 il motivo di un rifiuto di POST /question con le parole del desktop (`errori.js`), il messaggio del server se il codice è ignoto', () => {
        // la risposta VERA di r4 sul Pad a una domanda già chiusa (registrata il 16/10): 409 QUESTION_NOT_PENDING
        expect(messaggioRifiutoDomandaR4('QUESTION_NOT_PENDING', 'This question is no longer pending: the session has moved on', 'it'))
            .toBe('Questa domanda non è più in attesa: la sessione è andata avanti')
        expect(messaggioRifiutoDomandaR4('QUESTION_NOT_PENDING', 'x', 'en')).toBe('This question is no longer pending: the session has moved on')
        expect(messaggioRifiutoDomandaR4('QUERY_INVALID', 'answers must contain exactly the questions asked', 'it')).toBe('Query non valida')
        expect(messaggioRifiutoDomandaR4('TALOS_SCONOSCIUTO', 'Qualcosa di nuovo', 'it')).toBe('Qualcosa di nuovo')
        expect(messaggioRifiutoDomandaR4(null, 'rete caduta', 'it')).toBe('rete caduta')
        expect(erroreInvioDomandaR4(409, messaggioRifiutoDomandaR4('QUESTION_NOT_PENDING', '', 'it'), 'it').testo)
            .toBe('Domanda non più attiva: Questa domanda non è più in attesa: la sessione è andata avanti. Ricarica la sessione per verificare lo stato.')
    })
})
