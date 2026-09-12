import { talosSafeFileStem } from '../document-filename.mjs'
import { talosResearchBibtex, talosResearchRis } from './citations.mjs'
import { talosResearchParseReport } from './report.mjs'
import {
    TALOS_RESEARCH_PDF_DEFAULT_TONE,
    TALOS_RESEARCH_PDF_TONES,
    talosResearchPdfSpec,
} from './pdf.mjs'

/*
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * ⭐⭐⭐⭐ 12/09/2026 — LE ESPORTAZIONI DELLA RICERCA APPROFONDITA, IN UN POSTO SOLO
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Owner 12/09/2026: «la ricerca approfondita deve avere una suite di esportazioni COMPLETA».
 *
 * Cosa c'era: il menu della sezione sapeva fare **tre** cose, e tutte e tre **nel browser** —
 * Markdown, BibTeX, RIS, costruiti in `frontend/src/components/ricerca-dettaglio.js` e salvati
 * con un `<a download>`. Il mobile aveva in più il PDF a tre toni (`researchPdf.ts`), il
 * desktop aveva già i generatori di documenti veri (`document-generator.mjs`: PDF, DOCX, XLSX,
 * HTML) usati da `document_create` — e i due non si erano mai incontrati.
 *
 * ⛔⛔ PERCHÉ IL SERVER E NON IL BROWSER, visto che tre formati lì funzionavano già.
 *   1. `docx` e `pdf` **non si possono** fare nel browser senza spedirci `docx`, `pdfmake`,
 *      `jszip` e i font: sono le sette dipendenze che l'owner ha autorizzato **solo** nel
 *      backend (`document-generator.mjs`, 28/8: «mai nel bundle frontend»).
 *   2. Un file che nasce sul server ha un **indirizzo**: si può riscaricare, si può mandare a
 *      un'altra macchina, e domani lo può depositare in Libreria. Un `Blob` no.
 *   3. Il record verificabile lo rilegge **un lettore solo** (`report.mjs`). Il browser che
 *      ri-parsa il blocco recintato è un secondo lettore, in un altro linguaggio, che diverge
 *      dal primo alla prima modifica del formato.
 *
 * ⛔ QUESTO MODULO NON CONOSCE HTTP. Prende la **scheda** che la rotta ha già letto da
 *   `sessionRegistry.leggiRicerca` (la stessa di `GET …/research/:id`) e torna
 *   `{formato, nomeFile, mediaType, bytes}`. La rotta è un passacarte: nessuna decisione sul
 *   contenuto vive lì, e nessuna decisione su stati e intestazioni vive qui.
 *
 * ⛔ NIENTE PERCORSI DA FUORI. Il nome del file nasce dalla **domanda della ricerca**, non da
 *   niente che il chiamante possa scrivere: l'unico testo che arriva dalla query sono
 *   `formato` e `tono`, due allowlist chiuse. Non si apre, non si scrive e non si legge nessun
 *   file su disco da qui.
 *
 * ── Ricerca web PRIMA di scrivere (fonte + data) ────────────────────────────────────────────
 *  · **RFC 6266** (`Use of the Content-Disposition Header Field in HTTP`), letta il 12/09/2026:
 *    «"filename" and "filename*" differ only in that "filename*" uses the encoding defined in
 *    RFC5987», e quando ci sono entrambi «recipients SHOULD pick "filename*" and ignore
 *    "filename"». ⛔ E il vincolo che ha cambiato QUESTO file: il destinatario deve «strip all
 *    but the last path segment» e «ignore or substitute names» con significato nel filesystem —
 *    «..», «~», i nomi di dispositivo. ⇒ `nomeSicuroDiEsportazione` non si fida di
 *    `talosSafeFileStem` da solo: quello toglie `/` `\` `:` ma **lascia passare `..`**, e una
 *    domanda che è letteralmente «..» darebbe `...md`. Provato nei due versi.
 *  · **MDN, `Content-Disposition`**, letta il 12/09/2026: «avoid percent escape sequences in
 *    `filename`, because they are handled inconsistently across browsers (Firefox and Chrome
 *    decode them, while Safari does not)» ⇒ il ripiego ASCII non deve contenere `%`. È già
 *    così in `nomiPerContentDisposition` (sostituisce con `_`, non percent-codifica): qui si
 *    conferma la scelta invece di riscriverne una seconda.
 *  · **DOI Citation Formatter** (citation.doi.org/docs.html, ex citation.crosscite.org), letta
 *    il 12/09/2026: i tipi di contenuto per la negoziazione sono **`application/x-bibtex`** e
 *    **`application/x-research-info-systems`**, supportati da Crossref, DataCite e mEDRA.
 *  · **IANA Media Types registry**, letto il 12/09/2026: né BibTeX né RIS sono **registrati**.
 *    ⇒ i due tipi qui sopra sono `x-` per forza, non per pigrizia — e sono gli stessi che il
 *    frontend usa già oggi nel suo `<a download>`: due risposte diverse per lo stesso file
 *    farebbero aprire lo stesso `.bib` a due programmi diversi.
 */

