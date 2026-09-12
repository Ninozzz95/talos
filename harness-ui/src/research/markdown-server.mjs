/*
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔⛔⛔ 12/09/2026 — IL MARKDOWN DEL RAPPORTO VA **RESO**, NON STAMPATO
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Il difetto, visto in una FOTO dell'esportazione HTML di una ricerca vera (L8, 4174):
 *
 *     # Agentic Desktop Harness Evolution…
 *     ## Executive Summary
 *     ### Market Growth Trajectory - Current market size: $7.8B - Projected market size…
 *     **Key Components:** - Hierarchical multi-agent system - Two-tier agent hierarchy…
 *
 * Cioè: i cancelletti e gli asterischi **letterali** a schermo, e ogni elenco schiacciato dentro
 * un paragrafo solo. La causa era una riga sola in `esportazioni.mjs`: la prosa veniva spezzata
 * sulle righe vuote (`split(/\n{2,}/)`) e ogni pezzo infilato in un `<p>` dopo `escapeHtml`. Per
 * un elenco — che è separato da UN a capo, non da due — quello vuol dire un muro di testo.
 *
 * ⛔ È il difetto «integro ≠ bello» che il rapporto di ieri aveva dichiarato in «cosa NON ho
 *   verificato»: i file erano rileggibili, e nessuno li aveva **guardati**.
 *
 * ── Perché un renderer nuovo, e non uno che c'era già ───────────────────────────────────────
 * Cercato PRIMA nel proprio codebase (lezione 06/09, «chi guarda da fuori inventa quello che
 * dentro aveva già»), e trovati due mezzi renderer, nessuno dei quali serve qui:
 *
 *   · `frontend/src/components/markdown.js` (BC-29, 12/09) — è IL renderer di TALOS e copre le
 *     stesse cose che copre questo. ⛔ Ma costruisce **nodi DOM** (`doc.createElement`,
 *     `createTextNode`) apposta, perché la sua regola è «MAI innerHTML con testo non fidato».
 *     Qui non c'è un DOM: serve una **stringa** HTML da mettere in un file. Importarlo vorrebbe
 *     dire portarsi dietro un DOM finto sul server, e comunque non è roba mia (`frontend/`).
 *   · `document-generator.mjs`, `specToReport` — converte `body` in blocchi per il PDF, ma solo
 *     titoli `#`/`##`/`###`, elenchi `-`/`*` e paragrafi: niente grassetto, corsivo, codice,
 *     citazioni, elenchi numerati, tabelle o link. È il motivo per cui anche il PDF usciva con
 *     `**Key Components:**` dentro.
 *
 * ⇒ Un parser **solo**, qui, con TRE uscite: HTML (stringa), blocchi per `document-report.mjs`
 *   (il PDF), testo semplice. Anche il DOCX legge questi blocchi. Parser separati darebbero
 *   rese diverse dello stesso rapporto, cioè documenti che si contraddicono.
 * ⛔ Zero dipendenze nuove: `package.json` non ha un motore Markdown e non ne prende uno per
 *   questo.
 * ⛔ **NON è un motore CommonMark**, e non deve diventarlo — stessa dichiarazione del renderer
 *   del frontend. Sono «le basi», quelle che un rapporto di ricerca usa davvero.
 *
 * ── Ricerca web PRIMA di scrivere (fonte + data) ────────────────────────────────────────────
 *  · **GitHub Flavored Markdown Spec** — <https://github.github.com/gfm/>, letta il 12/09/2026.
 *    Da lì vengono le regole scritte nel codice, alla lettera:
 *      - titolo ATX: «between an opening sequence of 1–6 unescaped # characters», con 0-3 spazi
 *        di rientro e uno spazio (o fine riga) dopo i cancelletti;
 *      - recinto: «a sequence of at least three consecutive backtick characters (`) or tildes»,
 *        e «if the end of the containing block is reached and no closing code fence has been
 *        found, the code block contains all of the lines after the opening code fence»;
 *      - citazione: «0-3 spaces of initial indent, plus (a) the character > together with a
 *        following space, or (b) a single character > not followed by a space»;
 *      - elenco numerato: «a sequence of 1–9 arabic digits, followed by either a . or a )»;
 *      - separatore: «three or more matching -, _, or * characters»;
 *      - ⛔ **TABELLE, e sono i due vincoli che non conoscevo**: «the header row must match the
 *        delimiter row in the number of cells. **If not, a table will not be recognized**» — e
 *        per le righe di dati «if there are a number of cells fewer than the number of cells in
 *        the header row, **empty cells are inserted**. If there are greater, **the excess is
 *        ignored**». Sono tre comportamenti diversi per tre casi che a occhio sembrano lo stesso,
 *        e senza la spec ne avrei scritto uno solo.
 *  · **OWASP, XSS Prevention Cheat Sheet** —
 *    <https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html>,
 *    letto il 12/09/2026. Contenuto di un elemento: entità per `& < > " '`. Attributi: sempre fra
 *    virgolette. ⛔ E il vincolo sugli indirizzi, che ha prodotto `hrefSicuro`: «Allow-list http
 *    and HTTPS URLs only (Avoid the JavaScript Protocol to Open a new Window)» e «never place
 *    untrusted data into javascript: protocol handlers». Il testo che passa di qui viene dal
 *    modello e dalle pagine del web: un `[clicca](javascript:…)` dentro un rapporto è una cosa
 *    che si può scrivere.
 */

