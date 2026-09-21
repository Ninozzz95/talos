import assert from 'node:assert/strict'
import test from 'node:test'

import {
    TALOS_RESEARCH_PDF_DEFAULT_TONE,
    TALOS_RESEARCH_PDF_TONES,
    talosResearchPdfSpec,
    talosResearchPdfTally,
} from '../../src/research/pdf.mjs'
import { talosResearchReportDocument, talosResearchParseReport } from '../../src/research/report.mjs'

/*
 * TRADUZIONE dei test di `mobile/tests/unit/research/researchPdf.test.ts` (vitest → node:test),
 * letti per intero il 12/09/2026. Stessi otto casi, stesse asserzioni — più i due che il
 * mobile non poteva avere, e che sono la ragione per cui questo porto non è un copia-incolla.
 *
 * ⛔⛔ LA FIXTURE È SCRITTA DAL MOTORE VERO, non a mano. Il mobile costruisce il record a mano
 *   con `sourceIndex` numerato **da 0**, e proprio per quello il suo test non vede il difetto
 *   che il modulo ha: `report.sources[claim.sourceIndex]` senza `- 1`. Qui il record passa da
 *   `talosResearchReportDocument` → `talosResearchParseReport`, cioè dallo scrittore e dal
 *   lettore che il prodotto usa davvero: se la convenzione fosse sbagliata, l'ultima
 *   affermazione uscirebbe con la fonte «—» e la prima con la fonte della seconda.
 */

const DOMANDA = 'chi ha inventato il microonde'

/** Un'affermazione come la scrive `verification.mjs`: `sourceIndex` 1-BASED, come ovunque. */
function claim(text, supported, sourceIndex = 1) {
    return {
        claim: { text, sourceIndex, quote: `q-${text}` },
        passage: supported === 'unknown' ? '' : `il passaggio per «${text}»`,
        checks: { claimSupported: supported },
    }
}

function record(over = {}) {
    const letto = talosResearchParseReport(talosResearchReportDocument({
        question: DOMANDA,
        summary: 'Percy Spencer, per caso, nel 1945.',
        judge: 'deepseek-v4',
        claims: [
            claim('Spencer lavorava alla Raytheon', 'yes', 1),
            claim('la barretta si sciolse in tasca', 'partial', 1),
            claim('il brevetto è del 1946', 'no', 2),
            claim('costava 5000 dollari', 'unknown', 2),
        ],
        sources: [
            { url: 'https://esempio.it/spencer', title: 'Percy Spencer', publishedAt: null, obtained: 'page' },
            { url: 'https://altro.example.org/brevetti', title: '', publishedAt: null, obtained: 'snippet' },
        ],
    }))
    assert.ok(letto, 'la fixture deve passare dal lettore vero, non da un oggetto scritto a mano')
    return { ...letto, ...over }
}

const testo = (spec) => JSON.stringify(spec.blocks)

test('⭐⭐⭐ i tre toni sono tre DOCUMENTI diversi, non tre tavolozze', () => {
    /*
     * Se i tre differissero solo per il tema, chi riceve la scelta si fermerebbe a pensare e
     * qualunque cosa scegliesse otterrebbe la stessa cosa. La differenza si misura sulla FORMA:
     * quanti blocchi, di che tipo.
     */
    const forme = TALOS_RESEARCH_PDF_TONES.map((tone) => (
        talosResearchPdfSpec(record(), tone).blocks.map((block) => block.t).join(',')
    ))
    assert.equal(new Set(forme).size, 3)
    assert.equal(TALOS_RESEARCH_PDF_DEFAULT_TONE, 'report', 'il tono di partenza è quello che non lascia fuori niente')
})

test('il rapporto completo porta il PASSAGGIO, che è la prova', () => {
    // Senza, «sostenuta» è una parola che chiede fiducia invece di darla.
    const completo = testo(talosResearchPdfSpec(record(), 'report'))
    assert.match(completo, /il passaggio per «Spencer lavorava alla Raytheon»/)
    assert.match(completo, /Le fonti/)
})

test('la sintesi NON porta i passaggi né l\'elenco delle fonti', () => {
    // Una sintesi che riporta tutto non è una sintesi: è il rapporto senza le prove.
    const breve = testo(talosResearchPdfSpec(record(), 'brief'))
    assert.doesNotMatch(breve, /il passaggio per/)
    assert.doesNotMatch(breve, /esempio\.it\/spencer/)
    // Ma dice quello che NON regge, che è la metà che gli altri tacciono.
    assert.match(breve, /Quello che NON regge/)
})

