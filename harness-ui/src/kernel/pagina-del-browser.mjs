/*
 * ⭐ Decisione 201 dell'owner (04/11/2026): la pagina aperta nel Browser NON diventa più un allegato del messaggio dopo. Il modello sa
 *   che c'è (titolo e indirizzo, una riga) e la legge con un attrezzo quando gli serve, come Hermes `read_preview`
 *   (`tools/preview_tool.py:43-69`). Forma: in-corso/FORMA-BROWSER-201-2026-11-04.md, con gli OK di Performance, Mobile e CLI.
 *   Gemello di `dove-sei.mjs`: la nota si ripete SOLO quando la pagina cambia, confrontata con l'ultima nota col suo segno nella storia.
 * ⛔ Il titolo è scritto dalla pagina, quindi è un dato non fidato: niente a capo, niente segni che fingano TALOS (`<talos-note`,
 *   `<system-reminder`: come `neutralizza` di `sistema-piegato.mjs`), niente virgolette doppie che chiudano la citazione.
 * ⛔ L'indirizzo perde ciò che non serve al modello e può essere un segreto: utente e password, il `#frammento` (ci viaggiano i gettoni
 *   OAuth impliciti, RFC 6749 §4.2.2) e i valori dei parametri che si chiamano come una credenziale.
 * ⛔ Nella nota solo indirizzo e titolo, niente ore (condizione 2 di Performance): due giri sulla stessa pagina danno gli stessi byte.
 */

export const SEGNO_NOTA_PAGINA = '[TALOS: Browser tab]'
export const NOTA_PAGINA_CHIUSA = `${SEGNO_NOTA_PAGINA} The Browser tab of TALOS has no page open any more.`
/* Condizione 1 del Mobile (04/11/2026, frase esatta): l'esito di `browser_page` quando il messaggio del giro non viene dalla finestra
   del PC. Sta FUORI dal confine dei dati, mai nella nota né in testa a un messaggio. */
export const RIGA_PAGINA_DA_ALTROVE = 'The person did not write this from the Browser window: this is the page last open there, which they may not be looking at now.'
/** La testa di TALOS dell'esito di `browser_page` (fuori dal confine: il resto è della pagina). */
export const TESTA_PAGINA_BROWSER = /^BROWSER PAGE · [^\n]*\n/u

const TETTO_TITOLO = 120
const TETTO_INDIRIZZO = 300
/* Revisione del blocco «chat e pagina» (05/11/2026, R-2): nove nomi esatti lasciavano in chiaro `api_key`, `id_token`,
   `X-Amz-Signature`, `sessionid`, `sid`, `pwd`… Ora il nome si legge decodificato (fino a tre giri, come Hermes
   `agent/redact.py:837-848`), senza maiuscole, con `-` uguale a `_`, e basta che CONTENGA una di queste parole. Si sbaglia per
   eccesso (`keyword`, `author` si oscurano): la nota perde un valore innocuo, il modello legge la pagina con browser_page.
   Fonti: Hermes `agent/redact.py:89-94` (elenco esatto) e `hermes_cli/debug_redaction.py:22-27` (nomi compatti); keyhog
   `url_redaction.rs` (nomi senza maiuscole, firme dei link prefirmati; docs.rs, letto dalla revisione il 05/11). */
const PAROLE_SEGRETE = /token|secret|signature|key|passw|sess|auth|credential|sid|jwt/u
/* nomi esatti senza una di quelle parole; `-` vale `_`, quindi anche `OTP-Code` e `pin-code` */
const NOMI_SEGRETI = new Set(['code', 'sig', 'pwd', 'pass', 'otp', 'otp_code', 'pin_code'])
/* Un segreto nel percorso (`/reset/<gettone>/`): Codex lo toglie da ogni percorso oltre il primo pezzo
   (`codex-rs/cli/src/doctor/output.rs:1002-1011`); qui solo il pezzo lungo e casuale che segue una di queste parole, così gli
   indirizzi normali restano leggibili. */
const PEZZO_CHE_PRECEDE_UN_SEGRETO = /reset|token|verify|magic|invite|confirm/iu
const PEZZO_CASUALE = /^[A-Za-z0-9._~+=%-]{16,}$/u

function nomeSegreto(nomeGrezzo) {
    let nome = nomeGrezzo.replace(/\+/gu, ' ')
    for (let giro = 0; giro < 3; giro += 1) {
        let dopo
        try { dopo = decodeURIComponent(nome) } catch { break /* un nome illeggibile si guarda com'è */ }
        if (dopo === nome) break
        nome = dopo
    }
    nome = nome.toLowerCase().replace(/-/gu, '_')
    return NOMI_SEGRETI.has(nome) || PAROLE_SEGRETE.test(nome)
}