/* ─────────────────────────────── il modello dei blocchi ─────────────────────────────── */

/**
 * @typedef {{t:'h', lvl:number, x:string}
 *   | {t:'p', x:string}
 *   | {t:'lista', ordinata:boolean, inizio?:number, voci:Array<string|{x:string, figli:BloccoMarkdown[]}>}
 *   | {t:'citazione', x:string}
 *   | {t:'codice', lingua:string|null, x:string}
 *   | {t:'riga'}
 *   | {t:'tabella', intestazione:string[], allineamenti:Array<'l'|'c'|'r'>, righe:string[][]}
 * } BloccoMarkdown
 *
 * ⛔ `x` e le celle restano **Markdown in linea GREZZO**: l'inline si risolve negli emettitori,
 *   perché HTML e PDF lo rendono in due modi diversi (tag contro run di pdfmake) e risolverlo qui
 *   costringerebbe uno dei due a disfare il lavoro dell'altro.
 */

const RE_TITOLO = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const RE_RECINTO = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)\s*$/;
const RE_CITAZIONE = /^ {0,3}>(?: ?)(.*)$/;
const RE_PUNTO = /^ {0,3}([-+*])(?:\s+(.*))?$/;
const RE_SEPARATORE = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})$/;
const RE_DELIMITATORE_TABELLA = /^ {0,3}\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/;

// BC35, CommonMark 0.31.2 §5.2; docx 9.5.1 ammette livelli 0–8.
// Oltre il limite il testo resta nella voce più profonda, senza ulteriore ricorsione.
export const PROFONDITA_MASSIMA_ELENCHI = 9;

function colonneRientro(spazi, colonna = 0) {
    for (const c of spazi) colonna += c === '\t' ? 4 - colonna % 4 : 1;
    return colonna;
}

function marcatoreElenco(riga) {
    const m = /^([ \t]*)([-+*]|(\d{1,9})[.)])(?:([ \t]+)(.*)|$)/.exec(riga);
    if (!m) return null;
    const rientro = colonneRientro(m[1]);
    const fine = rientro + m[2].length;
    const spazi = colonneRientro(m[4] ?? '', fine) - fine;
    return {
        rientro, contenuto: fine + (spazi >= 1 && spazi <= 4 && m[5] ? spazi : 1),
        ordinata: m[3] !== undefined, numero: Number(m[3] ?? 1),
        tipo: m[3] === undefined ? m[2] : m[2].at(-1), x: m[5] ?? '',
    };
}

