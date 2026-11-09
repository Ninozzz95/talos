/*
 * Centro assistenza (owner 01/11/2026, «Leggera, dalle pagine del sito»): l'attrezzo `talos_help`, con cui il modello legge la guida
 * di TALOS invece di rispondere a memoria su pulsanti e impostazioni (oggi indovina). Modulo del KERNEL condiviso: PC, CLI e telefono
 * usano la stessa forma `{query}` / `{page, section}` sulla stessa copia (`aiuto/index.json`, costruita da
 * `scripts/costruisci-aiuto.mjs` dalle pagine del sito della versione).
 *
 * Fatti dai concorrenti (letti il 01/11): Hermes carica la sua guida come skill solo a richiesta (`skills/.../hermes-agent/SKILL.md`,
 * `skill_view`), Claude Code ha un sotto-agente che legge la documentazione online con una mappa delle pagine, Codex niente. One-up:
 * una copia sola fissata alla versione, senza rete, e la data di controllo di ogni pagina detta al modello.
 *
 * Condizioni delle sessioni (01/11), tutte qui:
 *   - Performance: mai una pagina intera, sezioni di ~3.000 caratteri (le divide lo script); l'indice si legge alla PRIMA chiamata,
 *     non all'avvio; l'attrezzo sta dietro il ponte (una riga nel catalogo, la lista davanti non cambia).
 *   - CLI e Mobile: si cercano solo le pagine del prodotto dove gira il modello più quelle comuni (`all`): mai i tasti del PC al
 *     modello della CLI, mai una pagina di un'altra superficie come se valesse lì.
 *   - Mobile: `checkedOn` si confronta SOLO con la chiave del proprio prodotto; senza quella chiave la pagina è «mai controllata»,
 *     non «aggiornata». La lingua: si dice al modello in che lingua è la pagina.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const NOME_AIUTO = 'talos_help'
const VERSIONE_INDICE = 1
const RISULTATI_PREDEFINITI = 5
const RISULTATI_MASSIMI = 8
const ANTEPRIMA = 260
const NOMI_PRODOTTO = { desktop: 'Desktop', cli: 'CLI', android: 'Android' }

export const DEFINIZIONE_AIUTO = Object.freeze({
    name: NOME_AIUTO,
    description: 'Read the TALOS user guide (the pages of talos-code.com/docs shipped with this version of the app). Use it when the '
        + 'person asks how TALOS works, where a setting, button or menu is, or what a TALOS feature does, instead of answering from '
        + 'memory. Search with `query` (English keywords work best: the guide is in English), then read one section with `page` and '
        + '`section`. Each section says the version it was checked on; when it is older than this app, say that details may differ.',
    input_schema: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Keywords to search the guide, e.g. "automation daily cap" or "compaction model".' },
            page: { type: 'string', description: 'A page path from a search result, e.g. "desktop/guides/automations". With it, `query` is ignored.' },
            section: { type: 'string', description: 'A section id of that page, e.g. "create-one". Without it, the first section and the list of the others.' },
            limit: { type: 'integer', description: `How many search results (default ${RISULTATI_PREDEFINITI}, at most ${RISULTATI_MASSIMI}).` },
        },
    },
})

/* Parole che non distinguono niente, in inglese (la lingua della guida) e in italiano (la lingua in cui il modello a volte cerca). */
const PAROLE_VUOTE = new Set(('a an the and or of to in on at for from with by is are be it its this that how what where when which who do does '
    + 'can i you my your me we our not no if as into about there their then than so use using get set make show '
    + 'il lo la i gli le un una uno di da del della dei delle in su per con come dove cosa che e o non è si mi ti').split(' '))

function radice(parola) {
    if (parola.length > 4 && parola.endsWith('ies')) return `${parola.slice(0, -3)}y`
    if (parola.length > 5 && parola.endsWith('ing')) return parola.slice(0, -3)
    if (parola.length > 4 && parola.endsWith('ed')) return parola.slice(0, -2)
    if (parola.length > 3 && parola.endsWith('s') && !parola.endsWith('ss')) return parola.slice(0, -1)
    return parola
}

