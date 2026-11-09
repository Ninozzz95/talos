/*
 * Centro assistenza (owner 01/11/2026, «Leggera, dalle pagine del sito»): costruisce l'indice dell'aiuto di TALOS dalle pagine del
 * sito ufficiale (talos-code.com/docs, repo talos-website), così l'app porta con sé la guida della SUA versione e risponde anche
 * senza rete. Decisioni e condizioni delle sessioni: handoff `in-corso/RICERCA-CENTRO-ASSISTENZA-2026-11-01.md`.
 *
 * Perché dalle pagine COSTRUITE (dist/) e non dai sorgenti MDX: 308 blocchi `<ApiOp>`, `<Tools />`, `<Settings />`… generano il
 * testo da dati del sito; dai sorgenti si perderebbe proprio la parte di riferimento. Dai sorgenti si prendono solo le intestazioni
 * (`product`, `checkedOn`, `title`, `description`), che nella pagina costruita non ci sono in forma leggibile.
 *
 * Condizioni accolte:
 *   - Performance: sezioni di circa 3.000 caratteri (mai un documento intero), l'indice si legge alla prima chiamata.
 *   - CLI e Mobile: `product` della pagina = la superficie (desktop/cli/android/all); `checkedOn` per prodotto; `lingua` per sezione.
 * Funzioni pure, senza disco: lo script `scripts/costruisci-aiuto.mjs` legge i file e scrive `aiuto/index.json`.
 */

export const VERSIONE_INDICE_AIUTO = 1
export const SEZIONE_MASSIMA = 3000

const PRODOTTI = new Set(['desktop', 'cli', 'android', 'all'])

/* Le intestazioni del sito sono YAML semplice: si leggono le quattro chiavi che servono, senza un parser YAML in più nel server. */
export function leggiIntestazione(mdx) {
    const testo = String(mdx ?? '').replace(/^﻿/u, '')
    const m = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(testo)
    if (!m) return { titolo: '', descrizione: '', prodotto: 'all', controllataSu: {} }
    const righe = m[1].split(/\r?\n/u)
    const valore = (chiave) => {
        const riga = righe.find((r) => r.startsWith(`${chiave}:`))
        if (!riga) return ''
        return togliVirgolette(riga.slice(chiave.length + 1).trim())
    }
    const prodotto = valore('product')
    const controllataSu = {}
    const grezzo = valore('checkedOn')
    for (const [, chiave, versione] of grezzo.matchAll(/(desktop|cli|android)\s*:\s*['"]?([0-9][0-9A-Za-z.+-]*)['"]?/gu)) {
        controllataSu[chiave] = versione
    }
    return {
        titolo: valore('title'),
        descrizione: valore('description'),
        prodotto: PRODOTTI.has(prodotto) ? prodotto : 'all',
        controllataSu,
    }
}

function togliVirgolette(s) {
    if (s.length >= 2 && ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"')))) {
        const dentro = s.slice(1, -1)
        return s.startsWith("'") ? dentro.replace(/''/gu, "'") : dentro.replace(/\\"/gu, '"')
    }
    return s
}

/* Il contenuto della pagina costruita: il `div.sl-markdown-content` di Starlight, chiuso contando i `div` (non al primo `</div>`). */
export function contenutoDellaPagina(html) {
    const s = String(html ?? '')
    const inizio = s.indexOf('<div class="sl-markdown-content">')
    if (inizio === -1) return ''
    const re = /<div\b|<\/div>/gu
    re.lastIndex = inizio
    let profondita = 0
    for (let m = re.exec(s); m; m = re.exec(s)) {
        profondita += m[0] === '</div>' ? -1 : 1
        if (profondita === 0) return s.slice(inizio, m.index + m[0].length)
    }
    return s.slice(inizio)
}

const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', times: '×', rarr: '→', larr: '←' }
function decodifica(s) {
    return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/giu, (tutto, nome) => {
        if (nome[0] === '#') {
            const n = nome[1] === 'x' || nome[1] === 'X' ? Number.parseInt(nome.slice(2), 16) : Number.parseInt(nome.slice(1), 10)
            return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : tutto
        }
        return ENTITA[nome.toLowerCase()] ?? tutto
    })
}

/*
 * HTML di Starlight → testo leggibile dal modello: titoli `## `, elenchi `- `, tabelle a righe `a | b`, codice fra tre apici
 * inversi. Si tolgono icone, ancore e tutto ciò che il sito marca `data-pagefind-ignore` (è anche ciò che la ricerca del sito
 * ignora). Il testo dei collegamenti resta, l'indirizzo no: al modello serve la frase, non il percorso del sito.
 */
export function testoDaHtml(html) {
    let s = String(html ?? '')
    s = s.replace(/<(script|style|svg|button|link)\b[\s\S]*?<\/\1>/giu, '')
    s = s.replace(/<link\b[^>]*>/giu, '')
    s = s.replace(/<a class="sl-anchor-link"[\s\S]*?<\/a>/giu, '')
    s = s.replace(/<(span|div|p|footer|details)\b[^>]*data-pagefind-ignore[^>]*>[\s\S]*?<\/\1>/giu, '')
    // codice: ogni riga di Expressive Code è un `div.ec-line`. Messo da parte e rimesso alla fine: decodificato, `&lt;version&gt;`
    // diventerebbe un tag e lo toglierebbe il passo qui sotto.
    const codici = []
    s = s.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/giu, (_t, dentro) => {
        const righe = dentro.replace(/<div class="ec-line"[^>]*>/giu, '\n').replace(/<[^>]+>/gu, '')
        codici.push(decodifica(righe).replace(/^\n+|\n+$/gu, ''))
        return `\n\n\u0000${codici.length - 1}\u0000\n\n`
    })
    // fuori dal codice gli a capo dell'HTML non contano: la struttura la danno i tag
    s = s.replace(/\s*\n\s*/gu, ' ')
    s = s.replace(/<figcaption\b[\s\S]*?<\/figcaption>/giu, '')
    s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/giu, (_t, livello, dentro) => `\n\n${'#'.repeat(Math.max(2, Number(livello)))} ${dentro.replace(/<[^>]+>/gu, '').trim()}\n\n`)
    s = s.replace(/<li\b[^>]*>/giu, '\n- ')
    s = s.replace(/<\/(th|td)>\s*/giu, ' | ')
    s = s.replace(/<tr\b[^>]*>/giu, '\n')
    s = s.replace(/<br\s*\/?>/giu, '\n')
    s = s.replace(/<\/(p|ul|ol|table|blockquote|dl|figure)>/giu, '\n\n')
    s = s.replace(/<(dt|dd)\b[^>]*>/giu, '\n')
    s = s.replace(/<[^>]+>/gu, '')
    s = decodifica(s)
    s = s.split('\n').map((r) => r.replace(/[ \t ]+/gu, ' ').trim().replace(/ ?\|$/u, '')).join('\n')
    s = s.replace(/\n{3,}/gu, '\n\n').replace(/^(- .*)\n\n(?=- )/gmu, '$1\n')
    // il codice torna al suo posto, con le sue righe e i suoi spazi
    return s.replace(/\u0000(\d+)\u0000/gu, (_t, n) => `\`\`\`\n${codici[Number(n)]}\n\`\`\``).trim()
}