/* lungo E casuale: almeno 16 segni d'indirizzo con una cifra, oppure almeno 24 */
const pezzoCasuale = (pezzo) => PEZZO_CASUALE.test(pezzo) && (/\d/u.test(pezzo) || pezzo.length >= 24)

function percorsoPulito(percorso) {
    const pezzi = percorso.split('/')
    return pezzi.map((pezzo, i) => (i > 0 && PEZZO_CHE_PRECEDE_UN_SEGRETO.test(pezzi[i - 1]) && pezzoCasuale(pezzo) ? '…' : pezzo)).join('/')
}

/* eslint-disable-next-line no-control-regex */
const CONTROLLO = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/gu
const FINTO_TALOS = /<(\/?(?:talos-note|system-reminder))/giu

function taglia(testo, tetto) {
    const lettere = [...testo]
    return lettere.length <= tetto ? testo : `${lettere.slice(0, tetto - 1).join('')}…`
}

/**
 * L'indirizzo che il modello vede: solo http(s), senza credenziali, frammento e valori segreti, al massimo 300 caratteri.
 * @returns {string|null} `null` se non è un indirizzo http(s)
 */
export function indirizzoPulito(url) {
    let u
    try { u = new URL(String(url ?? '')) } catch { return null }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    u.username = ''
    u.password = ''
    u.hash = ''
    /* I parametri si guardano sul testo grezzo, così quelli innocui restano byte per byte come li ha scritti la pagina */
    const grezzi = u.search.slice(1)
    u.search = ''
    const parametri = grezzi === '' ? [] : grezzi.split('&').map((parte) => {
        const nomeGrezzo = parte.split('=')[0]
        return nomeSegreto(nomeGrezzo) ? `${nomeGrezzo}=…` : parte
    })
    return taglia(`${u.protocol}//${u.host}${percorsoPulito(u.pathname)}${parametri.length ? `?${parametri.join('&')}` : ''}`, TETTO_INDIRIZZO)
}

/** Il titolo che il modello vede: una riga, nessun segno di TALOS, virgolette semplici, al massimo 120 caratteri; senza titolo, l'host. */
export function titoloPulito(titolo, url = null) {
    let t = typeof titolo === 'string' ? titolo.replace(CONTROLLO, ' ').replace(FINTO_TALOS, '‹$1').replace(/"/gu, "'").replace(/\s+/gu, ' ').trim() : ''
    if (t === '') {
        try { t = new URL(String(url ?? '')).hostname } catch { t = '' }
    }
    return taglia(t, TETTO_TITOLO)
}

/**
 * La pagina riportata dal compositore, pulita; `null` se non c'è o non è http(s).
 * @param {{ url?: string, titolo?: string|null } | null | undefined} pagina
 */
export function paginaPulita(pagina) {
    if (!pagina || typeof pagina !== 'object') return null
    const indirizzo = indirizzoPulito(pagina.url)
    if (!indirizzo) return null
    return { indirizzo, titolo: titoloPulito(pagina.titolo, pagina.url) }
}

/** Il testo della nota per una pagina (o la forma «chiusa» per `null`). */
export function notaPaginaBrowser(pagina) {
    const pulita = paginaPulita(pagina)
    if (!pulita) return NOTA_PAGINA_CHIUSA
    return `${SEGNO_NOTA_PAGINA} The person has a page open in the Browser tab of TALOS: "${pulita.titolo}" — ${pulita.indirizzo}. It is not attached to the message. If the request is about it, read it with browser_page.`
}

const testoDi = (contenuto) => (typeof contenuto === 'string' ? contenuto
    : Array.isArray(contenuto) ? contenuto.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : '')

/** L'ultima nota della pagina che il modello ha davanti, o `null`. */
export function ultimaNotaPagina(messaggi) {
    if (!Array.isArray(messaggi)) return null
    for (let i = messaggi.length - 1; i >= 0; i -= 1) {
        const m = messaggi[i]
        if (m?.role !== 'system') continue
        const testo = testoDi(m.content)
        if (testo.startsWith(SEGNO_NOTA_PAGINA)) return testo
    }
    return null
}

/**
 * La nota da aggiungere adesso, o `null` se non serve.
 * - `pagina === undefined`: il messaggio non porta il campo (telefono, CLI, un giro partito altrove) ⇒ nessuna nota;
 * - la stessa nota dell'ultima ⇒ nessuna nota (stessa pagina in dieci messaggi: una nota sola);
 * - la forma «chiusa» solo se l'ultima diceva una pagina aperta: mai a chi non ne ha mai sentita una.
 */
export function notaPaginaDaAggiungere(messaggi, pagina) {
    if (pagina === undefined) return null
    const nota = notaPaginaBrowser(pagina)
    const ultima = ultimaNotaPagina(messaggi)
    if (nota === ultima) return null
    if (nota === NOTA_PAGINA_CHIUSA && ultima === null) return null
    return nota
}