/** Estende le sole liste: le voci senza figli mantengono la precedente forma stringa. */
function analizzaElenco(righe, inizio, base = 0, profondita = 0) {
    const primo = marcatoreElenco(righe[inizio]);
    const lista = { t: 'lista', ordinata: primo.ordinata, voci: [primo.x] };
    // Compatibilità storica: i numeri iniziali delle liste piatte restano normalizzati a 1.
    if (profondita > 0 && primo.ordinata && primo.numero !== 1) lista.inizio = primo.numero;
    let corrente = primo;
    let i = inizio + 1;
    const voceConFigli = () => {
        if (typeof lista.voci.at(-1) === 'string') lista.voci[lista.voci.length - 1] = { x: lista.voci.at(-1), figli: [] };
        return lista.voci.at(-1);
    };
    const continua = (testo) => {
        const voce = lista.voci.at(-1);
        if (typeof voce === 'string') lista.voci[lista.voci.length - 1] = `${voce} ${testo}`.trim();
        else if (voce.figli.at(-1)?.t === 'p') voce.figli.at(-1).x += ` ${testo}`;
        else voce.figli.push({ t: 'p', x: testo });
    };
    for (; i < righe.length;) {
        const riga = righe[i];
        if (!riga.trim()) {
            let j = i + 1;
            while (j < righe.length && !righe[j].trim()) j++;
            const prossimo = j < righe.length ? marcatoreElenco(righe[j]) : null;
            // Righe vuote interne ai figli: una lista piatta invece si separa come prima.
            if (prossimo && (prossimo.rientro >= corrente.contenuto
                || (profondita > 0 && prossimo.rientro >= base))) { i = j; continue; }
            break;
        }
        const altro = marcatoreElenco(riga);
        const rientro = colonneRientro(/^[ \t]*/.exec(riga)[0]);
        if (rientro < base) break;
        if (altro && altro.rientro >= corrente.contenuto) {
            if (profondita + 1 >= PROFONDITA_MASSIMA_ELENCHI) { continua(riga.trim()); i++; continue; }
            if (altro.rientro <= corrente.contenuto + 3) {
                const figlio = analizzaElenco(righe, i, corrente.contenuto, profondita + 1);
                voceConFigli().figli.push(figlio.lista);
                i = figlio.fine;
                continue;
            }
        }
        if (altro && altro.rientro <= base + 3) {
            if (altro.ordinata !== lista.ordinata || (profondita > 0 && altro.tipo !== primo.tipo)) break;
            lista.voci.push(altro.x);
            corrente = altro;
            i++;
            continue;
        }
        // Il testo meno rientrato del contenuto di un figlio appartiene alla voce padre.
        if (profondita > 0 && rientro < corrente.contenuto) break;
        if (RE_TITOLO.test(riga) || RE_RECINTO.test(riga)) break;
        continua(riga.trim());
        i++;
    }
    lista.voci = lista.voci.filter(v => v !== '');
    return { lista, fine: i };
}

/** Le celle di una riga di tabella. ⛔ Un `\|` è una barra DENTRO la cella, non un separatore. */
function celleDiRiga(riga) {
    const pulita = riga.trim().replace(/^\|/, '').replace(/\|$/, '');
    const celle = [];
    let corrente = '';
    for (let i = 0; i < pulita.length; i += 1) {
        if (pulita[i] === '\\' && pulita[i + 1] === '|') { corrente += '|'; i += 1; continue; }
        if (pulita[i] === '|') { celle.push(corrente.trim()); corrente = ''; continue; }
        corrente += pulita[i];
    }
    celle.push(corrente.trim());
    return celle;
}

function allineamentiDiDelimitatore(riga) {
    return celleDiRiga(riga).map((cella) => {
        const inizia = cella.startsWith(':');
        const finisce = cella.endsWith(':');
        if (inizia && finisce) return 'c';
        if (finisce) return 'r';
        return 'l';
    });
}

/**
 * Il testo in blocchi. PURA: nessun I/O, si prova con una stringa letterale.
 * @param {string} testo
 * @returns {BloccoMarkdown[]}
 */
