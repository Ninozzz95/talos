/*
 * PERF R-34 (owner 30/10/2026, «Regola per tipo di modello»; proposta PROPOSTA-R34-CHIAMATA-NEL-TESTO-2026-10-30.md, pareri di Desktop,
 * CLI e Mobile) — una chiamata d'attrezzo arrivata come TESTO in CODA alla risposta del modello, senza `tool_calls`.
 * Misura: campagna pubblica-ebb04d2c1, G-confine TALOS r3 fallito (GLM su DigitalOcean, `finish_reason: stop`): la coda era
 * `…nel file:shell<arg_key>comando</arg_key><arg_value>…</arg_value><arg_key>description: …</arg_value></tool_call>` — ATTACCATA alla
 * frase (la regola di Hermes «tag a inizio riga», agent_runtime_helpers.py:70-79, qui non la vedrebbe) e malformata (una chiave mai chiusa).
 * Si riconosce quindi dalla FORMA d'attacco: il nome di un attrezzo OFFERTO in questa richiesta subito prima di `<arg_key>` (forma GLM)
 * o dentro `<tool_call>{"name": …}` (forma JSON, Qwen), e la risposta deve FINIRE con la chiusura (`</tool_call>` o `</arg_value>`).
 * Una menzione dentro una frase che poi continua non è una coda; un nome non offerto non è una chiamata.
 * ⛔ Qui si RICONOSCE soltanto: che cosa farne (ripresa per i modelli in rete, promozione col permesso per i locali) lo decide il giro.
 */

import { REGISTRO_FORNITORI } from '../provider-registry.mjs'

/*
 * «Modello locale»: UN predicato condiviso (contratto R-34, CLI 30/10 — niente elenco di prefissi a mano). `local:` e `locale-ospite:`
 * (il motore di TALOS sul PC e quello dell'app che ospita r4, cioè il telefono), più ogni fornitore del registro col catalogo `runtime-locale` (oggi Ollama e
 * LM Studio, `provider-registry.mjs`; un motore locale aggiunto domani entra da solo). La CLI ne farà un involucro (`isLocalProvider`).
 */
/**
 * FE-008, Performance 03/11/2026: dove una risposta può portare più chiamate. Il piano le ha di serie (`chatgpt-richiesta.mjs:83`), la strada
 * compatibile OpenAI solo se il profilo le accende (`openai-compatible-runtime.mjs:487`). Senza, ogni aggiornamento dei Passi è un giro intero.
 */
export function modelloConChiamateParallele(modello) {
    const id = typeof modello === 'string' ? modello : ''
    const due = id.indexOf(':')
    if (due <= 0) return false
    const fonte = id.slice(0, due)
    return fonte === 'chatgpt' || REGISTRO_FORNITORI?.[fonte]?.chiamateParallele?.attiva === true
}

export function eModelloLocale(modello) {
    const id = typeof modello === 'string' ? modello : ''
    const due = id.indexOf(':')
    if (due <= 0) return false
    const fonte = id.slice(0, due)
    if (fonte === 'local' || fonte === 'locale-ospite') return true
    return REGISTRO_FORNITORI?.[fonte]?.catalogo?.fonte === 'runtime-locale'
}

/* il frammento tolto dal flusso viaggia su una proprietà-simbolo della risposta, fino al giro (non entra nel JSON verso il fornitore) */
export const CHIAMATA_NEL_TESTO = Symbol.for('talos.chiamata-nel-testo')

const CHIUSURA_IN_CODA = /(?:<\/tool_call>|<\/arg_value>)\s*$/u
const ATTACCO_GLM = /(?:<tool_call>\s*)?([A-Za-z_][\w.-]*)\s*<arg_key>/gu
const BLOCCO_JSON = /<tool_call>\s*(\{[\s\S]*\})\s*<\/tool_call>\s*$/u

