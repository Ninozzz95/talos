import assert from 'node:assert/strict'
import test from 'node:test'

import {
    analizzaInline,
    analizzaMarkdown,
    escapeHtml,
    hrefSicuro,
    inlineInTestoSemplice,
    markdownInBlocchiReport,
    markdownInHtml,
    markdownInTestoSemplice,
    runsDiMarkdown,
} from '../../src/research/markdown-server.mjs'

/*
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⛔⛔⛔ 12/09/2026 — IL MARKDOWN DEL RAPPORTO SI RENDE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Il difetto che questi test presidiano l'ha trovato una FOTO, non un test: l'esportazione HTML
 * di una ricerca vera mostrava `# Agentic Desktop Harness…`, `## Executive Summary` e
 * `**Key Components:**` LETTERALI, con ogni elenco schiacciato in un paragrafo. I file erano
 * integri e rileggibili — «integro ≠ bello» — e nessuno li aveva guardati.
 *
 * ⛔ Il test che conta di più è quello che NEGA: un `#` o un `**` che sopravvive nell'uscita è
 *   rosso. Un test che si limita a cercare `<h1>` passerebbe anche su una pagina che mostra
 *   ENTRAMBI.
 */

const RAPPORTO = `# Agentic Desktop Harness Evolution

## Executive Summary

This report investigates **agent-based** harnesses and \`computer control\`.

### Market Growth
- Current market size: $7.8B
- Projected by 2030: $52B (566% growth)

**Key Components:**
1. Hierarchical multi-agent system
2. Two-tier hierarchy: HostAgent + AppAgents

> Una citazione che deve uscire come tale.

| Harness | Quota | Nota |
|---|---:|:---:|
| TALOS | 12% | sale |
| Hermes | 30% |

---

Vedi [la fonte](https://esempio.invalid/x).

\`\`\`js
const x = 1;
\`\`\``

/* ───────────────────────────── 1. IL VERSO CHE DEVE FUNZIONARE ───────────────────────────── */

test('⭐⭐⭐⭐ i blocchi si riconoscono tutti, e nell\'ordine in cui stanno nel testo', () => {
    assert.deepEqual(
        analizzaMarkdown(RAPPORTO).map((b) => (b.t === 'h' ? `h${b.lvl}` : b.t)),
        ['h1', 'h2', 'p', 'h3', 'lista', 'p', 'lista', 'citazione', 'tabella', 'riga', 'p', 'codice'],
    )
})

test('⭐⭐⭐⭐ l\'HTML porta i tag veri: titoli, elenchi dei due tipi, citazione, tabella, codice, link', () => {
    const html = markdownInHtml(RAPPORTO, { livelloMinimo: 2 })
    assert.match(html, /<h2>Agentic Desktop Harness Evolution<\/h2>/)
    assert.match(html, /<h3>Executive Summary<\/h3>/)
    assert.match(html, /<strong>agent-based<\/strong>/)
    assert.match(html, /<code>computer control<\/code>/)
    assert.match(html, /<ul><li>Current market size: \$7\.8B<\/li>/, 'l\'elenco puntato è un elenco')
    assert.match(html, /<ol><li>Hierarchical multi-agent system<\/li>/, 'e quello numerato pure')
    assert.match(html, /<blockquote>Una citazione che deve uscire come tale\.<\/blockquote>/)
    assert.match(html, /<table>/)
    assert.match(html, /<hr>/)
    assert.match(html, /<a href="https:\/\/esempio\.invalid\/x" rel="noopener noreferrer">la fonte<\/a>/)
    assert.match(html, /<pre><code class="language-js">const x = 1;<\/code><\/pre>/)
})

