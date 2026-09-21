import { talosResearchSupportLabel } from './report.mjs'
import { inlineInTestoSemplice, markdownInBlocchiReport, runsDiMarkdown } from './markdown-server.mjs'

/*
 * PORTO di AVM/mobile/src/lib/research/researchPdf.ts (246 righe, letto per intero il
 * 12/09/2026 prima di scrivere una riga). ⛔ SOLA LETTURA sul mobile: qui non si tocca.
 *
 * ⛔⛔ EXPORT — una ricerca che diventa un PDF, in TRE TONI.
 *
 * Owner 2026-08-03 (mobile): «quando clicchi per generare il pdf appare un popup che ti fa
 * scegliere il "tono" del pdf tra 3 template». Owner 12/09/2026 (desktop): «la ricerca
 * approfondita deve avere una suite di esportazioni COMPLETA».
 *
 * I tre sono documenti DIVERSI, non tre tavolozze sullo stesso testo. Un cambio di colore
 * travestito da scelta è una domanda posta a vuoto: chi la riceve deve fermarsi a pensare, e
 * qualunque cosa risponda ottiene la stessa cosa.
 *
 *   `report`  — a chi deve leggerlo tutto: copertina, sintesi, ogni affermazione col suo
 *               verdetto e il passaggio, poi le fonti.
 *   `brief`   — a chi ha due minuti: la risposta, cosa regge, cosa NON regge. Niente
 *               passaggi, niente elenco fonti.
 *   `dossier` — a chi deve controllare: affermazione, verdetto, fonte, in tabella. Nessuna
 *               prosa. È quello che gli altri non hanno.
 *
 * ⛔ Il modulo è PURO di proposito, come il suo originale: il documento si prova senza
 *   pdfmake, senza rete e senza telefono. Chi lo trasforma in byte è `esportazioni.mjs`, che
 *   passa questo `TalosReportInput` a `generateTalosDocument({format:'pdf', report})` — cioè
 *   allo STESSO impaginatore (`document-report.mjs`) che usa `document_create`. Un secondo
 *   impaginatore sarebbe un secondo aspetto per gli stessi documenti.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════
 * ⛔⛔⛔ L'UNICA DIVERGENZA DAL MOBILE, E NON È UNO STILE: `sourceIndex` È 1-BASED.
 * ════════════════════════════════════════════════════════════════════════════════════════
 *
 * `researchPdf.ts` fa `report.sources[claim.sourceIndex]`. Ogni altro lettore dello stesso
 * record — su mobile E qui — fa `sources[claim.sourceIndex - 1]`:
 *   · `researchReport.ts:128` / `report.mjs` (la prosa del rapporto)
 *   · `researchRecheck.ts:114`, `researchSynthesis.ts:254`, `researchVerification.ts:397,422`
 * ⇒ Il PDF del mobile attribuisce ogni affermazione alla fonte SEGUENTE, e l'ultima a «—».
 *   Il suo test non lo vede perché la sua fixture numera le fonti da 0, cioè con una
 *   convenzione che nessun motore produce.
 * ⛔ Portarlo «fedele» qui avrebbe importato il difetto su un record scritto da `report.mjs`,
 *   che è 1-based per costruzione. Qui si usa `- 1`, e il test lo morde con un record vero.
 *   ⛔ Il difetto resta APERTO sul mobile: non ho ownership lì, si segnala e non si corregge.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════
 * ⛔⛔ LA SECONDA DIVERGENZA, 12/09: IL MARKDOWN SI RENDE.
 * ═════════════════════════════════════════════════════════════════════════════════════
 *
 * `researchPdf.ts` mette la sintesi in un blocco solo (`{t:'p', x: report.summary}`) e il
 * testo di ogni affermazione dentro un titolo, così com'è. Ma quel testo lo scrive un modello,
 * e un modello scrive **Markdown**: nel PDF di una ricerca vera (L8, 12/09) uscivano
 * `## Executive Summary` e `**Key Components:**` LETTERALI, come nell'HTML.
 * ⇒ Qui la sintesi passa da `markdownInBlocchiReport` (titoli, elenchi, tabelle veri) e il
 *   testo delle affermazioni da `runsDiMarkdown` / `inlineInTestoSemplice`.
 * ⛔ Il PASSAGGIO no, mai: è la PROVA, cioè il testo com'è nella fonte. Renderlo vorrebbe dire
 *   modificare l'unica cosa che il rapporto conserva perché non sia modificabile.
 */

/**
 * @import { TalosResearchReportRecord } from './report.mjs'
 */

export const TALOS_RESEARCH_PDF_TONES = Object.freeze(['report', 'brief', 'dossier'])