/* Le versioni («0.1.36») restano una parola sola: spezzate in «0», «1», «36» non troverebbero la loro nota di versione. */
const VERSIONE = /\d+(?:\.\d+)+/gu

export function paroleDi(testo) {
    const minuscolo = String(testo ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/gu, '')
    const versioni = minuscolo.match(VERSIONE) ?? []
    return [...versioni, ...minuscolo.replace(VERSIONE, ' ')
        .split(/[^\p{L}\p{N}_]+/u).filter((p) => p.length > 1 && !PAROLE_VUOTE.has(p)).map(radice)]
}

/* «0.1.19» contro «0.1.39»: numerico, pezzo per pezzo; ciò che non si legge come numero vale 0. */
export function confrontaVersioni(a, b) {
    const pa = String(a ?? '').split(/[.+-]/u).map((n) => Number.parseInt(n, 10) || 0)
    const pb = String(b ?? '').split(/[.+-]/u).map((n) => Number.parseInt(n, 10) || 0)
    for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0)
        if (d) return Math.sign(d)
    }
    return 0
}

/* La riga che dice al modello quanto fidarsi della pagina, per il SUO prodotto (Mobile 01/11). */
export function notaDiControllo(pagina, { prodotto, versione }) {
    const nome = NOMI_PRODOTTO[prodotto] ?? prodotto
    const controllata = pagina?.controllataSu?.[prodotto]
    if (!controllata) return `Never checked on ${nome}: treat button and menu names as possibly outdated.`
    /* Revisione del blocco 25 (S3, R8): senza la versione dell'app (telefono e CLI senza `TALOS_AIUTO_VERSIONE`) la nota taceva il confronto, e la pagina
       sembrava attuale anche se molto più vecchia. Ignota ⇒ si dice */
    if (!versione) return `Checked on ${nome} ${controllata}; the version of this app is not known, so some details may differ.`
    if (confrontaVersioni(controllata, versione) < 0) {
        return `Checked on ${nome} ${controllata}; this app is ${versione}: some details may differ.`
    }
    return `Checked on ${nome} ${controllata}.`
}

/*
 * Chi chiede aiuto chiede quasi sempre «come si fa»: a pari parole vincono le guide e i concetti, poi il riferimento, poi le rotte
 * dell'API e per ultime le note di versione (misurato sull'indice vero del 01/11: «change compaction model» dava tre pezzi del
 * changelog, «local model GPU» tre rotte dell'API prima della guida).
 */
export function pesoDellaPagina(percorso, { chiedeUnaVersione = false } = {}) {
    const p = String(percorso ?? '')
    if (/(^|\/)(changelog|versions)$/u.test(p)) return chiedeUnaVersione ? 1.5 : 0.35
    if (/\/reference\/api(\/|$)/u.test(p)) return 0.55
    if (/\/reference(\/|$)/u.test(p)) return 0.8
    return 1
}

function valePerProdotto(pagina, prodotto) {
    return pagina.prodotto === 'all' || pagina.prodotto === prodotto
}

/*
 * Revisione avversaria (01/11/2026), sull'indice vero: le pagine comuni hanno sezioni di una superficie sola («On TALOS Desktop», «In the
 * CLI», «On Android»). Si riconoscono dal titolo: una sezione che nomina un'altra superficie e non la propria resta fuori dalla ricerca
 * (condizione del Mobile: mai un'altra superficie come se valesse lì).
 */