/**
 * @param {string} testo  il testo della risposta del modello (solo quello: mai il risultato di un attrezzo)
 * @param {string[]} nomiOfferti  i nomi degli attrezzi mandati al modello in questa richiesta
 * @returns {null | { nome: string, forma: 'glm' | 'json', frammento: string, pulito: string }}
 */
export function codaChiamataNelTesto(testo, nomiOfferti) {
    const t = typeof testo === 'string' ? testo : ''
    const offerti = new Set((Array.isArray(nomiOfferti) ? nomiOfferti : []).filter((n) => typeof n === 'string' && n))
    if (!t || offerti.size === 0 || !CHIUSURA_IN_CODA.test(t)) return null
    for (const m of t.matchAll(ATTACCO_GLM)) {
        if (!offerti.has(m[1])) continue
        const inizio = m.index
        return { nome: m[1], forma: 'glm', frammento: t.slice(inizio).trim(), pulito: t.slice(0, inizio).trimEnd() }
    }
    const json = BLOCCO_JSON.exec(t)
    if (json) {
        let nome = null
        try { const j = JSON.parse(json[1]); nome = typeof j?.name === 'string' ? j.name : null } catch { nome = null }
        if (nome && offerti.has(nome)) return { nome, forma: 'json', frammento: t.slice(json.index).trim(), pulito: t.slice(0, json.index).trimEnd() }
    }
    return null
}

/*
 * R-34 parte 2 (owner 30/10/2026 «Regola per tipo di modello»; forma in PROPOSTA-R34-PARTE-2-2026-10-30.md, sì di Desktop, CLI e
 * Mobile): gli ARGOMENTI di una coda riconosciuta, solo se si leggono e rispettano lo schema dell'attrezzo — altrimenti `null`, e il
 * giro chiede di rifare la chiamata come in rete. Forma GLM: le coppie `<arg_key>k</arg_key><arg_value>v</arg_value>` CHIUSE (una
 * chiave mai chiusa, come nella coda di G r3, non si indovina: la coppia rotta non c'è, e se era obbligatoria la chiamata non passa);
 * un valore che è JSON valido di un tipo non-stringa (numero, booleano, oggetto, elenco) si legge come tale, come fa il template di
 * GLM. Forma JSON: `arguments` oggetto o stringa JSON.
 * ⛔ Lo schema decide: ogni obbligatorio presente; con `properties` dichiarate, nessuna chiave sconosciuta.
 */
const COPPIA_GLM = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/gu
/* revisione del Desktop S2: il tipo lo dice lo SCHEMA — una proprietà dichiarata stringa resta testo anche se sembra un numero
   («123», «true»); il JSON si legge solo per le altre (numero, booleano, oggetto, elenco) */
