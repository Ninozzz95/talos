import { describe, expect, it } from 'vitest'
import {
    TALOS_RESEARCH_PDF_TONES,
    talosResearchPdfSpec,
    talosResearchPdfTally,
} from '@/lib/research/researchPdf'
import type { TalosResearchReportRecord } from '@/lib/research/researchReport'

/**
 * Owner 2026-08-03: «quando clicchi per generare il pdf appare un popup che ti
 * fa scegliere il "tono" del pdf tra 3 template».
 *
 * Il test che conta e' il primo: i tre devono essere documenti DIVERSI. Un
 * cambio di tavolozza travestito da scelta e' una domanda posta a vuoto.
 */
function claim(text: string, supported: 'yes' | 'partial' | 'no' | 'unknown', sourceIndex = 0) {
    return {
        text,
        sourceIndex,
        passage: supported === 'unknown' ? '' : `il passaggio per «${text}»`,
        checks: { claimSupported: supported } as never,
    }
}

function report(over: Partial<TalosResearchReportRecord> = {}): TalosResearchReportRecord {
    return {
        version: 1,
        question: 'chi ha inventato il microonde',
        summary: 'Percy Spencer, per caso, nel 1945.',
        judge: 'deepseek-v4',
        claims: [
            claim('Spencer lavorava alla Raytheon', 'yes'),
            claim('la barretta si sciolse in tasca', 'partial'),
            claim('il brevetto e del 1946', 'no', 1),
            claim('costava 5000 dollari', 'unknown'),
        ],
        sources: [
            { url: 'https://esempio.it/spencer', title: 'Percy Spencer', publishedAt: null, obtained: 'page' },
            { url: 'https://altro.example.org/brevetti', title: '', publishedAt: null, obtained: 'snippet' },
        ],
        ...over,
    } as TalosResearchReportRecord
}

function testo(spec: ReturnType<typeof talosResearchPdfSpec>): string {
    return JSON.stringify(spec.blocks)
}

describe('i tre toni del PDF', () => {
    it('sono tre DOCUMENTI diversi, non tre tavolozze', () => {
        /**
         * Se i tre differissero solo per il tema, chi riceve il popup si
         * fermerebbe a pensare e qualunque cosa scegliesse otterrebbe la stessa
         * cosa. La differenza si misura sulla FORMA: quanti blocchi, di che
         * tipo.
         */
        const forme = TALOS_RESEARCH_PDF_TONES.map((tone) => (
            talosResearchPdfSpec(report(), tone).blocks.map((block) => block.t).join(',')
        ))
        expect(new Set(forme).size).toBe(3)
    })

    it('il rapporto completo porta il PASSAGGIO, che e la prova', () => {
        // Senza, «sostenuta» e' una parola che chiede fiducia invece di darla.
        const completo = testo(talosResearchPdfSpec(report(), 'report'))
        expect(completo).toContain('il passaggio per «Spencer lavorava alla Raytheon»')
        expect(completo).toContain('Le fonti')
    })

    it('la sintesi NON porta i passaggi ne l elenco delle fonti', () => {
        // Una sintesi che riporta tutto non e' una sintesi: e' il rapporto
        // senza le prove.
        const breve = testo(talosResearchPdfSpec(report(), 'brief'))
        expect(breve).not.toContain('il passaggio per')
        expect(breve).not.toContain('https://esempio.it/spencer')
        // Ma dice quello che NON regge, che e' la meta' che gli altri tacciono.
        expect(breve).toContain('Quello che NON regge')
    })

    it('il dossier mette affermazione, verdetto e fonte SULLA STESSA RIGA', () => {
        /**
         * La ricerca sui concorrenti: tutti e cinque guidano col volume delle
         * fonti e nessuno dice se quello che affermano ha retto. Questa tabella
         * e' la risposta, ed e' il motivo per cui il tono esiste.
         */
        const spec = talosResearchPdfSpec(report(), 'dossier')
        const tabella = spec.blocks.find((block) => block.t === 'table')
        expect(tabella).toBeDefined()
        expect((tabella as { head: string[] }).head).toEqual(['#', 'Affermazione', 'Verdetto', 'Fonte'])
        const riga = (tabella as { rows: string[][] }).rows[0]!
        expect(riga[1]).toBe('Spencer lavorava alla Raytheon')
        expect(riga[2]).toContain('sostenuta')
        expect(riga[3]).toBe('Percy Spencer')
    })

    it('una fonte senza titolo diventa il suo dominio, non un URL che sfonda la cella', () => {
        const spec = talosResearchPdfSpec(report(), 'dossier')
        const righe = (spec.blocks.find((b) => b.t === 'table') as { rows: string[][] }).rows
        expect(righe[2]![3]).toBe('altro.example.org')
    })

    it('dice CHI ha giudicato — o che nessuno l ha fatto', () => {
        /**
         * «Nessun giudice era disponibile» e «tutte le citazioni hanno fallito
         * il controllo» sono due fatti diversi, e il record li tiene separati
         * apposta. Un PDF che tace consegna un verdetto senza dire chi l'ha
         * dato.
         */
        for (const tone of TALOS_RESEARCH_PDF_TONES) {
            expect(testo(talosResearchPdfSpec(report(), tone))).toContain('deepseek-v4')
            expect(testo(talosResearchPdfSpec(report({ judge: null }), tone)))
                .toContain('Nessun giudice indipendente')
        }
    })

    it('conta il bilancio come lo conta la scheda', () => {
        expect(talosResearchPdfTally(report())).toEqual({
            supported: 1, partial: 1, contradicted: 1, unverified: 1,
        })
    })

    it('una ricerca senza affermazioni lo DICE, invece di consegnare pagine vuote', () => {
        // Non e' un errore: una ricerca puo' finire senza che nessuna citazione
        // regga. Ma un PDF di sole intestazioni non lo dice a nessuno.
        for (const tone of TALOS_RESEARCH_PDF_TONES) {
            const vuoto = testo(talosResearchPdfSpec(report({ claims: [] }), tone))
            expect(vuoto).toContain('non ha prodotto affermazioni verificabili')
        }
    })

    it('usa il titolo scelto dall utente e tiene la domanda sotto', () => {
        // Rinominare una ricerca non deve far sparire quello che si era chiesto.
        const spec = talosResearchPdfSpec(report(), 'report', { title: 'Il forno di Spencer', date: '03/08/2026' })
        const cover = spec.blocks[0] as { title: string, subtitle: string, date: string }
        expect(cover.title).toBe('Il forno di Spencer')
        expect(cover.subtitle).toBe('chi ha inventato il microonde')
        expect(cover.date).toBe('03/08/2026')
    })
})