export function analizzaMarkdown(testo) {
    const righe = String(testo ?? '').replace(/\r\n?/g, '\n').split('\n');
    const blocchi = [];
    let paragrafo = [];

    const chiudiParagrafo = () => {
        if (paragrafo.length === 0) return;
        blocchi.push({ t: 'p', x: paragrafo.join(' ').trim() });
        paragrafo = [];
    };

    for (let i = 0; i < righe.length; i += 1) {
        const riga = righe[i];

        if (riga.trim() === '') { chiudiParagrafo(); continue; }

        const recinto = RE_RECINTO.exec(riga);
        if (recinto) {
            chiudiParagrafo();
            const chiusura = recinto[1][0];
            const lunghezza = recinto[1].length;
            const dentro = [];
            let j = i + 1;
            for (; j < righe.length; j += 1) {
                const fine = new RegExp(`^ {0,3}${chiusura === '`' ? '`' : '~'}{${lunghezza},}\\s*$`).exec(righe[j]);
                if (fine) break;
                dentro.push(righe[j]);
            }
            // ⛔ GFM: un recinto mai chiuso arriva fino alla fine del documento, non annulla il blocco.
            blocchi.push({ t: 'codice', lingua: recinto[2] || null, x: dentro.join('\n') });
            i = j;
            continue;
        }

        if (RE_SEPARATORE.test(riga)) { chiudiParagrafo(); blocchi.push({ t: 'riga' }); continue; }

        const titolo = RE_TITOLO.exec(riga);
        if (titolo) {
            chiudiParagrafo();
            blocchi.push({ t: 'h', lvl: titolo[1].length, x: (titolo[2] ?? '').trim() });
            continue;
        }

        /*
         * ⛔ LA TABELLA si riconosce DUE righe alla volta, e non una: GFM dice che «the header row
         *   must match the delimiter row in the number of cells. If not, a table will not be
         *   recognized» ⇒ se i conti non tornano questa resta una riga di paragrafo qualunque,
         *   che è esattamente ciò che GitHub mostra.
         */
        if (riga.includes('|') && i + 1 < righe.length && RE_DELIMITATORE_TABELLA.test(righe[i + 1])) {
            const intestazione = celleDiRiga(riga);
            const allineamenti = allineamentiDiDelimitatore(righe[i + 1]);
            if (intestazione.length === allineamenti.length) {
                chiudiParagrafo();
                const corpo = [];
                let j = i + 2;
                for (; j < righe.length && righe[j].trim() !== '' && righe[j].includes('|'); j += 1) {
                    const celle = celleDiRiga(righe[j]);
                    // ⛔ Meno celle ⇒ si riempie; più celle ⇒ si butta l'eccesso. Sono le parole della spec.
                    corpo.push(Array.from({ length: intestazione.length }, (_v, k) => celle[k] ?? ''));
                }
                blocchi.push({ t: 'tabella', intestazione, allineamenti, righe: corpo });
                i = j - 1;
                continue;
            }
        }

        const citazione = RE_CITAZIONE.exec(riga);
        if (citazione) {
            chiudiParagrafo();
            const dentro = [citazione[1]];
            let j = i + 1;
            // Laziness (GFM): le righe di continuazione di un paragrafo citato possono non riportare il `>`.
            for (; j < righe.length && righe[j].trim() !== ''; j += 1) {
                const seguito = RE_CITAZIONE.exec(righe[j]);
                if (seguito) { dentro.push(seguito[1]); continue; }
                if (RE_TITOLO.test(righe[j]) || RE_PUNTO.test(righe[j]) || RE_RECINTO.test(righe[j])) break;
                dentro.push(righe[j]);
            }
            blocchi.push({ t: 'citazione', x: dentro.join(' ').trim() });
            i = j - 1;
            continue;
        }

        const marcatore = marcatoreElenco(riga);
        if (marcatore && marcatore.rientro <= 3) {
            chiudiParagrafo();
            const risultato = analizzaElenco(righe, i);
            blocchi.push(risultato.lista);
            i = risultato.fine - 1;
            continue;
        }

        paragrafo.push(riga.trim());
    }
    chiudiParagrafo();
    return blocchi;
}

/* ───────────────────────────────── il Markdown in linea ───────────────────────────────── */

/**
 * @typedef {{k:'testo'|'codice', v:string, forte?:boolean, corsivo?:boolean}
 *   | {k:'link', v:string, href:string, forte?:boolean, corsivo?:boolean}} Frammento
 */

/*
 * ⛔ L'ordine delle alternative NON è estetico: il codice in linea viene PRIMO, così un
 *   `` `**a**` `` resta due asterischi dentro il codice invece di diventare grassetto.
 * ⛔ `_` è ammesso solo fuori da una parola (`snake_case` non è corsivo): GFM lo dice, e senza la
 *   guardia ogni nome di variabile in un rapporto tecnico diventerebbe obliquo a metà.
 */
const RE_INLINE = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\[([^\]\n]*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)|\*\*(?=\S)([\s\S]*?\S)\*\*|(?<![\w])__(?=\S)([\s\S]*?\S)__(?![\w])|\*(?=\S)([^*\n]*?\S)\*|(?<![\w])_(?=\S)([^_\n]*?\S)_(?![\w])/;

