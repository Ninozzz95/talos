import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cartaApprovazioneR4, chiChiedeR4, corpoApprovazioneR4, descriviAzioneApprovazioneR4, esitoApprovazioneR4, politicaDellaFigliaR4 } from '@/lib/harness/r4/approvazioniR4'
import appApprovazione from '@/lib/harness/r4/testi/app-approvazione-r4.json'

/*
 * ⛔ K3-AP1 (ledger `LEDGER-K3-APPROVAZIONI-2026-10-16.md`; owner 16/10 «Carta nella conversazione»). Il golden è calcolato dalle
 * funzioni VERE del desktop r4 @ 2161afb32 (`lingua.js`, `contenuto-sospetto.js`, `testo-server.js`, `chat-foot.js`, `nomi-attrezzi.js`,
 * `coordinazione.js`) con `descriviAzioneApprovazione`, `codiceAzioneApprovazione`, `motivoRichiestaApprovazione`, il badge e i pulsanti
 * di `appendApprovalCard` trascritti riga per riga (scratchpad `doctor/golden-approvazioni.mjs`).
 */
const golden = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'approvazioni-golden-701c6c0d2.json'), 'utf8'))
type Scenario = { nome: string; azione: Record<string, unknown>; politica: { permessi: string; perAttrezzo: Record<string, string> } }
const scenario = (nome: string) => (golden.scenari as Scenario[]).find((s) => s.nome === nome)!

describe('la carta d\'approvazione del Codice su r4 (K3-AP1)', () => {
    it('APR-01 ogni carta del golden, in italiano e in inglese, uguale al desktop', () => {
        for (const lingua of ['it', 'en'] as const) {
            for (const s of golden.scenari as Scenario[]) {
                expect(cartaApprovazioneR4(s.azione, s.politica, lingua), `${lingua} ${s.nome}`).toEqual(golden[lingua].carte[s.nome])
            }
        }
    })

    it('APR-02 il terzo pulsante: sessione sull\'attrezzo, percorso davanti a un segreto, cartella fuori progetto; tolto dove sarebbe falso', () => {
        const terzo = (nome: string) => cartaApprovazioneR4(scenario(nome).azione, scenario(nome).politica, 'it').terzo?.scelta ?? null
        expect(['shell-su-richiesta', 'leggi-segreto', 'fuori-verificato', 'fuori-non-verificato', 'rete-sessione', 'rete-file',
            'contenuto-sospetto', 'sempre-non-basta'].map(terzo)).toEqual(['sessione', 'percorso', 'cartella', null, null, null, null, null])
    })

    it('APR-03 gli esiti come il desktop, «da un\'altra finestra» solo se è vero', () => {
        for (const lingua of ['it', 'en'] as const) {
            for (const e of golden.esiti as Array<{ nome: string; approvato: boolean; altrove?: boolean; ambito?: string; motivo?: string }>) {
                const { nome, altrove, ...esito } = e
                expect(esitoApprovazioneR4(esito, { altrove: Boolean(altrove) }, lingua), `${lingua} ${nome}`).toBe(golden[lingua].esiti[nome])
            }
        }
    })

    it('APR-04 il corpo esatto di POST /approve per ogni scelta (requireApprovaBody di r4)', () => {
        expect(corpoApprovazioneR4('q1', 'nega')).toEqual({ requestId: 'q1', approvato: false })
        expect(corpoApprovazioneR4('q1', 'unaVolta')).toEqual({ requestId: 'q1', approvato: true })
        expect(corpoApprovazioneR4('q1', 'sessione')).toEqual({ requestId: 'q1', approvato: true })
        expect(corpoApprovazioneR4('q1', 'percorso')).toEqual({ requestId: 'q1', approvato: true, ambito: 'percorso' })
        expect(corpoApprovazioneR4('q1', 'cartella')).toEqual({ requestId: 'q1', approvato: true, ambito: 'cartella' })
    })

    it('APR-05 un\'azione storta o vuota non lancia: la carta generica del permesso', () => {
        for (const storta of [null, undefined, 3, 'x', {}]) {
            const c = cartaApprovazioneR4(storta, { permessi: 'On request', perAttrezzo: {} }, 'en')
            expect(c.badge).toBe('Asks for permission')
            expect(c.codice).toBe('')
        }
    })

    /* K3-AP3: la carta di una figlia disegnata nella madre (`appendApprovalCard` con `figlia`): la politica che ha deciso, o solo le
       frasi del kernel (`senzaPolitica`); e la riga «chi chiede» di `creaChiChiede`. La prima azione è quella VERA di `/pending`. */
    it('APR-06 le carte delle figlie e la riga «chi chiede», uguali al desktop', () => {
        for (const lingua of ['it', 'en'] as const) {
            for (const f of golden.figlie as Array<{ nome: string; azione: Record<string, unknown>; politica: unknown }>) {
                const { politica, senzaPolitica } = politicaDellaFigliaR4(f.politica)
                expect(cartaApprovazioneR4(f.azione, politica, lingua, { senzaPolitica }), `${lingua} ${f.nome}`).toEqual(golden[lingua].figlie[f.nome])
            }
            expect(chiChiedeR4('Esegui i test del progetto', lingua)).toEqual({ prima: golden[lingua].chi.prima, nome: 'Esegui i test del progetto', dopo: golden[lingua].chi.dopo })
            expect(chiChiedeR4(null, lingua)).toEqual({ prima: golden[lingua].chi.senza, nome: null, dopo: '' })
            expect(chiChiedeR4('   ', lingua)).toEqual({ prima: golden[lingua].chi.senza, nome: null, dopo: '' })
        }
        expect(golden.figlie.map((f: { nome: string }) => f.nome)).toEqual(['figlia-shell', 'figlia-senza-politica', 'figlia-permessi-illeggibili', 'figlia-cancello', 'figlia-segreto-senza-politica'])
    })

    /*
     * pin r4 4cee78f33 (owner 29/10 «Ferma tutto», `descriviAzioneApprovazione` `CONTROLLO_FIGLIE` di legacy/app.js): fermare, mettere in
     * pausa o riprendere gli agenti — uno, o tutti con `childId: "all"` — si dice; prima cadeva nel ripiego generico.
     */
    it('APR-07 fermare, mettere in pausa o riprendere un agente o tutti: la frase del desktop, non il ripiego', () => {
        const casi: [string, unknown, string][] = [
            ['stop_child', 'figlia-1', 'approval.wantsStopAgent'], ['stop_child', 'all', 'approval.wantsStopAllAgents'],
            ['pause_child', 'figlia-1', 'approval.wantsPauseAgent'], ['pause_child', 'all', 'approval.wantsPauseAllAgents'],
            ['resume_child', undefined, 'approval.wantsResumeAgent'], ['resume_child', 'all', 'approval.wantsResumeAllAgents'],
        ]
        for (const lingua of ['it', 'en'] as const) {
            for (const [tipo, childId, chiave] of casi) {
                expect(descriviAzioneApprovazioneR4({ tipo, childId }, lingua), `${lingua} ${tipo} ${String(childId)}`).toBe((appApprovazione[lingua] as Record<string, string>)[chiave])
            }
        }
        expect(descriviAzioneApprovazioneR4({ tipo: 'toString' }, 'it')).toBe((appApprovazione.it as Record<string, string>)['approval.wantsChangeSomething'])
    })
})