function valoreGlm(v, definizione) {
    const tipi = Array.isArray(definizione?.type) ? definizione.type : [definizione?.type]
    if (tipi.includes('string') && !tipi.some((t) => t && t !== 'string')) return v
    const t = v.trim()
    if (/^(?:-?\d|true$|false$|null$|\{|\[)/u.test(t)) { try { return JSON.parse(t) } catch { /* resta testo */ } }
    return v
}
export function argomentiDalFrammento(c, parametri) {
    if (!c || typeof c.frammento !== 'string') return null
    let argomenti = null
    if (c.forma === 'json') {
        const json = /<tool_call>\s*(\{[\s\S]*\})\s*<\/tool_call>/u.exec(c.frammento)?.[1]
        try {
            const j = JSON.parse(json ?? '')
            const a = typeof j?.arguments === 'string' ? JSON.parse(j.arguments) : j?.arguments
            argomenti = a && typeof a === 'object' && !Array.isArray(a) ? a : null
        } catch { argomenti = null }
    } else {
        argomenti = {}
        const definizioni = parametri?.properties && typeof parametri.properties === 'object' ? parametri.properties : {}
        for (const m of c.frammento.matchAll(COPPIA_GLM)) {
            const chiave = m[1].trim()
            if (!/^[A-Za-z_][\w.-]{0,63}$/u.test(chiave)) return null
            argomenti[chiave] = valoreGlm(m[2], Object.hasOwn(definizioni, chiave) ? definizioni[chiave] : null)
        }
    }
    if (!argomenti) return null
    const schema = parametri && typeof parametri === 'object' ? parametri : {}
    const obbligatori = Array.isArray(schema.required) ? schema.required : []
    if (obbligatori.some((k) => !Object.hasOwn(argomenti, k))) return null
    const proprieta = schema.properties && typeof schema.properties === 'object' ? schema.properties : null
    if (proprieta && Object.keys(argomenti).some((k) => !Object.hasOwn(proprieta, k))) return null
    return argomenti
}

/*
 * Il filtro del FLUSSO (condizione della CLI, 30/10: la CLI stampa il testo dal vivo dai delta `TextMessageContent`, quindi il frammento va
 * fermato dove gli eventi NASCONO, nel nucleo, prima che diventino delta). Stesso contratto di `creaFiltroConfiniNelTesto`: `scrivi(pezzo)`
 * restituisce il testo da mostrare adesso, `chiudi()` quello rimasto a fine flusso, più `tolta` se il trattenuto era una chiamata.
 * - si trattiene il possibile ATTACCO: la parola che sta finendo (un nome d'attrezzo può essere attaccato a `<arg_key>`) e un `<…` che può
 *   ancora diventare `<arg_key>` o `<tool_call>` — un pezzo di parola o di tag, fino al carattere dopo;
 * - dall'attacco vero (nome OFFERTO + `<arg_key>`, oppure `<tool_call>`) si trattiene tutto fino a fine flusso: lì, se il trattenuto è una
 *   chiamata in coda (`codaChiamataNelTesto`), si toglie; altrimenti esce per intero (una menzione che poi continua in prosa).
 * - ⛔ L'attacco vale OVUNQUE nella riga, non solo a inizio riga come in Hermes: la coda vera di G r3 è attaccata alla frase
 *   («…nel file:shell<arg_key>…»). Il costo, dichiarato (CLI 30/10): una menzione a metà risposta fa arrivare il resto tutto insieme a
 *   fine flusso invece che a pezzi — niente si perde. Oltre TETTO_TRATTENUTO il trattenuto torna testo e il filtro si spegne.
 */
const ATTACCO_IN_CORSO = /(?:<tool_call>|([A-Za-z_][\w.-]*)\s*<arg_key>)/gu
const PARZIALI = ['<tool_call>', '<arg_key>']
const PAROLA_MASSIMA = 64
const TETTO_TRATTENUTO = 64 * 1024
/* R1-R (Mobile 30/10): oltre questa taglia un attacco cominciato e mai chiuso non è più «una chiamata»: alla fine interrotta torna testo.
   Con la STRUTTURA provata (CLI, scelta del Mobile «B»: GLM `</arg_key>` + `<arg_value>` dopo un nome offerto, o JSON `"name"` offerto)
   il tetto sale a TETTO_INTERROTTA_STRUTTURATA — un `node -e` vero di 3 KB tagliato da uno Stop non va a schermo. Il compromesso,
   dichiarato: fra 2 e 16 KB un trattenuto strutturato esce dalla risposta e resta solo nell'evento, oscurato e tagliato; oltre 16 KB è
   testo comunque (la prosa persa per un falso attacco strutturato ha un tetto). */
const TETTO_INTERROTTA = 2_000
const TETTO_INTERROTTA_STRUTTURATA = 16 * 1024
const CHIUSURA = /<\/tool_call>|<\/arg_value>/gu

/* revisione del Desktop S3-2 (30/10), come Hermes agent_runtime_helpers.py:70-79: `<tool_call>` è un attacco solo a INIZIO riga o seguito
   da `{` (la forma JSON); in mezzo a una frase che ne parla («il tag <tool_call> serve a…») resta testo e il flusso non si ferma.
   Ritorna: l'indice dell'attacco, 'attesa' se `<tool_call>` è ancora l'ultima cosa (non si sa che cosa viene dopo), o -1. */
function attaccoDi(testo, insieme, aInizioRiga) {
    ATTACCO_IN_CORSO.lastIndex = 0
    for (const m of testo.matchAll(ATTACCO_IN_CORSO)) {
        if (m[1] !== undefined) { if (insieme.has(m[1])) return m.index; continue }
        const dopo = testo.slice(m.index + m[0].length)
        /* il trattenuto non ha il testo già uscito: «inizio riga» vale se la riga è cominciata QUI dentro, o se l'ultimo carattere già
           dato era un a capo (o non è uscito ancora niente) */
        const prima = testo.slice(0, m.index)
        const inizioRiga = /\n[ \t]*$/u.test(prima) || (aInizioRiga && /^[ \t]*$/u.test(prima))
        if (inizioRiga || /^\s*\{/u.test(dopo)) return m.index
        if (!/\S/u.test(dopo)) return { attesa: m.index }
    }
    return -1
}
/* la fine dell'ultima chiusura, o -1 */
function fineUltimaChiusura(testo) {
    let fine = -1
    for (const m of testo.matchAll(CHIUSURA)) fine = m.index + m[0].length
    return fine
}

export function creaFiltroChiamataNelTesto(nomiOfferti) {
    const offerti = (Array.isArray(nomiOfferti) ? nomiOfferti : []).filter((n) => typeof n === 'string' && n)
    const insieme = new Set(offerti)
    let tenuto = ''
    let trattenuto = false
    let spento = false
    let ultimo = '' // l'ultimo carattere già dato fuori ('' = niente ancora: inizio della risposta, quindi inizio riga)
    const esci = (s) => { if (s) ultimo = s.at(-1); return s }
    /* una funzione con nome, non un metodo (revisione del Desktop): `scrivi` resta corretta anche passata come callback */
    function scrivi(pezzo = '') {
            if (!pezzo && !tenuto) return '' // `scrivi('')` riguarda il trattenuto (la ripresa dopo la prosa, qui sotto)
            if (insieme.size === 0) return pezzo
            tenuto += pezzo
            /* CLI 30/10: un falso attacco presto in una risposta lunghissima non tiene tutto in memoria — oltre il tetto il trattenuto
               torna testo e il filtro si spegne per questa risposta */
            if (trattenuto && tenuto.length > TETTO_TRATTENUTO) { const fuori = tenuto; tenuto = ''; trattenuto = false; spento = true; return esci(fuori) }
            if (spento) { const fuori = tenuto; tenuto = ''; return esci(fuori) }
            if (trattenuto) {
                /* S3-2: se dopo una chiusura riprende la PROSA, il trattenuto non è più una coda: esce adesso, e si riguarda il resto */
                const fine = fineUltimaChiusura(tenuto)
                if (fine < 0 || !/^\s*[^\s<]/u.test(tenuto.slice(fine))) return ''
                const fuori = esci(tenuto.slice(0, fine))
                tenuto = tenuto.slice(fine)
                trattenuto = false
                return fuori + scrivi('')
            }
            const a = attaccoDi(tenuto, insieme, ultimo === '' || ultimo === '\n')
            if (typeof a === 'number' && a >= 0) {
                trattenuto = true
                const fuori = tenuto.slice(0, a)
                tenuto = tenuto.slice(a)
                return esci(fuori)
            }
            if (a && typeof a === 'object') { const fuori = tenuto.slice(0, a.attesa); tenuto = tenuto.slice(a.attesa); return esci(fuori) }
            /* quanto si può dare adesso: tutto, tranne un tag che sta cominciando e la parola che gli sta attaccata */
            /* ⛔ si trattiene il meno possibile (prova del nucleo «onDelta arriva DENTRO talosLavora»: un pezzo di testo resta UN delta):
               un `<…` che può ancora diventare `<arg_key>`/`<tool_call>`, e la parola attaccata SOLO se può essere un nome offerto */
            let taglio = tenuto.length
            const lt = tenuto.lastIndexOf('<')
            const tagParziale = lt >= 0 && PARZIALI.some((p) => p.startsWith(tenuto.slice(lt)))
            if (tagParziale) taglio = lt
            let inizioParola = taglio
            while (inizioParola > 0 && taglio - inizioParola < PAROLA_MASSIMA && /[\w.-]/u.test(tenuto[inizioParola - 1])) inizioParola -= 1
            const parola = tenuto.slice(inizioParola, taglio)
            if (parola && (tagParziale ? offerti.includes(parola) : offerti.some((n) => n.startsWith(parola)))) taglio = inizioParola
            const fuori = tenuto.slice(0, taglio)
            tenuto = tenuto.slice(taglio)
            return esci(fuori)
    }
    /* R1-R (CLI 30/10, misurata sulla suite della CLI; forma concordata con Desktop e Mobile): il trattenuto non deve MAI perdersi.
       - `inAttesaDiAttacco()`: si tiene SOLO un possibile attacco (una parola che è l'inizio di un nome offerto, un `<…` che sta
         diventando tag, un `<tool_call>` che aspetta il seguito) — chi legge il flusso lo rilascia dopo una pausa del fornitore;
       - `rilascia()`: quel trattenuto torna testo adesso (un attacco GIÀ cominciato no: resta com'è);
       - `chiudiInterrotto()`: la fine NON normale del flusso (Stop, errore, silenzio). Un possibile attacco torna testo; un attacco già
         cominciato non va né a schermo né nella risposta, ma torna come `interrotta` (il giro lo scrive nel giornale, oscurato) — solo
         se è ancora della taglia di una chiamata (Mobile: un falso attacco seguito da tanta prosa vera torna testo, come prima). */
    function inAttesaDiAttacco() { return tenuto !== '' && !trattenuto && !spento }
    function rilascia() {
        if (trattenuto || !tenuto) return ''
        const fuori = tenuto
        tenuto = ''
        return esci(fuori)
    }
    function chiudiInterrotto() {
        const resto = tenuto
        const cominciato = trattenuto
        tenuto = ''
        trattenuto = false
        if (!resto) return { testo: '', interrotta: null }
        if (!cominciato) return { testo: esci(resto), interrotta: null }
        const glm = /^(?:<tool_call>\s*)?([A-Za-z_][\w.-]*)\s*<arg_key>/u.exec(resto)
        const nomeGlm = glm && insieme.has(glm[1]) ? glm[1] : null
        const nomeJson = /"name"\s*:\s*"([^"\\]{1,64})"/u.exec(resto)?.[1] ?? null
        const strutturata = (nomeGlm !== null && /<\/arg_key>\s*<arg_value>/u.test(resto)) || (nomeJson !== null && insieme.has(nomeJson))
        if (resto.length > (strutturata ? TETTO_INTERROTTA_STRUTTURATA : TETTO_INTERROTTA)) return { testo: esci(resto), interrotta: null }
        return { testo: '', interrotta: { nome: nomeGlm ?? nomeJson, forma: glm ? 'glm' : 'json', frammento: resto } }
    }
    return {
        scrivi,
        inAttesaDiAttacco,
        rilascia,
        chiudiInterrotto,
        chiudi() {
            const resto = tenuto
            tenuto = ''
            if (!trattenuto) return { testo: resto, tolta: null, grezzo: resto }
            const c = codaChiamataNelTesto(resto, offerti)
            /* `grezzo`: il trattenuto com'era — chi chiude (il flusso) lo rimette se la risposta ha anche chiamate STRUTTURATE */
            return c && !c.pulito ? { testo: '', tolta: c, grezzo: resto } : { testo: resto, tolta: null, grezzo: resto }
        },
    }
}