/** Un guasto di esportazione che la rotta traduce in uno stato HTTP. */
export class EsportazioneRicercaError extends Error {
    /** @param {string} messaggio @param {string} code */
    constructor(messaggio, code) {
        super(messaggio)
        this.name = 'EsportazioneRicercaError'
        this.code = code
    }
}

/**
 * ⛔ L'inventario dei formati, e il campo che decide TUTTO il resto: `vuoleIlRecord`.
 *
 * Una ricerca `senza-rapporto` ha depositato qualcosa che il cancello ha respinto: prosa vera,
 * pagata, senza il record recintato. Da lì `json`, `bib`, `ris` e `fonti` **non si possono**
 * fare — non «escono vuoti»: non esistono. Un `.bib` di zero voci consegnato senza dire niente
 * è il segno di verifica falso che tutto il disegno esiste per togliere ⇒ 409 col motivo.
 * `md`, `html` e `pdf` invece escono lo stesso, perché la prosa c'è: con la dicitura «senza
 * verifiche» stampata sopra, così nessuno la scambia per un rapporto verificato.
 */
const FORMATI = Object.freeze({
    md: { estensione: 'md', mediaType: 'text/markdown; charset=utf-8', vuoleIlRecord: false },
    html: { estensione: 'html', mediaType: 'text/html; charset=utf-8', vuoleIlRecord: false },
    pdf: { estensione: 'pdf', mediaType: 'application/pdf', vuoleIlRecord: false },
    docx: {
        estensione: 'docx',
        mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        vuoleIlRecord: false,
    },
    json: { estensione: 'json', mediaType: 'application/json; charset=utf-8', vuoleIlRecord: true },
    bib: { estensione: 'bib', mediaType: 'application/x-bibtex; charset=utf-8', vuoleIlRecord: true },
    ris: {
        estensione: 'ris',
        mediaType: 'application/x-research-info-systems; charset=utf-8',
        vuoleIlRecord: true,
    },
    /* ⛔ `fonti` è un Markdown, e il suo nome lo dice: `<domanda>-fonti.md`. Un secondo `.md`
       con lo stesso nome del rapporto finirebbe in «(1)» nella cartella dei download, e nessuno
       saprebbe quale dei due è. */
    fonti: { estensione: 'md', suffisso: '-fonti', mediaType: 'text/markdown; charset=utf-8', vuoleIlRecord: true },
})

export const FORMATI_ESPORTAZIONE = Object.freeze(Object.keys(FORMATI))
export const TONI_ESPORTAZIONE = TALOS_RESEARCH_PDF_TONES
export const TONO_ESPORTAZIONE_PREDEFINITO = TALOS_RESEARCH_PDF_DEFAULT_TONE

/** ⛔ La frase che tiene separato «rapporto» da «prosa depositata». Una sola, in un posto solo. */
export const DICITURA_SENZA_VERIFICHE = 'Rapporto SENZA VERIFICHE: questa ricerca non porta il record verificabile, quindi nessuna affermazione è stata confrontata con la sua fonte.'

/** Il tetto del nome, in byte UTF-8: lo stesso che `document-generator.mjs` usa per i suoi file. */
const BYTE_MASSIMI_DEL_NOME = 60