/*
 * Divide il testo nei titoli `## ` (e `### ` quando una sezione supera il tetto), poi taglia a paragrafo ciò che resta sopra il tetto.
 * Ogni sezione: `{id, titolo, testo}`; `id` è l'àncora del sito quando c'è, così «page#section» punta allo stesso posto del sito.
 */
export function dividiInSezioni(testo, { titoloPagina = '', massimo = SEZIONE_MASSIMA } = {}) {
    const blocchi = []
    let corrente = { titolo: titoloPagina || 'Overview', livello: 1, righe: [] }
    for (const riga of String(testo ?? '').split('\n')) {
        const m = /^(#{2,3}) (.+)$/u.exec(riga)
        if (m) {
            blocchi.push(corrente)
            corrente = { titolo: m[2].trim(), livello: m[1].length, righe: [] }
            continue
        }
        corrente.righe.push(riga)
    }
    blocchi.push(corrente)
    // i `###` si rifondono nel loro `##` finché la somma sta sotto il tetto
    const fusi = []
    for (const b of blocchi) {
        const prec = fusi.at(-1)
        const testoB = b.righe.join('\n').trim()
        if (b.livello === 3 && prec && prec.livello <= 2 && prec.testo.length + testoB.length + b.titolo.length + 6 <= massimo) {
            prec.testo = `${prec.testo}\n\n### ${b.titolo}\n\n${testoB}`.trim()
            continue
        }
        fusi.push({ titolo: b.titolo, livello: b.livello, testo: testoB })
    }
    const sezioni = []
    const usati = new Map()
    for (const f of fusi) {
        if (!f.testo && f.livello === 1) continue
        const pezzi = tagliaAParagrafo(f.testo, massimo)
        pezzi.forEach((pezzo, i) => {
            const base = ancora(f.titolo) || 'section'
            const numero = (usati.get(base) ?? 0) + 1
            usati.set(base, numero)
            sezioni.push({
                id: numero === 1 ? base : `${base}-${numero}`,
                titolo: pezzi.length > 1 ? `${f.titolo} (${i + 1}/${pezzi.length})` : f.titolo,
                testo: pezzo,
            })
        })
    }
    return sezioni
}

function tagliaAParagrafo(testo, massimo) {
    if (testo.length <= massimo) return [testo]
    const pezzi = []
    let corrente = ''
    for (const paragrafo of testo.split(/\n\n/u)) {
        if (corrente && corrente.length + paragrafo.length + 2 > massimo) { pezzi.push(corrente); corrente = '' }
        if (paragrafo.length > massimo) {
            for (let i = 0; i < paragrafo.length; i += massimo) pezzi.push(paragrafo.slice(i, i + massimo))
            continue
        }
        corrente = corrente ? `${corrente}\n\n${paragrafo}` : paragrafo
    }
    if (corrente) pezzi.push(corrente)
    return pezzi
}

/* Come le àncore di Starlight (github-slugger): minuscole, spazi in trattini, via la punteggiatura. */
export function ancora(titolo) {
    return String(titolo ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/gu, '')
        .replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/gu, '-')
}

/*
 * Una pagina: dal sorgente le intestazioni, dalla pagina costruita il testo. `percorso` è quello del sito senza `/docs/`
 * (es. `desktop/guides/automations`), e vale come nome della pagina per `talos_help({page})`.
 */
export function paginaDellIndice({ percorso, mdx, html, lingua = 'en' }) {
    const intestazione = leggiIntestazione(mdx)
    const testo = testoDaHtml(contenutoDellaPagina(html))
    return {
        percorso,
        titolo: intestazione.titolo,
        descrizione: intestazione.descrizione,
        prodotto: intestazione.prodotto,
        controllataSu: intestazione.controllataSu,
        lingua,
        sezioni: dividiInSezioni(testo, { titoloPagina: intestazione.titolo }),
    }
}
