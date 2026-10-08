/*
 * ⛔⛔ K4b (07/10/2026) — LE PAROLE DI TALOS NEI DOCUMENTI DELLA RICERCA, IN DUE LINGUE.
 *
 * Decisione dell'owner, 07/10/2026 sera: «i rapporti di ricerca esportati (HTML, Markdown, PDF) escono nella lingua
 * dell'interfaccia». Il 04/10 una sessione Gemini li aveva portati in solo inglese senza chiedere, e il PDF era rimasto
 * mezzo italiano e mezzo inglese (`pdf.mjs`, «In breve» accanto a «What does NOT hold»).
 *
 * Perché un dizionario QUI e non quello del frontend: i documenti escono dal server come byte (un .pdf, un .html che si
 * apre con `file://`), quindi le parole devono già esserci quando il file nasce. La lingua la manda il frontend nella
 * richiesta (`?lingua=it|en`, rotta `…/research/:id/esporta`); senza, vale l'inglese, che è la lingua sorgente di TALOS.
 * Precedente nello stesso repo: la pagina di ritorno OAuth di `http-app.mjs`, che sceglie it/en dal server.
 *
 * ⛔ Cosa NON passa di qui: la prosa scritta dal modello (la sintesi, il testo delle affermazioni) e i passaggi citati.
 *   Sono contenuto, non interfaccia: escono come sono.
 * ⛔ L'inglese è la sorgente (regola del 03/10: «inglese prima, poi italiano»); l'italiano ripete le frasi che il
 *   prodotto aveva prima del 04/10, dove esistevano.
 */

export const LINGUE_DOCUMENTO = Object.freeze(['en', 'it'])

/** La lingua di un documento: 'it' o 'en'. Qualunque altro valore (o nessuno) è inglese. */
export function linguaDocumento(lingua) {
    return lingua === 'it' ? 'it' : 'en'
}

