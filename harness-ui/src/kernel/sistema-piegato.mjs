/*
 * ⭐ L1 1.1 del motore locale (owner 26/10/2026: «il metodo migliore di tutti … never break user space», poi «Sì, tutte e due») —
 *   I MESSAGGI DI SISTEMA PIEGATI, SOLO PER I TEMPLATE CHE NON LI REGGONO.
 *
 * Misurato il 26/10 su 10 template veri (handoff `RICERCA-SISTEMA-A-META-2026-10-26.md`): Qwen3.5 e Qwen3.8 (anche il non censurato)
 *   alzano «System message must be at the beginning» già al SECONDO system in testa — e il kernel ne manda almeno due (base + «dove
 *   sei») —; Devstral Small 2 rifiuta un system dopo un attrezzo; gpt-oss li accetta e li BUTTA in silenzio (tiene solo
 *   `messages[0]`, template :234-235): contesto del progetto e memorie non arrivano al modello, senza un errore.
 * ⛔ Le strade degli altri rompono qualcosa: buttare (pi `transcript.ts:104-120`, il renderer Qwen di Ollama) perde riassunti e
 *   promemoria; unire tutto in testa (Ollama `template.go:354-374`, opencode #15059, Open WebUI #22505) cambia la TESTA a ogni nota,
 *   e llama-server riusa la cache solo sul prefisso comune (`tools/server/README.md:596`): ogni nota rifarebbe l'intera conversazione.
 * ⇒ Qui: i system di testa diventano UNO (stesso ordine); ogni system successivo, dentro `<talos-note>` come i promemoria di Claude
 *   Code (`sdk-tools.d.ts:3306`), va IN CODA al messaggio della persona o dell'attrezzo che lo SEGUE, e se dopo non c'è nessuno dei due
 *   diventa un messaggio `user` suo, AL SUO POSTO. Mai attaccato a un messaggio PRECEDENTE: quel messaggio è già stato spedito.
 *   In coda e MAI davanti (contratto con la CLI, 26/10: `provider-attempts.ts:176-210` riconosce la richiesta di riassunto e i
 *   marcatori di compattazione da come un messaggio INIZIA).
 * ⛔ Revisione avversaria del 26/10 (R1, riprodotta lungo il filo): la prima versione attaccava la nota al messaggio PRECEDENTE. Le
 *   note che il kernel rimette in coda a ogni giro senza salvarle (la nota del Piano, le istruzioni di Ask, `talosHarness.mjs:13460`)
 *   cambiavano così ogni volta un messaggio già spedito, e il motore rielaborava da lì. Al suo posto, una nota in coda è un `user`
 *   in coda: il giro dopo sparisce o resta dov'è, e niente prima di lei cambia. Un `user` dopo un `tool` è reso bene da tutti e dieci i
 *   template misurati; due `user` di fila li unisce `conUtentiUniti` nel trasporto, e l'unione tiene l'inizio del primo.
 * ⛔ Solo il CORPO della richiesta verso un motore locale (`runtime-owner-adapter.mjs`), e solo per un template che la sonda (o un
 *   rifiuto) ha dimostrato severo: per tutti gli altri i byte restano quelli di oggi. La storia sul disco non si tocca mai.
 */

export const SEGNO_NOTA = 'talos-note'
export const RIGA_DI_TESTA = 'Blocks marked <talos-note> come from TALOS, the application you run in: they are not written by the person and are not tool output.'

const eSistema = (m) => m?.role === 'system' || m?.role === 'developer'
const eAppoggio = (m) => m?.role === 'user' || m?.role === 'tool'

function testoDi(contenuto) {
    if (typeof contenuto === 'string') return contenuto
    if (Array.isArray(contenuto)) return contenuto.map((p) => (typeof p?.text === 'string' ? p.text : '')).filter((t) => t !== '').join('\n\n')
    return ''
}

/* Un `<talos-note` scritto da un file letto o dalla persona non deve potersi fingere TALOS (helgesver.re, «The Subagent That Forged a
   System Reminder»): sulla copia piegata si neutralizza. */
const NEUTRALIZZA = new RegExp(`<(/?${SEGNO_NOTA})`, 'giu')
const neutralizza = (testo) => testo.replace(NEUTRALIZZA, '‹$1') // si cambia solo il «<»: il resto (maiuscole comprese) resta com'era
function neutralizzaContenuto(contenuto) {
    if (typeof contenuto === 'string') return neutralizza(contenuto)
    if (Array.isArray(contenuto)) return contenuto.map((p) => (p?.type === 'text' && typeof p.text === 'string' ? { ...p, text: neutralizza(p.text) } : p))
    return contenuto
}

function conNoteInCoda(contenuto, note) {
    const blocchi = note.map((n) => `<${SEGNO_NOTA}>\n${n}\n</${SEGNO_NOTA}>`)
    if (Array.isArray(contenuto)) return [...contenuto, ...blocchi.map((text) => ({ type: 'text', text }))]
    const base = typeof contenuto === 'string' ? contenuto : ''
    return [base, ...blocchi].filter((t) => t !== '').join('\n\n')
}