/**
 * Il Markdown in linea in frammenti. PURA.
 * @param {string} testo
 * @param {{forte?:boolean, corsivo?:boolean}} [stile]
 * @returns {Frammento[]}
 */
export function analizzaInline(testo, stile = {}) {
    const frammenti = [];
    let resto = String(testo ?? '');

    for (;;) {
        const trovato = RE_INLINE.exec(resto);
        if (!trovato) break;
        if (trovato.index > 0) frammenti.push({ k: 'testo', v: resto.slice(0, trovato.index), ...stile });

        const [, , codice, testoLink, indirizzo, forteA, forteB, corsivoA, corsivoB] = trovato;
        if (codice !== undefined) {
            frammenti.push({ k: 'codice', v: codice.trim(), ...stile });
        } else if (testoLink !== undefined) {
            frammenti.push({ k: 'link', v: testoLink, href: indirizzo ?? '', ...stile });
        } else if (forteA !== undefined || forteB !== undefined) {
            frammenti.push(...analizzaInline(forteA ?? forteB, { ...stile, forte: true }));
        } else {
            frammenti.push(...analizzaInline(corsivoA ?? corsivoB, { ...stile, corsivo: true }));
        }
        resto = resto.slice(trovato.index + trovato[0].length);
    }
    if (resto !== '') frammenti.push({ k: 'testo', v: resto, ...stile });
    return frammenti;
}

/* ─────────────────────────────────── uscita 1: HTML ─────────────────────────────────── */