const TESTI = Object.freeze({
    en: Object.freeze({
        verdetto: Object.freeze({
            yes: 'supported by source',
            partial: 'partially supported',
            no: 'NOT supported by source',
            contested: 'contested — sources disagree',
            altro: 'unverified',
        }),
        bilancioRiga: (s) => [`Claims: ${s.total}`, `supported: ${s.supported}`, `partial: ${s.partial}`, `unsupported: ${s.unsupported}`, `unverified: ${s.unchecked}`],
        giudice: (nome) => `Verification performed by: ${nome} — never by the model that authored the report.`,
        senzaGiudice: 'Verification not performed: no independent judge was available.',
        titoloAffermazioni: 'Claims',
        esito: 'Outcome',
        passaggioAssente: (citazione) => (citazione ? `(the cited passage is not in the source text: "${citazione}")` : '(the cited passage is not in the source text)'),
        fonte: 'Source',
        soloEstratto: 'search engine snippet only',
        fonteMaiRaccolta: 'Source: cited but never collected.',
        titoloFonti: (n) => `Sources (${n})`,
        dataDichiarata: (d) => `declared date: ${d}`,
        dataNonDichiarata: 'date not declared',
        paginaLetta: 'page read',
        // pdf
        pdfGiudicate: (nome) => `Claims were judged by ${nome}, matching them against the source passage.`,
        pdfSenzaGiudice: 'No independent judge was available: verdicts come solely from mechanical citation checks.',
        pdfSottotitolo: 'TALOS Deep Research',
        pdfKpi: Object.freeze(['Supported', 'Partial', 'Contradicted', 'Unverified']),
        pdfInBreve: 'In brief',
        pdfUnaPerUna: 'Claims, one by one',
        pdfVerdettoFonte: (verdetto, fonte) => `Verdict: ${verdetto} — source: ${fonte}`,
        pdfFonti: 'Sources',
        pdfTestaFonti: Object.freeze(['#', 'Title', 'Address', 'How']),
        pdfEstratto: 'snippet only',
        pdfRegge: 'What holds',
        pdfNonRegge: 'What does NOT hold',
        pdfNonVerificate: (n) => `${n} claims could not be verified: source was not reopened or passage was missing.`,
        pdfAffermazioniEProve: 'Claims and evidence',
        pdfTestaDossier: Object.freeze(['#', 'Claim', 'Verdict', 'Source']),
        pdfNessunaAffermazione: 'This research did not yield verifiable claims.',
        pdfPiede: 'TALOS · deep research',
        // esportazioni
        senzaVerifiche: 'UNVERIFIED Report: this research does not carry a verifiable record, so no claims were compared against their source.',
        ricercaApprofondita: 'Deep research',
        nomeFileRiserva: 'research',
        fontiTitolo: (domanda) => `Sources — ${domanda}`,
        fontiConteggio: (f, a) => `${f} sources, ${a} claims.`,
        fontiIndirizzo: 'URL',
        fontiData: 'Declared date',
        fontiNonDichiarata: 'not declared',
        fontiCome: 'How obtained',
        fontiPaginaLetta: 'full page read',
        fontiNessuna: 'No claims rest on this source.',
        fontiPassaggi: 'Cited passages:',
        fontiPassaggioAssente: '(cited passage was not found in source text)',
        htmlGiudice: (nome) => `Verification performed by: ${nome} — never by the model that wrote the report.`,
        htmlBilancio: Object.freeze({ totali: 'claims', sostenute: 'supported', inParte: 'partial', nonSostenute: 'unsupported', contese: 'contested', nonVerificate: 'unverified' }),
        htmlPassaggioAssente: 'The cited passage was not found in the source text.',
        htmlStato: 'Status',
        htmlModello: 'model',
        htmlStatoIgnoto: 'unknown',
    }),
    it: Object.freeze({
        verdetto: Object.freeze({
            yes: 'sostenuta dalla fonte',
            partial: 'sostenuta solo in parte',
            no: 'NON sostenuta dalla fonte',
            contested: 'contesa — le fonti non concordano',
            altro: 'non verificata',
        }),
        bilancioRiga: (s) => [`Affermazioni: ${s.total}`, `sostenute: ${s.supported}`, `in parte: ${s.partial}`, `non sostenute: ${s.unsupported}`, `non verificate: ${s.unchecked}`],
        giudice: (nome) => `Verifica eseguita da: ${nome} — mai dal modello che ha scritto il rapporto.`,
        senzaGiudice: 'Verifica non eseguita: nessun giudice indipendente era disponibile.',
        titoloAffermazioni: 'Le affermazioni',
        esito: 'Esito',
        passaggioAssente: (citazione) => (citazione ? `(il passaggio citato non è nel testo della fonte: "${citazione}")` : '(il passaggio citato non è nel testo della fonte)'),
        fonte: 'Fonte',
        soloEstratto: 'solo estratto dal motore di ricerca',
        fonteMaiRaccolta: 'Fonte: citata ma mai raccolta.',
        titoloFonti: (n) => `Fonti (${n})`,
        dataDichiarata: (d) => `data dichiarata: ${d}`,
        dataNonDichiarata: 'data non dichiarata',
        paginaLetta: 'pagina letta',
        // pdf
        pdfGiudicate: (nome) => `Le affermazioni sono state giudicate da ${nome}, confrontandole con il passaggio della fonte.`,
        pdfSenzaGiudice: 'Nessun giudice indipendente era disponibile: i verdetti vengono dal solo controllo meccanico della citazione.',
        pdfSottotitolo: 'Ricerca approfondita TALOS',
        pdfKpi: Object.freeze(['Sostenute', 'In parte', 'Smentite', 'Non verificate']),
        pdfInBreve: 'In breve',
        pdfUnaPerUna: 'Le affermazioni, una per una',
        pdfVerdettoFonte: (verdetto, fonte) => `Verdetto: ${verdetto} — fonte: ${fonte}`,
        pdfFonti: 'Le fonti',
        pdfTestaFonti: Object.freeze(['#', 'Titolo', 'Indirizzo', 'Come']),
        pdfEstratto: 'solo estratto',
        pdfRegge: 'Quello che regge',
        pdfNonRegge: 'Quello che NON regge',
        pdfNonVerificate: (n) => `${n} affermazioni non è stato possibile verificarle: la fonte non è stata riaperta o il passaggio non c'era.`,
        pdfAffermazioniEProve: 'Affermazioni e prove',
        pdfTestaDossier: Object.freeze(['#', 'Affermazione', 'Verdetto', 'Fonte']),
        pdfNessunaAffermazione: 'Questa ricerca non ha prodotto affermazioni verificabili.',
        pdfPiede: 'TALOS · ricerca approfondita',
        // esportazioni
        senzaVerifiche: 'Rapporto SENZA VERIFICHE: questa ricerca non porta il record verificabile, quindi nessuna affermazione è stata confrontata con la sua fonte.',
        ricercaApprofondita: 'Ricerca approfondita',
        nomeFileRiserva: 'ricerca',
        fontiTitolo: (domanda) => `Fonti — ${domanda}`,
        fontiConteggio: (f, a) => `${f} fonti, ${a} affermazioni.`,
        fontiIndirizzo: 'Indirizzo',
        fontiData: 'Data dichiarata',
        fontiNonDichiarata: 'non dichiarata',
        fontiCome: 'Come è stata ottenuta',
        fontiPaginaLetta: 'pagina letta',
        fontiNessuna: 'Nessuna affermazione poggia su questa fonte.',
        fontiPassaggi: 'Passaggi citati:',
        fontiPassaggioAssente: '(il passaggio citato non è stato ritrovato nel testo della fonte)',
        htmlGiudice: (nome) => `Verifica eseguita da: ${nome} — mai dal modello che ha scritto il rapporto.`,
        htmlBilancio: Object.freeze({ totali: 'affermazioni', sostenute: 'sostenute', inParte: 'in parte', nonSostenute: 'non sostenute', contese: 'contese', nonVerificate: 'non verificate' }),
        htmlPassaggioAssente: 'Il passaggio citato non è stato ritrovato nel testo della fonte.',
        htmlStato: 'Stato',
        htmlModello: 'modello',
        htmlStatoIgnoto: 'ignoto',
    }),
})

/** Le parole di un documento nella lingua chiesta (inglese se la lingua non è una delle due). */
export function testiDocumento(lingua) {
    return TESTI[linguaDocumento(lingua)]
}