/** Il tono di partenza: quello completo, che non lascia fuori niente. */
export const TALOS_RESEARCH_PDF_DEFAULT_TONE = 'report'

/** @param {{checks?:object}} claim */
function verdetto(claim) {
    return talosResearchSupportLabel(claim?.checks ?? {})
}

/**
 * Il nome della fonte di un'affermazione. ⛔ `sourceIndex` è 1-BASED (vedi la testa del file).
 * @param {TalosResearchReportRecord} report
 * @param {number} numero
 * @returns {string}
 */
function fonteDi(report, numero) {
    const source = report.sources[Number(numero) - 1]
    if (!source) return '—'
    // Il titolo se c'è, altrimenti il dominio: un URL intero in una cella di tabella la
    // sfonda, e nessuno lo legge comunque.
    if (String(source.title ?? '').trim().length > 0) return source.title
    /*
     * ⛔ L'host INTERO (`altro.example.org`), non il dominio registrabile: il porto del mobile fa
     *   `new URL(url).hostname`, e qui era partita una scorciatoia verso
     *   `talosResearchRegistrableHost` di `independence.mjs` — che torna l'eTLD+1
     *   (`example.org`). Quella funzione esiste per decidere se due fonti sono INDIPENDENTI, cioè
     *   per accorpare i sottodomini apposta: usarla per un'etichetta farebbe leggere due fonti
     *   diverse come la stessa. Trovato dal test, non ragionandoci sopra.
     */
    try {
        return new URL(source.url).hostname || String(source.url ?? '—')
    } catch {
        return String(source.url ?? '—')
    }
}

/**
 * Quante reggono, quante a metà, quante smentite, quante mai verificate.
 * @param {TalosResearchReportRecord} report
 * @returns {{supported:number, partial:number, contradicted:number, unverified:number}}
 */
export function talosResearchPdfTally(report) {
    const tally = { supported: 0, partial: 0, contradicted: 0, unverified: 0 }
    for (const claim of report.claims ?? []) {
        switch (claim?.checks?.claimSupported) {
            case 'yes': tally.supported += 1; break
            case 'partial': tally.partial += 1; break
            case 'no': tally.contradicted += 1; break
            default: tally.unverified += 1
        }
    }
    return tally
}

/**
 * La riga che dice come è stato giudicato, o che NON lo è stato.
 *
 * «Nessun giudice indipendente era disponibile» e «tutte le citazioni hanno fallito il
 * controllo meccanico» sono due fatti diversi, e il record li tiene separati apposta. Un PDF
 * che tace su questo consegna un verdetto senza dire chi l'ha dato.
 */
function nota(report) {
    return {
        t: 'note',
        x: report.judge
            ? `Le affermazioni sono state giudicate da ${report.judge}, confrontandole con il passaggio della fonte.`
            : 'Nessun giudice indipendente era disponibile: i verdetti vengono dal solo controllo meccanico della citazione.',
    }
}

function copertina(report, options) {
    const titolo = String(options.title ?? '').trim()
    return {
        t: 'cover',
        title: titolo || report.question,
        subtitle: titolo ? report.question : 'Ricerca approfondita TALOS',
        ...(options.date ? { date: options.date } : {}),
    }
}

function bilancio(report) {
    const tally = talosResearchPdfTally(report)
    return {
        t: 'kpi',
        items: [
            { l: 'Sostenute', v: String(tally.supported) },
            { l: 'In parte', v: String(tally.partial) },
            { l: 'Smentite', v: String(tally.contradicted) },
            { l: 'Non verificate', v: String(tally.unverified) },
        ],
    }
}

function rapportoCompleto(report, options) {
    const blocks = [
        copertina(report, options),
        { t: 'h', lvl: 1, x: 'In breve' },
        ...markdownInBlocchiReport(report.summary, { livelloMinimo: 2 }),
        bilancio(report),
        nota(report),
        { t: 'pb' },
        { t: 'h', lvl: 1, x: 'Le affermazioni, una per una' },
    ]
    report.claims.forEach((claim, index) => {
        blocks.push({ t: 'h', lvl: 3, x: `${index + 1}. ${inlineInTestoSemplice(claim.text)}` })
        blocks.push({ t: 'p', x: `Verdetto: ${verdetto(claim)} — fonte: ${fonteDi(report, claim.sourceIndex)}` })
        // Il passaggio è la prova. Senza, «sostenuta» è una parola che chiede fiducia invece
        // di darla.
        if (String(claim.passage ?? '').trim().length > 0) blocks.push({ t: 'note', x: `«${claim.passage}»` })
    })
    if (report.sources.length > 0) {
        blocks.push({ t: 'pb' }, { t: 'h', lvl: 1, x: 'Le fonti' })
        blocks.push({
            t: 'table',
            head: ['#', 'Titolo', 'Indirizzo', 'Come'],
            align: ['r', 'l', 'l', 'l'],
            rows: report.sources.map((source, index) => [
                String(index + 1),
                source.title || '—',
                source.url,
                source.obtained === 'page' ? 'pagina letta' : 'solo estratto',
            ]),
        })
    }
    return blocks
}