test('il dossier mette affermazione, verdetto e fonte SULLA STESSA RIGA', () => {
    const spec = talosResearchPdfSpec(record(), 'dossier')
    const tabella = spec.blocks.find((block) => block.t === 'table')
    assert.ok(tabella)
    assert.deepEqual(tabella.head, ['#', 'Affermazione', 'Verdetto', 'Fonte'])
    assert.equal(tabella.rows[0][1], 'Spencer lavorava alla Raytheon')
    assert.match(tabella.rows[0][2], /sostenuta/)
    assert.equal(tabella.rows[0][3], 'Percy Spencer')
})

test('⛔⛔⛔ `sourceIndex` È 1-BASED — il difetto del modulo mobile, che qui NON si porta', () => {
    /*
     * `researchPdf.ts:137,217` fa `report.sources[claim.sourceIndex]`. Ogni altro lettore dello
     * stesso record (`researchReport.ts:128`, `researchRecheck.ts:114`, `researchSynthesis.ts:254`,
     * `researchVerification.ts:397,422` — e il nostro `report.mjs`) fa `- 1`.
     * ⇒ Con un record VERO, quello del mobile sposterebbe ogni attribuzione di una fonte e
     *   manderebbe le ultime su «—». Questo test è la prova che qui non succede; il difetto resta
     *   APERTO sul mobile, dove non ho ownership.
     */
    const tabella = talosResearchPdfSpec(record(), 'dossier').blocks.find((b) => b.t === 'table')
    assert.deepEqual(
        tabella.rows.map((riga) => riga[3]),
        ['Percy Spencer', 'Percy Spencer', 'altro.example.org', 'altro.example.org'],
        '⛔ le due affermazioni di fonte 1 nominano la fonte 1, e nessuna riga cade su «—»',
    )
    assert.equal(tabella.rows.filter((riga) => riga[3] === '—').length, 0)
})

test('una fonte senza titolo diventa il suo dominio, non un URL che sfonda la cella', () => {
    const righe = talosResearchPdfSpec(record(), 'dossier').blocks.find((b) => b.t === 'table').rows
    assert.equal(righe[2][3], 'altro.example.org')
})

test('dice CHI ha giudicato — o che nessuno l\'ha fatto', () => {
    /*
     * «Nessun giudice era disponibile» e «tutte le citazioni hanno fallito il controllo» sono due
     * fatti diversi, e il record li tiene separati apposta. Un PDF che tace su questo consegna un
     * verdetto senza dire chi l'ha dato.
     */
    for (const tone of TALOS_RESEARCH_PDF_TONES) {
        assert.match(testo(talosResearchPdfSpec(record(), tone)), /deepseek-v4/)
        assert.match(testo(talosResearchPdfSpec(record({ judge: null }), tone)), /Nessun giudice indipendente/)
    }
})

test('conta il bilancio come lo conta la scheda', () => {
    assert.deepEqual(talosResearchPdfTally(record()), {
        supported: 1, partial: 1, contradicted: 1, unverified: 1,
    })
})

test('una ricerca senza affermazioni lo DICE, invece di consegnare pagine vuote', () => {
    // Non è un errore: una ricerca può finire senza che nessuna citazione regga. Ma un PDF di
    // sole intestazioni non lo dice a nessuno.
    for (const tone of TALOS_RESEARCH_PDF_TONES) {
        assert.match(testo(talosResearchPdfSpec(record({ claims: [] }), tone)), /non ha prodotto affermazioni verificabili/)
    }
})

test('usa il titolo scelto dall\'utente e tiene la domanda sotto', () => {
    // Rinominare una ricerca non deve far sparire quello che si era chiesto.
    const spec = talosResearchPdfSpec(record(), 'report', { title: 'Il forno di Spencer', date: '2026-08-03' })
    assert.equal(spec.blocks[0].title, 'Il forno di Spencer')
    assert.equal(spec.blocks[0].subtitle, DOMANDA)
    assert.equal(spec.blocks[0].date, '2026-08-03')
})

test('⭐ il tema e il piè di pagina sono quelli che l\'impaginatore del desktop conosce', () => {
    /*
     * ⛔ `document-report.mjs` (porto di `reportBuilder.ts`) ha DUE temi, `report` e `plain`, e un
     *   tema sconosciuto ricadrebbe in silenzio su `report`: il dossier perderebbe la sua tavolozza
     *   larga senza che niente protesti.
     */
    assert.equal(talosResearchPdfSpec(record(), 'dossier').theme, 'plain')
    assert.equal(talosResearchPdfSpec(record(), 'report').theme, 'report')
    assert.equal(talosResearchPdfSpec(record(), 'brief').theme, 'report')
    assert.deepEqual(talosResearchPdfSpec(record(), 'report').footer, { text: 'TALOS · ricerca approfondita', pageNo: true })
})