/** Le cinque entità di OWASP, e nessuna in meno. */
export function escapeHtml(valore) {
    return String(valore ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

/**
 * L'indirizzo di un link, o `null` se non è uno che si possa aprire.
 *
 * ⛔ Allowlist di TRE schemi, come chiede OWASP: «Allow-list http and HTTPS URLs only». Tutto il
 *   resto — `javascript:`, `data:`, `vbscript:`, e ogni schema inventato — non diventa un `href`:
 *   il testo del link resta a schermo, l'indirizzo no. Il testo che passa di qui viene dal modello
 *   e dalle pagine del web, e questo file finisce aperto con `file://` da un browser vero.
 * ⛔ Un indirizzo RELATIVO non passa: in un file scaricato non punterebbe a niente di sensato.
 */
export function hrefSicuro(indirizzo) {
    const pulito = String(indirizzo ?? '').trim();
    // ⛔ Niente caratteri di controllo né spazi DENTRO l'indirizzo: `java\nscript:` è il modo
    //   classico di far sopravvivere uno schema a un controllo che guarda solo l'inizio.
    if (/[\u0000-\u0020]/.test(pulito)) return null;
    if (!/^(https?:|mailto:)/i.test(pulito)) return null;
    return pulito;
}

function htmlDiFrammenti(frammenti) {
    return frammenti.map((frammento) => {
        let dentro = frammento.k === 'codice'
            ? `<code>${escapeHtml(frammento.v)}</code>`
            : escapeHtml(frammento.v);
        if (frammento.k === 'link') {
            const href = hrefSicuro(frammento.href);
            // ⛔ `rel="noopener noreferrer"`: il file si apre con `file://`, e una pagina esterna
            //   non deve poter toccare la finestra che l'ha aperta.
            dentro = href
                ? `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${dentro}</a>`
                : dentro;
        }
        if (frammento.corsivo) dentro = `<em>${dentro}</em>`;
        if (frammento.forte) dentro = `<strong>${dentro}</strong>`;
        return dentro;
    }).join('');
}

/**
 * Il Markdown in linea ridotto a testo nudo: i marcatori spariscono, il testo resta.
 * ⛔ Serve ai TITOLI del PDF: un titolo che porta dentro un grassetto e' rumore, ma un titolo che
 *   porta dentro `**` e' il difetto che stiamo togliendo.
 */
export function inlineInTestoSemplice(testo) {
    return analizzaInline(testo).map((frammento) => frammento.v).join('')
}

/** Il Markdown in linea reso in HTML, senza blocchi attorno. */
export function inlineInHtml(testo) {
    return htmlDiFrammenti(analizzaInline(testo));
}

function elencoInHtml(blocco) {
    const tag = blocco.ordinata ? 'ol' : 'ul';
    const inizio = blocco.inizio !== undefined ? ` start="${blocco.inizio}"` : '';
    return `<${tag}${inizio}>${blocco.voci.map(voce => {
        if (typeof voce === 'string') return `<li>${inlineInHtml(voce)}</li>`;
        const figli = voce.figli.map(b => b.t === 'lista' ? elencoInHtml(b) : `<p>${inlineInHtml(b.x)}</p>`).join('');
        return `<li>${inlineInHtml(voce.x)}${figli}</li>`;
    }).join('')}</${tag}>`;
}

/**
 * Il Markdown reso in HTML. ⛔ Ogni valore passa da `escapeHtml`: un `<script>` nel rapporto
 * resta testo a schermo, sempre.
 * @param {string} testo
 * @param {{livelloMinimo?:number}} [opzioni] — il livello del primo titolo (2 quando la pagina ha
 *   già il suo `<h1>`: due `<h1>` in una pagina sono due titoli, cioè nessuno).
 * @returns {string}
 */
export function markdownInHtml(testo, opzioni = {}) {
    const base = Number.isSafeInteger(opzioni.livelloMinimo) ? opzioni.livelloMinimo : 1;
    const fuori = [];
    for (const blocco of analizzaMarkdown(testo)) {
        switch (blocco.t) {
            case 'h': {
                const livello = Math.min(6, Math.max(1, blocco.lvl + base - 1));
                fuori.push(`<h${livello}>${inlineInHtml(blocco.x)}</h${livello}>`);
                break;
            }
            case 'p': fuori.push(`<p>${inlineInHtml(blocco.x)}</p>`); break;
            case 'citazione': fuori.push(`<blockquote>${inlineInHtml(blocco.x)}</blockquote>`); break;
            case 'riga': fuori.push('<hr>'); break;
            case 'codice': {
                const classe = blocco.lingua ? ` class="language-${escapeHtml(blocco.lingua)}"` : '';
                fuori.push(`<pre><code${classe}>${escapeHtml(blocco.x)}</code></pre>`);
                break;
            }
            case 'lista': {
                fuori.push(elencoInHtml(blocco));
                break;
            }
            case 'tabella': {
                const stile = (indice) => ` style="text-align:${{ l: 'left', c: 'center', r: 'right' }[blocco.allineamenti[indice] ?? 'l']}"`;
                const intestazione = blocco.intestazione.map((cella, i) => `<th${stile(i)}>${inlineInHtml(cella)}</th>`).join('');
                const corpo = blocco.righe
                    .map((riga) => `<tr>${riga.map((cella, i) => `<td${stile(i)}>${inlineInHtml(cella)}</td>`).join('')}</tr>`)
                    .join('');
                // ⛔ Avvolta: una tabella larga non deve far scorrere la PAGINA di lato.
                fuori.push(`<div class="tabella"><table><thead><tr>${intestazione}</tr></thead><tbody>${corpo}</tbody></table></div>`);
                break;
            }
            /* c8 ignore next 2 — `analizzaMarkdown` non produce altri tipi. */
            default: break;
        }
    }
    return fuori.join('\n');
}

/* ──────────────────── uscita 2: i blocchi di `document-report.mjs` (il PDF) ──────────────────── */

/**
 * I frammenti come «run» di pdfmake. ⛔ `text` accetta un ARRAY di run, e ogni run porta i suoi
 * `bold`/`italics`/`link`: è il motivo per cui il grassetto arriva nel PDF **senza** toccare
 * `document-report.mjs`, che è il costruttore condiviso di `document_create`.
 */
export function runsDiMarkdown(testo) {
    const runs = analizzaInline(testo).map((frammento) => ({
        text: frammento.v,
        ...(frammento.forte ? { bold: true } : {}),
        ...(frammento.corsivo ? { italics: true } : {}),
        ...(frammento.k === 'link' && hrefSicuro(frammento.href) ? { link: hrefSicuro(frammento.href) } : {}),
    }));
    // ⛔ Una cella VUOTA deve tornare `''` e non `[]`: `document-report.mjs` imbottisce le righe
    //   corte con `row[index] ?? ''`, e un array vuoto passa quel controllo pur non essendo testo.
    if (runs.length === 0) return '';
    // Un solo pezzo senza stile è una stringa: meno rumore nel documento, e identico a stampare.
    return runs.length === 1 && !runs[0].bold && !runs[0].italics && !runs[0].link ? runs[0].text : runs;
}

function elencoInReport(blocco) {
    return {
        t: 'list', ordered: blocco.ordinata,
        ...(blocco.inizio !== undefined ? { start: blocco.inizio } : {}),
        items: blocco.voci.map(voce => typeof voce === 'string' ? runsDiMarkdown(voce) : {
            x: runsDiMarkdown(voce.x),
            figli: voce.figli.map(b => b.t === 'lista' ? elencoInReport(b) : { t: 'p', x: runsDiMarkdown(b.x) }),
        }),
    };
}

/**
 * Il Markdown in blocchi del rapporto. Per le voci con figli, `document-generator.mjs`
 * adatta l'uscita di `document-report.mjs` alle liste native di pdfmake.
 * ⛔ Non esiste un blocco «citazione» in quello schema: si usa `note`, che è il riquadro tenue —
 *   la stessa forma con cui il PDF della ricerca mostra già i passaggi citati.
 * @returns {object[]}
 */
export function markdownInBlocchiReport(testo, opzioni = {}) {
    const base = Number.isSafeInteger(opzioni.livelloMinimo) ? opzioni.livelloMinimo : 1;
    const fuori = [];
    for (const blocco of analizzaMarkdown(testo)) {
        switch (blocco.t) {
            case 'h': fuori.push({ t: 'h', lvl: Math.min(3, Math.max(1, blocco.lvl + base - 1)), x: blocco.x }); break;
            case 'p': fuori.push({ t: 'p', x: runsDiMarkdown(blocco.x) }); break;
            case 'citazione': fuori.push({ t: 'note', x: runsDiMarkdown(blocco.x) }); break;
            case 'riga': fuori.push({ t: 'spacer' }); break;
            // Un recinto resta monospazio-che-non-abbiamo: almeno non si spezza in paragrafi.
            case 'codice': fuori.push({ t: 'note', x: blocco.x }); break;
            case 'lista': fuori.push(elencoInReport(blocco)); break;
            case 'tabella': fuori.push({
                t: 'table',
                head: blocco.intestazione.map(runsDiMarkdown),
                align: blocco.allineamenti,
                rows: blocco.righe.map((riga) => riga.map(runsDiMarkdown)),
            }); break;
            /* c8 ignore next 2 */
            default: break;
        }
    }
    return fuori;
}

/* ──────────────────────────── uscita 3: testo semplice ──────────────────────────── */

function elencoInTesto(blocco, profondita = 0) {
    return blocco.voci.map((voce, i) => {
        const x = typeof voce === 'string' ? voce : voce.x;
        const prefisso = blocco.ordinata ? `${(blocco.inizio ?? 1) + i}. ` : '• ';
        const riga = `${'  '.repeat(profondita)}${prefisso}${inlineInTestoSemplice(x)}`;
        if (typeof voce === 'string') return riga;
        return [riga, ...voce.figli.map(b => b.t === 'lista' ? elencoInTesto(b, profondita + 1)
            : `${'  '.repeat(profondita + 1)}${inlineInTestoSemplice(b.x)}`)].join('\n');
    }).join('\n');
}

/**
 * Il Markdown ridotto a prosa leggibile: niente marcatori, elenchi con un punto vero, una riga
 * vuota fra i blocchi.
 * Il DOCX ora usa direttamente `analizzaMarkdown`: questa uscita conserva la prosa leggibile.
 */
export function markdownInTestoSemplice(testo) {
    const fuori = [];
    for (const blocco of analizzaMarkdown(testo)) {
        const piatto = (x) => analizzaInline(x).map((f) => f.v).join('');
        switch (blocco.t) {
            case 'h': fuori.push(piatto(blocco.x)); break;
            case 'p': fuori.push(piatto(blocco.x)); break;
            case 'citazione': fuori.push(`« ${piatto(blocco.x)} »`); break;
            case 'riga': fuori.push('———'); break;
            case 'codice': fuori.push(blocco.x); break;
            case 'lista': fuori.push(elencoInTesto(blocco)); break;
            case 'tabella': fuori.push([blocco.intestazione, ...blocco.righe].map((riga) => riga.map(piatto).join(' · ')).join('\n')); break;
            /* c8 ignore next 2 */
            default: break;
        }
    }
    return fuori.join('\n\n');
}