function sintesi(report, options) {
    const tally = talosResearchPdfTally(report)
    const regge = report.claims.filter((claim) => claim?.checks?.claimSupported === 'yes')
    const nonRegge = report.claims.filter((claim) => (
        claim?.checks?.claimSupported === 'no' || claim?.checks?.claimSupported === 'partial'
    ))
    /*
     * Niente copertina, e non è una svista.
     *
     * Misurato sul OnePlus Pad 3 (2026-08-04): con la copertina la sintesi usciva di DUE
     * pagine — il blocco `cover` ha 140 punti di margine in cima e da solo si mangia la prima.
     * La riga nel popup promette «una pagina», e una promessa che il documento non mantiene è
     * peggio della promessa assente.
     */
    const titolo = String(options.title ?? '').trim()
    const blocks = [
        { t: 'h', lvl: 1, x: titolo || report.question },
        ...(titolo ? [{ t: 'note', x: report.question }] : []),
        ...markdownInBlocchiReport(report.summary, { livelloMinimo: 3 }),
        bilancio(report),
    ]
    if (regge.length > 0) {
        blocks.push({ t: 'h', lvl: 2, x: 'Quello che regge' })
        // Quattro, non tutte: una sintesi che riporta trenta punti non è una sintesi, è il
        // rapporto senza le prove.
        blocks.push({ t: 'list', items: regge.slice(0, 4).map((claim) => runsDiMarkdown(claim.text)) })
    }
    if (nonRegge.length > 0) {
        blocks.push({ t: 'h', lvl: 2, x: 'Quello che NON regge' })
        blocks.push({
            t: 'list',
            items: nonRegge.slice(0, 4).map((claim) => `${inlineInTestoSemplice(claim.text)} — ${verdetto(claim)}`),
        })
    }
    if (tally.unverified > 0) {
        blocks.push({
            t: 'note',
            x: `${tally.unverified} affermazioni non è stato possibile verificarle: la fonte non è stata riaperta o il passaggio non c'era.`,
        })
    }
    blocks.push(nota(report))
    return blocks
}

function dossier(report, options) {
    return [
        copertina(report, options),
        { t: 'h', lvl: 1, x: 'Affermazioni e prove' },
        nota(report),
        {
            t: 'table',
            head: ['#', 'Affermazione', 'Verdetto', 'Fonte'],
            align: ['r', 'l', 'l', 'l'],
            rows: report.claims.map((claim, index) => [
                String(index + 1),
                runsDiMarkdown(claim.text),
                verdetto(claim),
                fonteDi(report, claim.sourceIndex),
            ]),
        },
        {
            t: 'chart',
            kind: 'pie',
            labels: ['Sostenute', 'In parte', 'Smentite', 'Non verificate'],
            series: [{ data: Object.values(talosResearchPdfTally(report)) }],
        },
    ]
}

/**
 * Il documento, nel tono chiesto.
 *
 * Un rapporto senza affermazioni non è un errore — una ricerca può finire senza che nessuna
 * citazione regga — ma un PDF di sole intestazioni vuote non lo dice a nessuno. Quindi si dice.
 *
 * @param {TalosResearchReportRecord} report
 * @param {'report'|'brief'|'dossier'} tone
 * @param {{date?:string, title?:string|null}} [options]
 * @returns {{theme:string, footer:object, blocks:object[]}}
 */
export function talosResearchPdfSpec(report, tone, options = {}) {
    const blocks = (report.claims?.length ?? 0) === 0
        ? [
            copertina(report, options),
            ...markdownInBlocchiReport(report.summary, { livelloMinimo: 2 }),
            { t: 'note', x: 'Questa ricerca non ha prodotto affermazioni verificabili.' },
        ]
        : tone === 'brief'
            ? sintesi(report, options)
            : tone === 'dossier'
                ? dossier(report, options)
                : rapportoCompleto(report, options)

    return {
        // Il dossier vive di tabelle larghe; gli altri due si leggono.
        theme: tone === 'dossier' ? 'plain' : 'report',
        footer: { text: 'TALOS · ricerca approfondita', pageNo: true },
        blocks,
    }
}