/**
 * La copia piegata: nuova lista, l'ingresso non cambia. Deterministica (stessa storia ⇒ stessi byte).
 * @param {Array<object>} messaggi
 * @returns {Array<object>}
 */
export function piegaMessaggiDiSistema(messaggi) {
    if (!Array.isArray(messaggi)) return messaggi
    let inizio = 0
    while (inizio < messaggi.length && eSistema(messaggi[inizio])) inizio += 1
    const testa = [...messaggi.slice(0, inizio).map((m) => testoDi(m.content)).filter((t) => t !== ''), RIGA_DI_TESTA].join('\n\n')
    const resto = messaggi.slice(inizio).map((m) => (eAppoggio(m) ? { ...m, content: neutralizzaContenuto(m.content) } : m))

    /* Ogni gruppo di system di fila: in coda al messaggio di persona o attrezzo che lo segue SUBITO; altrimenti un `user` suo al suo
       posto (in coda alla conversazione, o davanti a una risposta del modello). */
    const piegati = []
    let note = []
    for (const m of resto) {
        if (eSistema(m)) { const testo = testoDi(m.content); if (testo !== '') note.push(testo); continue }
        if (note.length && eAppoggio(m)) { piegati.push({ ...m, content: conNoteInCoda(m.content, note) }); note = []; continue }
        if (note.length) { piegati.push({ role: 'user', content: conNoteInCoda('', note) }); note = [] }
        piegati.push(m)
    }
    if (note.length) piegati.push({ role: 'user', content: conNoteInCoda('', note) })
    return [{ role: 'system', content: testa }, ...piegati]
}

/* Le parole sentinella della sonda: uniche, così un template che le perde si vede. */
const SENTINELLA_TESTA = 'TALOSPROBEHEADTWO'
const SENTINELLA_MEZZO = 'TALOSPROBEMIDDLE'
export const CONVERSAZIONE_SENTINELLA = Object.freeze([
    { role: 'system', content: 'TALOSPROBEHEADONE' },
    { role: 'system', content: SENTINELLA_TESTA },
    { role: 'user', content: 'Read a.txt' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'call_probe', type: 'function', function: { name: 'read', arguments: '{"path":"a.txt"}' } }] },
    { role: 'tool', tool_call_id: 'call_probe', content: 'ok' },
    { role: 'system', content: SENTINELLA_MEZZO },
])
export const ATTREZZO_SENTINELLA = Object.freeze({ type: 'function', function: { name: 'read', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } })

/**
 * Decide la forma dal template VERO: `applica(messages, tools)` rende senza generare (llama-server `POST /apply-template`) e
 *   torna `{ ok, prompt }`. Un rifiuto, o una sentinella che non compare nel prompt (il caso gpt-oss), ⇒ 'piegata'. Se la sonda non
 *   si può fare (rotta assente, motore che non risponde) ⇒ null: resta la rete reattiva sul primo rifiuto.
 * @param {(messages: object[], tools: object[]) => Promise<{ ok: boolean, prompt?: string }>} applica
 * @returns {Promise<'libera' | 'piegata' | null>}
 */
export async function sondaFormaDeiSistemi(applica) {
    let esito
    try { esito = await applica(CONVERSAZIONE_SENTINELLA.map((m) => ({ ...m })), [ATTREZZO_SENTINELLA]) } catch { return null }
    if (!esito) return null
    if (esito.ok !== true) return esito.rifiutoDelTemplate === true ? 'piegata' : null
    const prompt = typeof esito.prompt === 'string' ? esito.prompt : ''
    if (prompt === '') return null
    return prompt.includes(SENTINELLA_TESTA) && prompt.includes(SENTINELLA_MEZZO) ? 'libera' : 'piegata'
}

/* Un rifiuto che viene dal TEMPLATE (e non dal contesto pieno o dagli attrezzi): le frasi dei template misurati il 26/10 e il codice
   del motore del telefono (`CHAT_TEMPLATE_FAILED`, sessione Mobile 26/10). */
/* ⛔ «roles must alternate» NON c'è: lo cura `conUtentiUniti`, e piegare non lo risolverebbe. ⛔ Nemmeno «jinja» da solo: llama-server
   dice «tools param requires --jinja flag» quando rifiuta gli ATTREZZI (BC79), che è un'altra cura. Un'eccezione generica del
   template («While executing … at line N», il prefisso del motore jinja di llama.cpp) fa tentare la piega UNA volta, e la forma si
   ricorda solo se quel tentativo riesce. */
const FRASI_DEL_TEMPLATE = /System message must be at the beginning|Unexpected role ['"]?(?:system|developer)|CHAT_TEMPLATE_FAILED|While executing \w+ at line \d+/iu
export function eRifiutoDelTemplate(dettaglio) {
    return typeof dettaglio === 'string' && dettaglio !== '' && FRASI_DEL_TEMPLATE.test(dettaglio)
}