/**
 * Il nome del file, dalla domanda della ricerca. Puro, e si prova senza un server.
 *
 * ⛔ Due difese e non una: `talosSafeFileStem` toglie i caratteri vietati dal filesystem
 *   (`/ \ : " * ? < > |`, i controlli, i marcatori di direzione) e taglia su un confine di
 *   parola; qui sopra si aggiunge quella che RFC 6266 chiede e che quella non fa — un nome che
 *   sia **solo punti e spazi** (`.`, `..`, `. .`) non è un nome, è un percorso.
 *
 * @param {string|null|undefined} domanda
 * @param {string} formato
 * @returns {string}
 */
export function nomeSicuroDiEsportazione(domanda, formato) {
    const forma = FORMATI[formato]
    if (!forma) throw new EsportazioneRicercaError(`unknown export format: ${formato}`, 'RESEARCH_INVALID')
    const grezzo = talosSafeFileStem(String(domanda ?? ''), BYTE_MASSIMI_DEL_NOME, 'ricerca')
    /*
     * ⛔ `..` sopravvive a `talosSafeFileStem` (il punto non è un carattere vietato su nessun
     *   filesystem): qui cade, e con lui ogni nome fatto di soli punti e spazi.
     * ⛔ La classe è `[.\s]+` e non `\.+`, e la differenza l'ha trovata il test: `../../etc/passwd`
     *   diventa «.. .. etc passwd» (le barre sono già spazi), e togliere la sola PRIMA sequenza di
     *   punti lasciava un nome che comincia ancora per punto — cioè un file nascosto su ogni
     *   sistema Unix. Si toglie tutto il prefisso di punti E spazi, quante volte si ripeta.
     */
    const stelo = /[^.\s]/u.test(grezzo) ? grezzo.replace(/^[.\s]+/u, '').trim() || 'ricerca' : 'ricerca'
    return `${stelo}${forma.suffisso ?? ''}.${forma.estensione}`
}

const CODIFICA = new TextEncoder()