const NOMI_DELLE_SUPERFICI = { desktop: /\bdesktop\b/iu, cli: /\bcli\b/iu, android: /\bandroid\b/iu }
const nominaUnAltra = (t, prodotto) => !NOMI_DELLE_SUPERFICI[prodotto]?.test(t) && Object.entries(NOMI_DELLE_SUPERFICI).some(([nome, re]) => nome !== prodotto && re.test(t))
const nominaQualcuna = (t) => Object.values(NOMI_DELLE_SUPERFICI).some((re) => re.test(t))
/* La prima frase del testo, senza il segno d'elenco: è lì che una sezione dice di chi parla («The Desktop installer is not code-signed.») */
const primaFrase = (testo) => String(testo ?? '').replace(/^\s*(?:[-*•]|\d+[.)])\s+/u, '').split(/(?<=[.!?])\s|\n/u)[0] ?? ''
/*
 * Revisione del blocco 25 (S3, R6): il titolo da solo non basta. Sull'indice vero «“Windows protected your PC”» e «The graphics card» sono del solo Desktop
 *   e non lo dicono nel titolo. Con un titolo che non nomina nessuna superficie decide la PRIMA FRASE: se nomina un'altra superficie e non la propria, la
 *   sezione è di quell'altra. Una superficie nominata più avanti, di passaggio («For the CLI, attach the diagnostic bundle»), non basta.
 *   ⛔ È un'euristica sul testo del sito: la cura vera è un segno di sezione nel sito (`data-product`) letto da `costruisci-indice.mjs` (dati del sito, all'owner).
 */
export function sezioneDiUnAltraSuperficie(titolo, prodotto, testo = '') {
    const t = String(titolo ?? '')
    if (nominaQualcuna(t)) return nominaUnAltra(t, prodotto)
    return nominaUnAltra(primaFrase(testo), prodotto)
}
/* Di quale superficie è una sezione d'un'altra, per dirlo al modello che la legge direttamente (il primo nome trovato, prima nel titolo) */
function superficieDellaSezione(sezione, prodotto) {
    for (const t of [String(sezione.titolo ?? ''), primaFrase(sezione.testo)]) {
        const altra = Object.entries(NOMI_DELLE_SUPERFICI).find(([nome, re]) => nome !== prodotto && re.test(t))?.[0]
        if (altra && nominaUnAltra(t, prodotto)) return altra
        if (nominaQualcuna(t)) return null
    }
    return null
}

export function cercaNellAiuto(indice, query, { prodotto, limite = RISULTATI_PREDEFINITI } = {}) {
    const parole = [...new Set(paroleDi(query))]
    if (!parole.length) return []
    const chiedeUnaVersione = parole.some((p) => /^\d+(?:\.\d+)+$/u.test(p))
    const trovati = []
    for (const pagina of indice.pagine) {
        if (!valePerProdotto(pagina, prodotto)) continue
        const titoloPagina = new Set(paroleDi(pagina.titolo))
        const descrizione = new Set(paroleDi(pagina.descrizione))
        for (const sezione of pagina.sezioni) {
            if (pagina.prodotto === 'all' && sezioneDiUnAltraSuperficie(sezione.titolo, prodotto, sezione.testo)) continue
            const titolo = new Set(paroleDi(sezione.titolo))
            const conteggi = new Map()
            for (const p of paroleDi(sezione.testo)) conteggi.set(p, (conteggi.get(p) ?? 0) + 1)
            let punti = 0
            let coperte = 0
            for (const p of parole) {
                const nelTesto = Math.min(conteggi.get(p) ?? 0, 3)
                const qui = (titolo.has(p) ? 6 : 0) + (titoloPagina.has(p) ? 4 : 0) + (descrizione.has(p) ? 2 : 0) + nelTesto
                if (qui) coperte++
                punti += qui
            }
            if (!coperte) continue
            // tutte le parole trovate valgono più di una parola sola ripetuta; a pari punti, prima il proprio prodotto
            punti = (punti + coperte * coperte * 3) * pesoDellaPagina(pagina.percorso, { chiedeUnaVersione }) + (pagina.prodotto === prodotto ? 0.5 : 0)
            trovati.push({ pagina, sezione, punti })
        }
    }
    trovati.sort((a, b) => b.punti - a.punti || a.pagina.percorso.localeCompare(b.pagina.percorso))
    return trovati.slice(0, limite)
}

