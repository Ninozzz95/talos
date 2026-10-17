import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    LARGHEZZA_VISTE_IN_TESTATA,
    SCHEDE_MASSIME_R4,
    TASTI_TERMINALE_R4,
    conModificatoriR4,
    controlloTerminaleR4,
    frasiAvvioFallitoR4,
    sequenzaTastoR4,
    testoTerminaleR4,
    titoloSchedaR4,
    vociTerminaliR4,
} from '@/lib/harness/r4/terminaleR4'
import mobile from '@/lib/harness/r4/testi/terminale-mobile.json'

/*
 * ⛔ K3-TERM T3 (ledger `LEDGER-K3-TERMINALE-2026-10-16.md`; owner 16/10: scrittura diretta + barra dei tasti su una riga, più
 * schede come il desktop). Le risposte e i frame sono quelli VERI di r4 @ 2161afb32 registrati sul Pad (id anonimizzati).
 */
const registrato = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'terminale-2161afb32.json'), 'utf8'))
const passo = (nome: string) => registrato.passi.find((p: { nome: string }) => p.nome === nome)

describe('il Terminale del Codice su r4 (K3-TERM T3)', () => {
    it('TRM-01 le schede vere, nell\'ordine del server; una voce storta non entra; un errore è un elenco vuoto', () => {
        expect(vociTerminaliR4(passo('elenco-vuoto').risposta)).toEqual([])
        const una = vociTerminaliR4(passo('elenco-con-una-attiva').risposta)
        // due schede create, solo la prima collegata: la seconda è «rotta» (creata da POST), non attiva
        expect(una.map((v) => [v.terminalId.slice(0, 4), v.origine, v.attiva])).toEqual([['1111', 'prima-scheda', true], ['2222', 'rotta', false]])
        expect(una[0]).toEqual({ terminalId: '11111111-1111-4111-8111-111111111111', origine: 'prima-scheda', attiva: true,
            cartella: '/data/data/ai.talos.dev/files/codice/workspace', creatoAlle: '2026-10-16T10:09:24.166Z' })
        expect(vociTerminaliR4({ ok: true, data: { items: [{ terminalId: 'a b' }, null, { terminalId: 'ok-1', origine: 'rotta', attiva: false }] } })
            .map((v) => v.terminalId)).toEqual(['ok-1'])
        expect(vociTerminaliR4(passo('crea-corpo-non-vuoto').risposta)).toEqual([])
    })

    it('TRM-02 i frame di controllo veri: agganciato (nuova e ripresa), uscita col codice; l\'errore d\'avvio; il resto è null', () => {
        const [prima, ripresa, uscita] = registrato.controlli.map((c: { json: string }) => controlloTerminaleR4(c.json))
        expect(prima).toEqual({ tipo: 'agganciato', ripreso: false, shell: 'posix-shell', comando: '/system/bin/sh' })
        expect(ripresa).toEqual({ tipo: 'agganciato', ripreso: true, shell: 'posix-shell', comando: '/system/bin/sh' })
        expect(uscita).toEqual({ tipo: 'uscita', codice: 3 })
        expect(controlloTerminaleR4(registrato.erroreDalSorgente.json)).toEqual({ tipo: 'errore', code: 'TERMINAL_START_FAILED',
            reason: 'folder-missing', cartella: '/data/data/ai.talos.dev/files/codice/sparita' })
        for (const storto of ['', 'non json', '{"evento":"altro"}', '[]', '{"evento":"uscita","codice":"x"}']) expect(controlloTerminaleR4(storto)).toBeNull()
        expect(controlloTerminaleR4('{"evento":"uscita","codice":null}')).toEqual({ tipo: 'uscita', codice: null })
    })

    it('TRM-03 la barra dei tasti è quella decisa, nell\'ordine; Esc, Tab e frecce danno le sequenze giuste anche in modo applicazione', () => {
        expect(TASTI_TERMINALE_R4.map((t) => t.id)).toEqual(['esc', 'tab', 'ctrl', 'alt', 'sinistra', 'giu', 'su', 'destra', 'pipe', 'tilde', 'barra', 'meno'])
        expect(TASTI_TERMINALE_R4.filter((t) => t.modificatore).map((t) => t.id)).toEqual(['ctrl', 'alt'])
        expect(sequenzaTastoR4('esc', { cursoreApplicazione: false })).toBe('\x1b')
        expect(sequenzaTastoR4('tab', { cursoreApplicazione: false })).toBe('\t')
        expect(['su', 'giu', 'destra', 'sinistra'].map((id) => sequenzaTastoR4(id, { cursoreApplicazione: false }))).toEqual(['\x1b[A', '\x1b[B', '\x1b[C', '\x1b[D'])
        expect(['su', 'giu', 'destra', 'sinistra'].map((id) => sequenzaTastoR4(id, { cursoreApplicazione: true }))).toEqual(['\x1bOA', '\x1bOB', '\x1bOC', '\x1bOD'])
        expect(['pipe', 'tilde', 'barra', 'meno'].map((id) => sequenzaTastoR4(id, { cursoreApplicazione: false }))).toEqual(['|', '~', '/', '-'])
        expect(sequenzaTastoR4('ctrl', { cursoreApplicazione: false })).toBeNull()
    })

    it('TRM-04 Ctrl e Alt a scatto valgono per un carattere; un incolla o una parola del predittivo passa com\'è e li consuma', () => {
        expect(conModificatoriR4('c', { ctrl: true, alt: false })).toBe('\x03')
        expect(conModificatoriR4('C', { ctrl: true, alt: false })).toBe('\x03')
        expect(conModificatoriR4('[', { ctrl: true, alt: false })).toBe('\x1b')
        expect(conModificatoriR4('?', { ctrl: true, alt: false })).toBe('\x7f')
        expect(conModificatoriR4(' ', { ctrl: true, alt: false })).toBe('\x00')
        expect(conModificatoriR4('x', { ctrl: false, alt: true })).toBe('\x1bx')
        expect(conModificatoriR4('c', { ctrl: true, alt: true })).toBe('\x1b\x03')
        expect(conModificatoriR4('ciao', { ctrl: true, alt: true })).toBe('ciao')
        expect(conModificatoriR4('é', { ctrl: true, alt: false })).toBe('é')
        expect(conModificatoriR4('q', { ctrl: false, alt: false })).toBe('q')
    })

    it('TRM-05 il titolo della scheda come il desktop: «tu · sh», numerato fra omonime; uno scelto vince', () => {
        const a = { terminalId: 'a', shell: 'posix-shell', comando: '/system/bin/sh' }
        const b = { terminalId: 'b', shell: 'posix-shell', comando: '/system/bin/sh' }
        expect(titoloSchedaR4(a, [a], 'it')).toBe('tu · sh')
        expect([a, b].map((v) => titoloSchedaR4(v, [a, b], 'en'))).toEqual(['you · sh', 'you · sh 2'])
        expect(titoloSchedaR4({ terminalId: 'c' }, [{ terminalId: 'c' }], 'it')).toBe('tu · shell')
        expect(titoloSchedaR4({ ...a, titolo: 'build' }, [a], 'it')).toBe('build')
    })

    it('TRM-06 avvio fallito, uscita e parole delle schede nelle due lingue, dalle parole del desktop', () => {
        const errore = controlloTerminaleR4(registrato.erroreDalSorgente.json)!
        expect(frasiAvvioFallitoR4(errore, 'it')).toBe('Il terminale non si è avviato: la cartella «/data/data/ai.talos.dev/files/codice/sparita» non esiste.')
        expect(frasiAvvioFallitoR4({ tipo: 'errore', code: 'TERMINAL_START_FAILED', reason: 'not-a-folder', cartella: '/x' }, 'en')).toBe('The terminal could not start: "/x" is not a folder.')
        expect(frasiAvvioFallitoR4({ tipo: 'errore', code: 'TERMINAL_START_FAILED', reason: 'spawn-failed', cartella: '/x' }, 'it')).toBe('Il terminale non si è avviato: il sistema ha rifiutato di lanciare la shell.')
        expect(testoTerminaleR4('app.terminal.shellClosed', 'it', { codice: 3 })).toBe('shell chiusa, codice 3')
        expect(testoTerminaleR4('processi.terminal.tooManyTabs', 'en', { n: SCHEDE_MASSIME_R4 })).toBe('You already have 8 tabs open: close one')
        expect(testoTerminaleR4('modello.chat.terminal', 'it')).toBe('Terminale')
        expect(testoTerminaleR4('mobile.tasti.label', 'en')).toBe('Terminal keys')
        expect(LARGHEZZA_VISTE_IN_TESTATA).toBe(780)
    })

    it('TRM-07 le parole del mobile hanno le stesse chiavi in italiano e in inglese, e nessuna vuota', () => {
        expect(Object.keys(mobile.it).sort()).toEqual(Object.keys(mobile.en).sort())
        for (const lingua of ['it', 'en'] as const) for (const [k, v] of Object.entries(mobile[lingua])) expect(String(v).trim(), `${lingua}.${k}`).not.toBe('')
        for (const t of TASTI_TERMINALE_R4) {
            expect(testoTerminaleR4(`mobile.tasti.${t.id}`, 'it'), t.id).not.toMatch(/^mobile\./u)
            expect(testoTerminaleR4(`mobile.tasti.${t.id}`, 'en'), t.id).not.toMatch(/^mobile\./u)
        }
    })
})