function escapeHtml(valore) {
    return String(valore ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** La sola data, dall'ISO: è ciò che una citazione vuole, e l'ora non aggiunge niente. */
function soloLaData(iso) {
    return /^\d{4}-\d{2}-\d{2}/.exec(String(iso ?? ''))?.[0] ?? ''
}

/**
 * Il testo che la ricerca ha prodotto, qualunque cancello abbia passato — o `null`.
 * ⛔ `contenutoRespinto` non si butta: è il prodotto di una corsa pagata.
 */
function prosaDisponibile(ricerca) {
    for (const campo of [ricerca?.contenutoRapporto, ricerca?.contenutoRespinto]) {
        if (typeof campo === 'string' && campo.trim().length > 0) return campo
    }
    return null
}

/**
 * Il Markdown senza il blocco recintato. Serve a `docx` e al ripiego del `pdf`: il record è
 * fatto per una macchina, e dentro un documento impaginato sarebbe una pagina di JSON.
 * ⛔ Il `md` invece lo TIENE — è ciò che rende quel file ri-verificabile.
 */
function senzaIlRecinto(testo) {
    return String(testo ?? '').replace(/```talos-research-report[\s\S]*?```/g, '').trimEnd()
}

/**
 * Il record recintato della scheda, o `null`. ⛔ Il lettore è UNO: `talosResearchParseReport`,
 * lo stesso che scrive il rapporto. Qui non si ri-parsa niente a mano.
 */
export function recordDellaScheda(ricerca) {
    const testo = ricerca?.contenutoRapporto
    return typeof testo === 'string' ? talosResearchParseReport(testo) : null
}

/**
 * Le citazioni, quattro campi e nient'altro.
 *
 * ⛔ Cosa NON esce, ed è la decisione di privacy di `researchCitationExport.ts` che qui si
 *   rispetta: la domanda, il modello che ha giudicato, l'identificativo della ricerca, la chat.
 *   Un file di bibliografia finisce in una cartella condivisa, in un allegato, in un
 *   repository: è il posto meno controllato in cui un dato personale possa arrivare.
 */
function citazioniDaRecord(record, letteAlle) {
    const quando = soloLaData(letteAlle)
    return (record.sources ?? []).map((fonte) => ({
        url: String(fonte?.url ?? ''),
        title: String(fonte?.title ?? ''),
        publishedAt: typeof fonte?.publishedAt === 'string' ? fonte.publishedAt : null,
        accessedAt: quando,
    }))
}

/** Quando l'abbiamo letta: la conclusione se c'è, altrimenti l'avvio. Mai «adesso». */
function letteAlle(ricerca) {
    return ricerca?.conclusaAlle ?? ricerca?.avviataAlle ?? null
}

/* ─────────────────────────────── i costruttori, uno per formato ─────────────────────────── */

function testoMarkdown(ricerca, record) {
    const prosa = prosaDisponibile(ricerca)
    if (!prosa) return null
    // Col record: il rapporto COM'È — recinto compreso, perché è quello che lo rende
    // ri-verificabile da chi lo riceve.
    if (record) return prosa
    return `> ⛔ ${DICITURA_SENZA_VERIFICHE}\n\n${senzaIlRecinto(prosa)}\n`
}

/**
 * Il JSON verificabile: il record **e** la meta che il record non ha.
 *
 * ⛔ `bilancio` e `spesa` non si ricalcolano qui: sono quelli che la scheda ha già, cioè quelli
 *   che la sezione mostra a schermo. Un file che dicesse numeri diversi da quelli sotto gli
 *   occhi di chi lo scarica sarebbe la peggiore delle due verità.
 */
function testoJson(ricerca, record) {
    return `${JSON.stringify({
        schema: 'talos.research.export.v1',
        ricerca: {
            id: ricerca.id ?? null,
            domanda: ricerca.domanda ?? null,
            titolo: ricerca.titolo ?? null,
            stato: ricerca.stato ?? null,
            modello: ricerca.modello ?? null,
            avviataAlle: ricerca.avviataAlle ?? null,
            conclusaAlle: ricerca.conclusaAlle ?? null,
            bilancio: ricerca.bilancio ?? null,
            proveDistinte: ricerca.proveDistinte ?? 0,
            spesa: ricerca.spesa ?? null,
            giudice: ricerca.giudice ?? null,
        },
        record,
    }, null, 2)}\n`
}

/** L'elenco delle fonti, in Markdown: titolo, indirizzo, data dichiarata, passaggi citati. */
function testoFonti(ricerca, record) {
    const righe = [
        `# Fonti — ${ricerca.domanda ?? 'ricerca'}`,
        '',
        `${record.sources.length} fonti, ${record.claims.length} affermazioni.`,
        '',
    ]
    record.sources.forEach((fonte, indice) => {
        const numero = indice + 1
        righe.push(`## ${numero}. ${fonte.title || dominioOIndirizzo(fonte.url)}`)
        righe.push('')
        righe.push(`- Indirizzo: ${fonte.url}`)
        righe.push(`- Data dichiarata: ${fonte.publishedAt ?? 'non dichiarata'}`)
        righe.push(`- Come è stata ottenuta: ${fonte.obtained === 'page' ? 'pagina letta' : 'solo estratto dal motore di ricerca'}`)
        /* ⛔ `sourceIndex` è 1-BASED nel record (vedi `pdf.mjs`): confrontare con `indice`
           attribuirebbe ogni passaggio alla fonte precedente. */
        const passaggi = record.claims.filter((c) => Number(c?.sourceIndex) === numero)
        righe.push('')
        if (passaggi.length === 0) {
            righe.push('Nessuna affermazione poggia su questa fonte.')
        } else {
            righe.push('Passaggi citati:')
            righe.push('')
            for (const claim of passaggi) {
                const passaggio = String(claim.passage ?? '').trim()
                righe.push(passaggio
                    ? `- «${passaggio}» — ${claim.text}`
                    : `- (il passaggio citato non è stato ritrovato nel testo della fonte) — ${claim.text}`)
            }
        }
        righe.push('')
    })
    return righe.join('\n')
}

/** Il dominio, o l'indirizzo grezzo: un titolo mancante non diventa una riga vuota. */
function dominioOIndirizzo(url) {
    try {
        return new URL(url).hostname || String(url ?? 'fonte')
    } catch {
        return String(url ?? 'fonte')
    }
}

/**
 * La pagina autonoma: CSS incorporato, **nessuno script**, e tema chiaro e scuro.
 *
 * ⛔ Niente `<script>`, e non è prudenza generica: questo file esce dalla nostra porta e viene
 *   aperto da un browser qualunque con `file://`. Il testo dentro (domanda, affermazioni, url,
 *   passaggi) viene dal web, cioè da chi ha scritto quelle pagine ⇒ ogni valore passa da
 *   `escapeHtml`, e la risposta esce comunque con `Content-Disposition: attachment` e
 *   `X-Content-Type-Options: nosniff` (la rotta), così non può essere interpretata come una
 *   pagina della nostra origine.
 * ⛔ Tema chiaro E scuro, come ogni superficie di questo prodotto (owner 11/09): chi la apre di
 *   notte non prende un lampo bianco.
 */
function testoHtml(ricerca, record) {
    const prosa = prosaDisponibile(ricerca)
    const domanda = ricerca.domanda ?? 'Ricerca approfondita'
    const b = ricerca.bilancio
    const corpo = []

    if (!record) {
        corpo.push(`<p class="avviso">⛔ ${escapeHtml(DICITURA_SENZA_VERIFICHE)}</p>`)
        for (const blocco of senzaIlRecinto(prosa ?? '').split(/\n{2,}/)) {
            if (blocco.trim()) corpo.push(`<p>${escapeHtml(blocco.trim())}</p>`)
        }
    } else {
        corpo.push(`<p class="sintesi">${escapeHtml(record.summary)}</p>`)
        if (b) {
            corpo.push('<ul class="bilancio">',
                `<li><b>${b.totali}</b> affermazioni</li>`,
                `<li><b>${b.sostenute}</b> sostenute</li>`,
                `<li><b>${b.inParte}</b> in parte</li>`,
                `<li><b>${b.nonSostenute}</b> non sostenute</li>`,
                `<li><b>${b.contese}</b> contese</li>`,
                `<li><b>${b.nonVerificate}</b> non verificate</li>`,
                '</ul>')
        }
        corpo.push(`<p class="giudice">${record.judge
            ? `Verifica eseguita da: ${escapeHtml(record.judge)} — mai dal modello che ha scritto il rapporto.`
            : 'Verifica non eseguita: nessun giudice indipendente era disponibile.'}</p>`)
        corpo.push('<h2>Le affermazioni</h2>')
        /* ⛔ I verdetti escono dalla SCHEDA (`affermazioni[].verdettoUmano`), cioè dalla stessa
           `talosResearchSupportLabel` che scrive la prosa: due frasari sono due verdetti. */
        for (const a of ricerca.affermazioni ?? []) {
            corpo.push('<article>',
                `<h3>${a.numero}. ${escapeHtml(a.testo)}</h3>`,
                `<p class="verdetto v-${escapeHtml(a.verdetto)}">Esito: ${escapeHtml(a.verdettoUmano)}${a.motivoVerdetto ? ` — ${escapeHtml(a.motivoVerdetto)}` : ''}</p>`,
                a.passaggio
                    ? `<blockquote>${escapeHtml(a.passaggio)}</blockquote>`
                    : '<p class="assente">Il passaggio citato non è stato ritrovato nel testo della fonte.</p>',
                `<p class="fonte">Fonte ${a.fonte ?? '—'}</p>`,
                '</article>')
        }
        corpo.push(`<h2>Fonti (${record.sources.length})</h2>`, '<ol class="fonti">')
        for (const f of record.sources) {
            corpo.push(`<li><b>${escapeHtml(f.title || dominioOIndirizzo(f.url))}</b><br>`
                + `<span class="url">${escapeHtml(f.url)}</span><br>`
                + `<span class="quando">${f.publishedAt ? `data dichiarata: ${escapeHtml(f.publishedAt)}` : 'data non dichiarata'}`
                + ` · ${f.obtained === 'page' ? 'pagina letta' : 'solo estratto dal motore di ricerca'}</span></li>`)
        }
        corpo.push('</ol>')
    }

    return `<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(domanda)}</title>
<style>
:root { color-scheme: light dark; --fondo:#fbf9f5; --inchiostro:#2c2320; --tenue:#8a7f79; --pannello:#f2ede4; --bordo:#e3dcd2; --accento:#7b9c7b; --allarme:#9c3b2e; }
@media (prefers-color-scheme: dark) { :root { --fondo:#16130f; --inchiostro:#ece5dc; --tenue:#9d938b; --pannello:#211c17; --bordo:#332c25; --accento:#8fb08f; --allarme:#d98a7c; } }
* { box-sizing: border-box; }
body { margin:0; padding:32px 20px 64px; background:var(--fondo); color:var(--inchiostro);
  font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif; }
main { max-width: 46rem; margin: 0 auto; }
h1 { font-size:1.7rem; line-height:1.25; margin:0 0 4px; }
h2 { font-size:1.15rem; margin:36px 0 10px; padding-bottom:6px; border-bottom:1px solid var(--bordo); }
h3 { font-size:1rem; margin:0 0 6px; }
.meta, .quando, .fonte, .url { color:var(--tenue); font-size:.85rem; }
.sintesi { font-size:1.05rem; }
.avviso { background:var(--pannello); border-left:4px solid var(--allarme); padding:12px 14px; border-radius:0 6px 6px 0; }
.bilancio { list-style:none; display:flex; flex-wrap:wrap; gap:8px 18px; padding:12px 14px; margin:18px 0;
  background:var(--pannello); border:1px solid var(--bordo); border-radius:8px; font-size:.9rem; }
article { border:1px solid var(--bordo); border-radius:8px; padding:14px 16px; margin:0 0 14px; }
blockquote { margin:10px 0 0; padding:8px 12px; border-left:3px solid var(--accento);
  background:var(--pannello); border-radius:0 6px 6px 0; font-size:.95rem; }
.verdetto { margin:0; font-size:.9rem; font-weight:600; }
.v-no, .assente { color:var(--allarme); }
.fonti { padding-left:1.4rem; }
.fonti li { margin-bottom:12px; }
.url { word-break:break-all; }
footer { margin-top:44px; color:var(--tenue); font-size:.8rem; border-top:1px solid var(--bordo); padding-top:12px; }
</style></head>
<body><main>
<h1>${escapeHtml(domanda)}</h1>
<p class="meta">Stato: ${escapeHtml(ricerca.stato ?? 'ignoto')}${ricerca.modello ? ` · modello: ${escapeHtml(ricerca.modello)}` : ''}${letteAlle(ricerca) ? ` · ${escapeHtml(soloLaData(letteAlle(ricerca)))}` : ''}</p>
${corpo.join('\n')}
<footer>TALOS · ricerca approfondita</footer>
</main></body></html>
`
}

/**
 * Lo spec del PDF, nel tono chiesto — o il ripiego onesto quando il record non c'è.
 *
 * ⛔ Il ripiego NON inventa un tono: senza affermazioni i tre toni collassano sullo stesso
 *   documento (lo dice già `talosResearchPdfSpec`), perché non c'è niente da cui differire. Ciò
 *   che si aggiunge è la riga che dice **perché** è così.
 */
function specPdf(ricerca, record, tono) {
    const opzioni = {
        date: soloLaData(letteAlle(ricerca)) || undefined,
        title: ricerca.titolo && ricerca.titolo !== ricerca.domanda ? ricerca.titolo : null,
    }
    if (record) return talosResearchPdfSpec(record, tono, opzioni)

    const sintetico = {
        version: 1,
        question: ricerca.domanda ?? 'Ricerca approfondita',
        summary: senzaIlRecinto(prosaDisponibile(ricerca) ?? ''),
        judge: null,
        claims: [],
        sources: [],
    }
    const spec = talosResearchPdfSpec(sintetico, tono, opzioni)
    return { ...spec, blocks: [spec.blocks[0], { t: 'note', x: DICITURA_SENZA_VERIFICHE }, ...spec.blocks.slice(1)] }
}

/* ─────────────────────────────────────── la porta sola ──────────────────────────────────── */

/**
 * Il contenuto di un'esportazione, nel formato chiesto.
 *
 * @param {{ricerca:object, formato:string, tono?:string}} richiesta
 * @param {{generaDocumentoFn?:Function}} [deps] — iniettabile SOLO per non caricare pdfmake in
 *   un test che non guarda il PDF. Il valore vero è `generateTalosDocument`, il generatore di
 *   `document_create`: un secondo generatore vorrebbe dire due `.docx` diversi dallo stesso TALOS.
 * @returns {Promise<{formato:string, nomeFile:string, mediaType:string, bytes:Uint8Array}>}
 */
export async function costruisciEsportazione({ ricerca, formato, tono }, deps = {}) {
    const forma = FORMATI[formato]
    if (!forma) {
        throw new EsportazioneRicercaError(
            `unknown export format "${formato}" — expected one of: ${FORMATI_ESPORTAZIONE.join(', ')}`,
            'RESEARCH_INVALID',
        )
    }
    const tonoScelto = tono ?? TONO_ESPORTAZIONE_PREDEFINITO
    if (!TONI_ESPORTAZIONE.includes(tonoScelto)) {
        throw new EsportazioneRicercaError(
            `unknown pdf tone "${tonoScelto}" — expected one of: ${TONI_ESPORTAZIONE.join(', ')}`,
            'RESEARCH_INVALID',
        )
    }
    /* ⛔ Il tono si dichiara solo dove significa qualcosa. Accettarlo in silenzio su un `.bib`
       lascerebbe credere che esistano tre bibliografie diverse. */
    if (tono !== undefined && formato !== 'pdf') {
        throw new EsportazioneRicercaError(`the "tono" parameter belongs to format=pdf, not to "${formato}"`, 'RESEARCH_INVALID')
    }

    const record = recordDellaScheda(ricerca)
    if (forma.vuoleIlRecord && !record) {
        throw new EsportazioneRicercaError(
            `this research has no verifiable record: "${formato}" is built from claims, passages and sources, and there are none`
            + (prosaDisponibile(ricerca) ? ' — what it deposited can still be exported as md, html or pdf' : ''),
            'RESEARCH_CONFLICT',
        )
    }

    const nomeFile = nomeSicuroDiEsportazione(ricerca.domanda, formato)
    const comune = { formato, nomeFile, mediaType: forma.mediaType }

    if (formato === 'md' || formato === 'html' || formato === 'pdf' || formato === 'docx') {
        /* ⛔ Un `md`/`html`/`pdf` senza NIENTE (una ricerca ancora in corso, o fallita prima di
           depositare) non è un file vuoto: è una richiesta che non si può soddisfare. Un PDF di
           sole intestazioni consegnato in silenzio è una bugia più cara di un 409. */
        if (!record && !prosaDisponibile(ricerca)) {
            throw new EsportazioneRicercaError(
                'this research has not produced anything yet: there is no report and no deposited text to export',
                'RESEARCH_CONFLICT',
            )
        }
    }

    switch (formato) {
        case 'md':
            return { ...comune, bytes: CODIFICA.encode(testoMarkdown(ricerca, record)) }
        case 'json':
            return { ...comune, bytes: CODIFICA.encode(testoJson(ricerca, record)) }
        case 'bib':
            return { ...comune, bytes: CODIFICA.encode(`${talosResearchBibtex(citazioniDaRecord(record, letteAlle(ricerca)))}\n`) }
        case 'ris':
            return { ...comune, bytes: CODIFICA.encode(`${talosResearchRis(citazioniDaRecord(record, letteAlle(ricerca)))}\n`) }
        case 'fonti':
            return { ...comune, bytes: CODIFICA.encode(testoFonti(ricerca, record)) }
        case 'html':
            return { ...comune, bytes: CODIFICA.encode(testoHtml(ricerca, record)) }
        case 'pdf': {
            const genera = deps.generaDocumentoFn ?? (await import('../document-generator.mjs')).generateTalosDocument
            const documento = await genera({
                format: 'pdf',
                title: ricerca.domanda ?? 'Ricerca approfondita',
                report: specPdf(ricerca, record, tonoScelto),
            })
            // ⛔ Il nome lo decide QUESTO modulo, non il generatore: la sua politica è quella dei
            //   file del workspace, e qui il nome è parte del contratto della rotta.
            return { ...comune, bytes: documento.bytes }
        }
        case 'docx': {
            const genera = deps.generaDocumentoFn ?? (await import('../document-generator.mjs')).generateTalosDocument
            const prosa = senzaIlRecinto(prosaDisponibile(ricerca) ?? '')
            const documento = await genera({
                format: 'docx',
                title: ricerca.domanda ?? 'Ricerca approfondita',
                body: record ? prosa : `${DICITURA_SENZA_VERIFICHE}\n\n${prosa}`,
            })
            return { ...comune, bytes: documento.bytes }
        }
        /* c8 ignore next 2 — irraggiungibile: l'allowlist in cima ha già respinto ogni altro. */
        default:
            throw new EsportazioneRicercaError(`unknown export format: ${formato}`, 'RESEARCH_INVALID')
    }
}