function anteprima(testo, parole) {
    const pulito = String(testo).replace(/```[\s\S]*?```/gu, ' ').replace(/\s+/gu, ' ').trim()
    const minuscolo = pulito.toLowerCase()
    const primo = parole.map((p) => minuscolo.indexOf(p)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0
    const inizio = Math.max(0, primo - 60)
    const pezzo = pulito.slice(inizio, inizio + ANTEPRIMA)
    return `${inizio ? '…' : ''}${pezzo}${inizio + ANTEPRIMA < pulito.length ? '…' : ''}`
}

/* Revisione del blocco 25 (S3, R8): la lingua non arrivava mai, e la nota taceva. Nota ⇒ si confronta; ignota ⇒ si dice che non si sa */
const nomeLingua = (l) => (l === 'en' ? 'English' : l)
const notaDiLingua = (lingua, pagina) => {
    if (!pagina.lingua) return null
    if (!lingua) return `The guide is in ${nomeLingua(pagina.lingua)}; the person's language is not known here: answer in the language the person writes in.`
    return lingua.toLowerCase().startsWith(pagina.lingua) ? null : `The guide is in ${nomeLingua(pagina.lingua)}: answer the person in their own language.`
}
/* Revisione del blocco 25 (S3, R7): la domanda aveva nessun tetto — 1 MB tornava per intero al modello e 20.000 parole costavano ~435 ms di filo.
   Si taglia PRIMA di cercare, e l'eco dice la domanda tagliata */
export const DOMANDA_MASSIMA = 500
const tagliaDomanda = (q) => (q.length > DOMANDA_MASSIMA ? `${q.slice(0, DOMANDA_MASSIMA)}…` : q)

/*
 * L'attrezzo per un ospite. `cartella` contiene `index.json`; in alternativa `leggiIndice()` (il telefono legge dagli asset).
 * L'indice si legge alla prima chiamata e resta in memoria; un errore di lettura non resta: la chiamata dopo riprova.
 */
export function creaAiutoTalos({ cartella, leggiIndice, disponibileFn, prodotto, versione = null, lingua = null } = {}) {
    if (!NOMI_PRODOTTO[prodotto]) throw new TypeError(`talos_help: prodotto sconosciuto «${prodotto}»`)
    const leggi = leggiIndice ?? (async () => JSON.parse(await readFile(join(cartella, 'index.json'), 'utf8')))
    let inCorso = null
    const indice = () => {
        inCorso ??= Promise.resolve().then(leggi).then((dati) => {
            if (dati?.versione !== VERSIONE_INDICE || !Array.isArray(dati.pagine)) throw new Error(`help index version ${dati?.versione} not readable`)
            return dati
        })
        return inCorso.catch((errore) => { inCorso = null; throw errore })
    }

    /* D3 (condizioni di CLI e Mobile): un ospite senza l'indice delle pagine non offre l'attrezzo, così non arriva un errore al modello. Si guarda solo se c'è, non si legge
       (Performance: l'indice si legge alla prima chiamata); chi legge dagli asset (il telefono) dice se ce l'ha con `disponibileFn`. */
    const disponibile = () => {
        try { return typeof disponibileFn === 'function' ? disponibileFn() !== false : leggiIndice ? true : existsSync(join(cartella, 'index.json')) }
        catch { return false }
    }

    async function rispondi(argomenti = {}) {
        let dati
        try { dati = await indice() }
        catch { return { testo: 'The TALOS help is not available in this installation. Say so to the person; do not guess button or menu names.', errore: true } }
        const fonte = dati.fonte?.commit ? `talos-code.com/docs, site ${dati.fonte.commit}` : 'talos-code.com/docs'
        const pagina = typeof argomenti.page === 'string' && argomenti.page.trim()
            ? dati.pagine.find((p) => p.percorso === argomenti.page.trim().replace(/^\/?(docs\/)?|\/$/gu, ''))
            : null
        if (typeof argomenti.page === 'string' && argomenti.page.trim()) {
            if (!pagina) return { testo: `No help page "${argomenti.page}". Search with {query} first and use a path from the results.`, errore: true }
            if (!valePerProdotto(pagina, prodotto)) {
                return { testo: `The page "${pagina.percorso}" is for TALOS ${NOMI_PRODOTTO[pagina.prodotto] ?? pagina.prodotto}, not for this app (${NOMI_PRODOTTO[prodotto]}). Search with {query} for the ${NOMI_PRODOTTO[prodotto]} pages.`, errore: true }
            }
            const voluta = typeof argomenti.section === 'string' ? argomenti.section.trim().replace(/^#/u, '') : ''
            const indiceSezione = voluta ? pagina.sezioni.findIndex((s) => s.id === voluta) : 0
            if (indiceSezione < 0) {
                return { testo: `No section "${voluta}" in "${pagina.percorso}". Its sections: ${pagina.sezioni.map((s) => s.id).join(', ')}.`, errore: true }
            }
            const sezione = pagina.sezioni[indiceSezione]
            const altre = pagina.sezioni.filter((_s, i) => i !== indiceSezione).map((s) => `${s.id} (${s.titolo})`)
            /* Revisione del blocco 25 (S3, R6): una sezione d'un'altra superficie, letta per nome, si legge — ma il modello lo sa */
            const diUnAltra = pagina.prodotto === 'all' ? superficieDellaSezione(sezione, prodotto) : null
            return {
                testo: [
                    `${pagina.titolo} › ${sezione.titolo} — ${pagina.percorso}#${sezione.id} (${fonte})`,
                    diUnAltra ? `This section is about TALOS ${NOMI_PRODOTTO[diUnAltra]}, not this app (${NOMI_PRODOTTO[prodotto]}): do not present it as how this app works.` : null,
                    notaDiControllo(pagina, { prodotto, versione }),
                    notaDiLingua(lingua, pagina),
                    '',
                    sezione.testo,
                    '',
                    altre.length ? `Other sections of this page: ${altre.join(', ')}.` : 'This page has no other sections.',
                ].filter((r) => r !== null).join('\n'),
                errore: false,
            }
        }
        const query = typeof argomenti.query === 'string' ? tagliaDomanda(argomenti.query.trim()) : ''
        if (!query) return { testo: 'Give {query} to search the TALOS help, or {page, section} to read a section.', errore: true }
        const limite = Math.min(Math.max(Number.parseInt(argomenti.limit, 10) || RISULTATI_PREDEFINITI, 1), RISULTATI_MASSIMI)
        const risultati = cercaNellAiuto(dati, query, { prodotto, limite })
        if (!risultati.length) {
            return { testo: `Nothing in the TALOS help (${NOMI_PRODOTTO[prodotto]} and shared pages) matches "${query}". Try other English keywords; if it is still missing, tell the person the guide does not cover it rather than guessing.`, errore: false }
        }
        const parole = [...new Set(paroleDi(query))]
        const righe = [`TALOS help (${fonte}), ${NOMI_PRODOTTO[prodotto]} and shared pages — ${risultati.length} section${risultati.length === 1 ? '' : 's'} for "${query}":`]
        risultati.forEach(({ pagina: p, sezione: s }, i) => {
            righe.push(`${i + 1}. page "${p.percorso}", section "${s.id}" — ${p.titolo} › ${s.titolo}`)
            righe.push(`   ${anteprima(s.testo, parole)}`)
            righe.push(`   ${notaDiControllo(p, { prodotto, versione })}`)
        })
        const lingua1 = notaDiLingua(lingua, risultati[0].pagina)
        if (lingua1) righe.push(lingua1)
        righe.push('Read one with {page, section} before answering: the preview is not the whole section.')
        return { testo: righe.join('\n'), errore: false }
    }

    return { rispondi, disponibile, prodotto }
}