test('⛔⛔⛔ AL CONTRARIO — nell\'HTML non sopravvive NESSUN marcatore: è il difetto della foto', () => {
    /*
     * ⛔ Questo è il test che morde. Cercare `<h2>` non basta: una pagina che mostra sia `<h2>`
     *   sia `## Executive Summary` passerebbe, ed è esattamente quello che usciva.
     */
    const html = markdownInHtml(RAPPORTO, { livelloMinimo: 2 })
    // ⛔ Il recinto è l'unico posto dove un marcatore può legittimamente restare (è codice):
    //   si guarda tutto il resto.
    const fuoriDalCodice = html.replace(/<pre>[\s\S]*?<\/pre>/g, '')
    assert.doesNotMatch(fuoriDalCodice, /(^|>|\s)#{1,6}\s/, '⛔ nessun cancelletto di titolo a schermo')
    assert.doesNotMatch(fuoriDalCodice, /\*\*/, '⛔ nessun doppio asterisco a schermo')
    assert.doesNotMatch(fuoriDalCodice, /^\s*[-*+]\s/m, '⛔ nessun trattino di elenco a schermo')
    assert.doesNotMatch(fuoriDalCodice, /\|\s*---/, '⛔ nessuna riga delimitatrice di tabella a schermo')
    assert.doesNotMatch(fuoriDalCodice, /(^|>|\s)&gt;\s\w/, '⛔ nessun maggiore di citazione a schermo')
})

test('⭐⭐ il testo semplice (il DOCX) non porta marcatori, e gli elenchi hanno un punto vero', () => {
    const testo = markdownInTestoSemplice(RAPPORTO)
    assert.doesNotMatch(testo, /^#{1,6}\s/m, '⛔ era `## Executive Summary` dentro un file di Word')
    assert.doesNotMatch(testo, /\*\*/)
    assert.match(testo, /^Executive Summary$/m)
    assert.match(testo, /^• Current market size: \$7\.8B$/m)
    assert.match(testo, /^1\. Hierarchical multi-agent system$/m)
    assert.match(testo, /« Una citazione che deve uscire come tale\. »/)
    assert.match(testo, /Harness · Quota · Nota/)
})

test('⭐⭐⭐ i blocchi per il PDF sono quelli che `document-report.mjs` sa impaginare', () => {
    const blocchi = markdownInBlocchiReport(RAPPORTO, { livelloMinimo: 2 })
    assert.deepEqual(
        [...new Set(blocchi.map((b) => b.t))].sort(),
        ['h', 'list', 'note', 'p', 'spacer', 'table'],
        '⛔ solo i tipi che quello schema conosce: un `t` inventato sparirebbe in silenzio',
    )
    const titolo = blocchi.find((b) => b.t === 'h')
    assert.equal(titolo.x, 'Agentic Desktop Harness Evolution')
    assert.ok(titolo.lvl >= 1 && titolo.lvl <= 3, '⛔ `document-report.mjs` veste h1-h3: oltre non c\'è stile')
    const elenco = blocchi.find((b) => b.t === 'list' && b.ordered === true)
    assert.ok(elenco, 'l\'elenco numerato resta numerato')
    const tabella = blocchi.find((b) => b.t === 'table')
    assert.deepEqual(tabella.align, ['l', 'r', 'c'])
    assert.equal(JSON.stringify(blocchi).includes('## '), false, '⛔ e nessun marcatore nei blocchi')
})

test('⭐⭐⭐ il grassetto arriva nel PDF come RUN di pdfmake, senza toccare `document-report.mjs`', () => {
    /*
     * ⛔ `renderBlock` passa `block.x` a pdfmake così com'è, e pdfmake accetta `text: [...]` con
     *   `bold`/`italics`/`link` per run. È il motivo per cui il grassetto si può avere senza
     *   cambiare il costruttore CONDIVISO di `document_create`.
     */
    assert.deepEqual(runsDiMarkdown('un **forte** e un *tenue*'), [
        { text: 'un ' }, { text: 'forte', bold: true },
        { text: ' e un ' }, { text: 'tenue', italics: true },
    ])
    assert.deepEqual(runsDiMarkdown('[qui](https://esempio.invalid/y)'), [{ text: 'qui', link: 'https://esempio.invalid/y' }])
    assert.equal(runsDiMarkdown('solo testo'), 'solo testo', 'un pezzo senza stile resta una stringa')
    assert.equal(runsDiMarkdown(''), '', '⛔ una cella vuota è `\'\'`, non `[]`: `row[index] ?? \'\'` non salverebbe un array')
})

/* ─────────────────────────── 2. IL VERSO CONTRARIO — LA SICUREZZA ─────────────────────────── */

test('⛔⛔⛔ AL CONTRARIO — un `<script>` nel Markdown resta TESTO, in tutte e tre le uscite', () => {
    /*
     * Il testo che passa di qui viene dal modello e dalle pagine del web, e questo file si apre
     * con `file://` da un browser vero. OWASP: entità per `& < > " '`.
     */
    const ostile = 'Un <script>alert(1)</script> e un <img src=x onerror=alert(2)> e "virgolette" e \'apici\'.'
    const html = markdownInHtml(ostile)
    assert.doesNotMatch(html, /<script/, '⛔ nessun tag script vivo')
    assert.doesNotMatch(html, /<img/, '⛔ né un img con onerror')
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'si legge, ma è testo')
    assert.match(html, /&quot;virgolette&quot;/)
    assert.match(html, /&#x27;apici&#x27;/)
    assert.equal(escapeHtml('<&>"\''), '&lt;&amp;&gt;&quot;&#x27;')
})

test('⛔⛔⛔ AL CONTRARIO — un `<script>` DENTRO un recinto di codice resta testo anche lì', () => {
    const html = markdownInHtml('```html\n<script>alert(1)</script>\n```')
    assert.doesNotMatch(html, /<script>alert/, '⛔ un recinto non è un permesso di eseguire')
    assert.match(html, /&lt;script&gt;/)
})

test('⛔⛔⛔ AL CONTRARIO — `javascript:` non diventa mai un href: il testo resta, l\'indirizzo no', () => {
    /* OWASP: «Allow-list http and HTTPS URLs only», «never place untrusted data into javascript:». */
    for (const cattivo of ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox', 'file:///C:/Windows', '/relativo', 'JaVaScRiPt:alert(1)']) {
        assert.equal(hrefSicuro(cattivo), null, cattivo)
        const html = markdownInHtml(`[clicca](${cattivo})`)
        assert.doesNotMatch(html, /<a /, `${cattivo} non deve produrre un link`)
        assert.match(html, /clicca/, 'ma il testo resta leggibile: niente sparisce in silenzio')
    }
    // ⛔ E uno schema spezzato da un carattere di controllo non deve passare il controllo dell'inizio.
    assert.equal(hrefSicuro('java\nscript:alert(1)'), null)
    assert.equal(hrefSicuro('  https://esempio.invalid/x  '), 'https://esempio.invalid/x', 'il verso buono')
    assert.equal(hrefSicuro('mailto:qualcuno@esempio.invalid'), 'mailto:qualcuno@esempio.invalid')
})

test('⛔⛔ AL CONTRARIO — un href non passa nemmeno nei RUN del PDF', () => {
    assert.deepEqual(runsDiMarkdown('[clicca](javascript:alert(1))'), [{ text: 'clicca' }, { text: ')' }])
})

/* ─────────────────────── 3. I CASI LIMITE CHE LA SPEC GFM NOMINA ─────────────────────── */

test('⛔⛔ TABELLE — le tre regole di GFM sono tre comportamenti DIVERSI', () => {
    /*
     * «The header row must match the delimiter row in the number of cells. If not, a table will
     * not be recognized»; per le righe di dati «if there are fewer … empty cells are inserted. If
     * there are greater, the excess is ignored». Senza la spec ne avrei scritto uno solo.
     */
    const conteggioSbagliato = analizzaMarkdown('| a | b | c |\n|---|---|\n| 1 | 2 |')
    assert.equal(conteggioSbagliato.some((b) => b.t === 'tabella'), false, '⛔ intestazione e delimitatore discordi: NON è una tabella')

    const tabella = analizzaMarkdown('| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |').find((b) => b.t === 'tabella')
    assert.deepEqual(tabella.righe[0], ['1', ''], '⛔ meno celle ⇒ si riempie')
    assert.deepEqual(tabella.righe[1], ['1', '2'], '⛔ più celle ⇒ l\'eccesso si butta')

    const conBarra = analizzaMarkdown('| a | b |\n|---|---|\n| uno \\| due | tre |').find((b) => b.t === 'tabella')
    assert.deepEqual(conBarra.righe[0], ['uno | due', 'tre'], '⛔ una barra sfuggita è contenuto, non un separatore')
})

test('⛔ un recinto MAI CHIUSO arriva fino alla fine, e non annulla il blocco', () => {
    const blocchi = analizzaMarkdown('testo\n\n```js\nconst a = 1;\nconst b = 2;')
    assert.equal(blocchi.at(-1).t, 'codice')
    assert.equal(blocchi.at(-1).x, 'const a = 1;\nconst b = 2;')
})

test('⛔ `snake_case` non è corsivo, e un `**` senza chiusura resta testo', () => {
    // Senza la guardia, ogni nome di variabile in un rapporto tecnico diventerebbe obliquo a metà.
    assert.equal(markdownInHtml('la chiave reportLibraryId e il campo has_record qui'), '<p>la chiave reportLibraryId e il campo has_record qui</p>')
    assert.equal(inlineInTestoSemplice('un **aperto e mai chiuso'), 'un **aperto e mai chiuso')
})

test('⛔ un titolo senza testo, un elenco vuoto e una stringa vuota non lanciano', () => {
    assert.deepEqual(analizzaMarkdown('#'), [{ t: 'h', lvl: 1, x: '' }])
    assert.deepEqual(analizzaMarkdown(''), [])
    assert.deepEqual(analizzaMarkdown(null), [])
    assert.equal(markdownInHtml(undefined), '')
    assert.deepEqual(markdownInBlocchiReport(''), [])
    assert.deepEqual(analizzaInline(''), [])
})

test('⭐ il livello dei titoli si abbassa: la pagina ha già il SUO `<h1>`', () => {
    // Due `<h1>` in una pagina sono due titoli, cioè nessuno.
    assert.match(markdownInHtml('# uno', { livelloMinimo: 2 }), /<h2>uno<\/h2>/)
    assert.match(markdownInHtml('###### sei', { livelloMinimo: 2 }), /<h6>sei<\/h6>/, 'e non si scende sotto h6')
})
