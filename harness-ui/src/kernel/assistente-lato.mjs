/*
 * ⭐ L'ASSISTENTE, pezzo «a domanda» (owner 11/11/2026: decisioni 16:45, 16:55, 17:12, 17:13, 17:17; giudice v1500 e v1502).
 *   La scheda «A lato» diventa l'Assistente: legge la chat e i suoi file, in SOLA LETTURA, e risponde quando la persona gli scrive.
 *   Questo modulo è il nucleo comune (desktop, CLI e telefono passano da `chiediALato` del registro): il ciclo dei passi, i due muri
 *   e gli attrezzi nuovi. Niente qui tocca il disco o la rete da solo: chi chiama passa le porte (`ctx`), le prove le sostituiscono.
 *
 * DUE MURI, entrambi nel codice:
 *   1. L'ELENCO: `ATTREZZI_LATO` (sottoinsieme di `ATTREZZI_PIANO_FISSI` del kernel) + `ATTREZZI_NUOVI_LATO`, raggiungibili SOLO
 *      dalla strada degli attrezzi differiti (`tool_search` / `tool_describe` / `tool_call`). `bloccatoALato` giudica il nome VERO
 *      dentro `tool_call`, come Hermes spacchetta prima dei permessi (`agent/tool_executor.py:395-445`). Un attrezzo fuori elenco
 *      riceve un rifiuto che NOMINA l'alternativa di lettura, contro la «tempesta di rifiuti» di Hermes
 *      (`agent/background_review.py:1118-1124`).
 *   2. IL LIVELLO FISSO «lettura" (`LIVELLO_DELL_ASSISTENTE`): se un giorno l'elenco crescesse per errore, ciò che il livello di sola
 *      lettura nega (`attrezziNegatiDalLivello`) resta negato; e le letture si giudicano come in sola lettura anche in una chat in
 *      Accesso pieno (fuori dalla cartella: solo i file che l'agente della chat ha già letto).
 *
 * ⛔ Nessuna shell: i «comandi di sola lettura» che lanciano programmi sono la trappola di pi (`plan-mode/utils.ts:68-90`: `env`,
 *   `curl`, `awk`, `git diff`). Git passa SOLO dal servizio del server (`git-service.mjs`, programmi della cartella spenti).
 * ⛔ Cache: al modello si mostrano gli STESSI `tools` del giro, byte per byte. Gli attrezzi nuovi non stanno fra i `tools`: li trova
 *   `tool_search`, eseguito qui, e li esegue `tool_call`. Li vede solo l'Assistente, mai l'agente della chat.
 * ⛔ Gli esiti delle letture sono DATI: Codex `codex-rs/ext/guardian-reviewer/src/instructions.rs:19`, «tool outputs do not become
 *   authorization».
 */
import { NOME_CHIAMATA_ATTREZZO, NOME_DESCRIZIONE_ATTREZZI, NOME_RICERCA_ATTREZZI, NOMI_DEL_PONTE, cercaAttrezzi, descriviAttrezzi } from './ponte-attrezzi.mjs'
import { ATTREZZI_PIANO_FISSI, attrezziNegatiDalLivello } from './talosHarness.mjs'

/** Il livello dell'Assistente: fisso, mai quello della chat. */
export const LIVELLO_DELL_ASSISTENTE = 'lettura'

/** 8 passi per domanda (Hermes ne dà 3 alla domanda a lato, `agent/side_question.py:22`, 16 alla revisione, `background_review.py:173`), 120 s. */
export const TETTI_ASSISTENTE = Object.freeze({ passi: 8, attesaMs: 120_000, esito: 12_000, righePagina: 40, anteprimaEsito: 600, riassunto: 12_000 })

/* Le letture del Piano che l'Assistente esegue. Fuori: ciò che muove qualcosa o chiede alla persona fuori dal pannello (domande,
   piani, figlie, impostazioni, segnalazioni, telefoni, computer use) e ciò che il server non sa eseguire qui (le sezioni). */
export const ATTREZZI_LATO = Object.freeze(new Set(['elenca', 'cerca', 'leggi', 'naviga', 'web_search', 'time_now',
  NOME_RICERCA_ATTREZZI, NOME_DESCRIZIONE_ATTREZZI, NOME_CHIAMATA_ATTREZZO]))

const oggetto = (proprieta, richiesti = []) => ({ type: 'object', properties: proprieta, required: richiesti, additionalProperties: false })
const schema = (name, description, parameters) => Object.freeze({ type: 'function', function: { name, description, parameters } })
/* Gli attrezzi nuovi, eseguiti dal server. Nomi e descrizioni li riceve SOLO il modello dell'Assistente (da `tool_search`/`tool_describe`). */
export const SCHEMI_NUOVI_LATO = Object.freeze([
  schema('git_stato', 'Read-only git status of the chat folder: changed, staged and untracked files. Secret files are named, never shown.', oggetto({})),
  schema('git_diff', 'Read-only git diff of the chat folder (or of one file with "percorso"; "area": "worktree" or "staged"). A changed secret file is named, its content is hidden.',
    oggetto({ percorso: { type: 'string' }, area: { type: 'string', enum: ['worktree', 'staged'] } })),
  schema('git_storia', 'Read-only git history of the chat folder: the latest commits (hash, author, date, subject). "limite" 1-50.', oggetto({ limite: { type: 'integer' } })),
  schema('trascritto_leggi', 'Read the whole chat transcript in pages, compacted parts included: messages, tool calls and short results. "pagina" starts at 1; the last page is the newest.',
    oggetto({ pagina: { type: 'integer' } })),
  schema('uscita_strumento', 'Read the full output of one tool call of the chat agent, by its id as shown in trascritto_leggi.', oggetto({ id: { type: 'string' } }, ['id'])),
  schema('contesto_stato', 'How full the chat context is: tokens used, window and percent.', oggetto({})),
  schema('spesa_sessione', 'What this chat has spent so far, and what the Assistant spent.', oggetto({})),
])
export const ATTREZZI_NUOVI_LATO = Object.freeze(new Set(SCHEMI_NUOVI_LATO.map((a) => a.function.name)))
const differitiDelLato = new Map(SCHEMI_NUOVI_LATO.map((a) => [a.function.name, a]))

/* L'alternativa di lettura per ogni rifiuto: chi viene rifiutato sa cosa fare invece, e non ritenta a vuoto. */
const ALTERNATIVE = Object.freeze({
  shell: 'for git use tool_call with git_stato, git_diff or git_storia; for files use leggi or cerca',
  prova: 'read the last test output with tool_call uscita_strumento, or the transcript with trascritto_leggi',
  conversation_search: 'use tool_call with trascritto_leggi',
  process_output: 'use tool_call with uscita_strumento',
  goal_status: 'use tool_call with trascritto_leggi',
})
const ALTERNATIVA_DI_SERIE = 'use leggi, cerca or elenca for files, or tool_call with trascritto_leggi for the chat'

/** Il rifiuto per un attrezzo fuori elenco: dice che l'Assistente legge soltanto e nomina l'alternativa di lettura. */
export function rifiutoALato(nome, motivo = null) {
  const alternativa = ALTERNATIVE[nome] ?? ALTERNATIVA_DI_SERIE
  return `REFUSED. ${motivo ?? `The Assistant only reads: "${nome}" is not one of its tools.`} Nothing was done. Instead, ${alternativa}.`
}

function argomentiDi(grezzi) {
  if (grezzi && typeof grezzi === 'object' && !Array.isArray(grezzi)) return grezzi
  try { const letti = JSON.parse(String(grezzi ?? '') || '{}'); return letti && typeof letti === 'object' && !Array.isArray(letti) ? letti : null } catch { return null }
}

/**
 * IL PRIMO MURO (e, dentro, il secondo): decide se una chiamata dell'Assistente si esegue.
 * → `{ nome, argomenti }` (l'attrezzo VERO, spacchettato da `tool_call`) oppure `{ rifiuto }` (testo per il modello).
 * @param {string} nome il nome scritto dal modello
 * @param {unknown} grezzi gli argomenti (testo JSON o oggetto)
 * @param {{ offerti?: Set<string>, ponte?: boolean, elenco?: Set<string> }} [giro] i nomi fra i `tools` del giro, se c'è la strada dei
 *   differiti; `elenco` lo cambiano SOLO le prove del secondo muro (un elenco cresciuto per errore)
 */
export function bloccatoALato(nome, grezzi, { offerti = new Set(), ponte = false, elenco = ATTREZZI_LATO } = {}) {
  const argomenti = argomentiDi(grezzi)
  if (argomenti === null) return { rifiuto: `REFUSED. The arguments of "${nome}" are not a JSON object. Nothing was done.` }
  let vero = nome
  let dati = argomenti
  let dalPonte = false
  if (nome === NOME_CHIAMATA_ATTREZZO) {
    if (!ponte) return { rifiuto: rifiutoALato(nome, 'The tools loaded on demand are not available in this chat.') }
    vero = typeof argomenti.name === 'string' ? argomenti.name.trim() : ''
    if (!vero) return { rifiuto: `REFUSED. ${NOME_CHIAMATA_ATTREZZO} needs \`name\`: a tool listed by ${NOME_RICERCA_ATTREZZI}. Nothing was done.` }
    if (NOMI_DEL_PONTE.includes(vero)) return { rifiuto: `REFUSED. ${vero} is called directly, not through ${NOME_CHIAMATA_ATTREZZO}. Nothing was done.` }
    dati = argomentiDi(argomenti.arguments ?? {})
    if (dati === null) return { rifiuto: `REFUSED. ${NOME_CHIAMATA_ATTREZZO}: \`arguments\` for ${vero} must be an object. Nothing was done.` }
    dalPonte = true
  }
  /* secondo muro: ciò che il livello di sola lettura nega resta negato, qualunque cosa dica l'elenco */
  if (attrezziNegatiDalLivello({ livelloAccesso: LIVELLO_DELL_ASSISTENTE }).has(vero)) return { rifiuto: rifiutoALato(vero) }
  if (ATTREZZI_NUOVI_LATO.has(vero)) {
    /* gli attrezzi nuovi non sono fra i `tools` del giro: si raggiungono SOLO da `tool_call`; con un altro modello (scelta F) si offrono
       diretti, e allora stanno fra gli `offerti` di quella richiesta, che è solo dell'Assistente */
    if (!dalPonte && !offerti.has(vero)) return { rifiuto: `REFUSED. "${vero}" is reached only through ${NOME_CHIAMATA_ATTREZZO}: call ${NOME_CHIAMATA_ATTREZZO} with {"name":"${vero}","arguments":{…}}. Nothing was done.` }
    return { nome: vero, argomenti: dati }
  }
  if (!elenco.has(vero)) return { rifiuto: rifiutoALato(vero) }
  if (NOMI_DEL_PONTE.includes(vero) && !ponte) return { rifiuto: rifiutoALato(vero, 'The tools loaded on demand are not available in this chat.') }
  /* una lettura del Piano che la chat non offre (spenta, o tolta dal permesso): l'Assistente non l'ha più della chat */
  if (!NOMI_DEL_PONTE.includes(vero) && !offerti.has(vero)) return { rifiuto: rifiutoALato(vero, `"${vero}" is not available in this chat.`) }
  return { nome: vero, argomenti: dati }
}

/* ---------------------------------------------------------------- rete ---------------------------------------------------------------- */

/* I pezzi di un indirizzo che possono portare testo: valori della query, segmenti del percorso, frammento, nomi del sito. */
function pezziDellIndirizzo(url) {
  let u
  try { u = new URL(String(url ?? '')) } catch { return [String(url ?? '')] }
  const decodifica = (s) => { try { return decodeURIComponent(s.replace(/\+/gu, ' ')) } catch { return s } }
  const pezzi = [...u.hostname.split('.'), ...u.pathname.split('/').map(decodifica), decodifica(u.hash.replace(/^#/u, ''))]
  for (const [chiave, valore] of u.searchParams) pezzi.push(chiave, valore)
  if (u.username) pezzi.push(decodifica(u.username))
  if (u.password) pezzi.push(decodifica(u.password))
  return pezzi.filter(Boolean)
}

/**
 * LA SECONDA RETE (owner 11/11/2026 21:40, «Carta per ogni indirizzo»): un testo di almeno 8 caratteri dell'indirizzo che sta in ciò che è
 *   stato letto (file, esiti, conversazione), senza badare alle maiuscole. NON decide più niente: la carta c'è comunque dopo una lettura
 *   (revisore A: minuscolo, maiuscolo, sottodominio, pezzi, base64 ed esadecimale la aggirano). Serve solo a dirlo sulla carta.
 */
export const LUNGHEZZA_MINIMA_DEL_PEZZO = 8
export function indirizzoColContenuto(testoIndirizzo, letti = []) {
  const corpo = letti.filter((t) => typeof t === 'string' && t).join('\n').toLowerCase()
  if (!corpo) return false
  const candidati = new Set()
  for (const pezzo of pezziDellIndirizzo(testoIndirizzo)) {
    for (const parola of [pezzo, ...pezzo.split(/[\s,;&=]+/u)]) {
      const p = parola.trim()
      if (p.length >= LUNGHEZZA_MINIMA_DEL_PEZZO) candidati.add(p)
    }
  }
  for (const c of candidati) if (corpo.includes(c.toLowerCase())) return true
  return false
}

/** Il solo dominio di un indirizzo: l'unica cosa della rete che il diario dello scambio conserva (revisore B, GIALLO-4). */
export function dominioDi(testo) {
  try { return new URL(String(testo ?? '')).hostname.slice(0, 160) } catch { return '' }
}

const RIFIUTO_CARTA_NEGATA = 'REFUSED. The person said no on the card for this address. Nothing was sent. Answer without it, and do not try another address for the same thing.'
/* giudice v1584 punto 1 (revisore A, GIALLO-1): la carta mostra al più tanti caratteri; un indirizzo più lungo NON parte tagliato né intero:
   non si consente ciò che la persona non vede, e un indirizzo tagliato non è quello chiesto */
export const INDIRIZZO_MASSIMO_SULLA_CARTA = 4_000
const RIFIUTO_TROPPO_LUNGO = `REFUSED. The address is too long: over ${INDIRIZZO_MASSIMO_SULLA_CARTA} characters, more than the person's card can show in full, and nothing is opened that the person cannot see. Nothing was sent. Use a shorter address, or answer without it.`
/* giudice v1596 punto 4 (revisore C, regola 375): senza fornitore della ricerca la carta non cambierebbe niente, e il diario direbbe «ha cercato» */
const RIFIUTO_SENZA_FORNITORE = 'REFUSED. Web search is not set up in this app: no provider was chosen. Nothing was sent. Answer from what you can read, and say the person can set up web search in Settings.'
/* giudice v1584 punto 2 (revisore A, GIALLO-2): come la chat (`talosHarness.mjs`, `rifiutiDalTestoNelGiro >= 2`), due no bastano */
export const NO_PRIMA_DI_FERMARSI = 2
const RIFIUTO_SENZA_CARTA = 'REFUSED. After a read, every web address of the Assistant needs the person\'s card on the PC, and this request comes from a device that cannot show it. Nothing was sent. Tell the person to open the PC if they want it.'

/* --------------------------------------------------------------- esecuzione -------------------------------------------------------------- */

const taglia = (testo, tetto) => {
  const s = String(testo ?? '')
  return s.length <= tetto ? s : `${s.slice(0, tetto)}\n[… ${s.length - tetto} more characters not shown]`
}

/**
 * Esegue UNA chiamata già passata da `bloccatoALato`. Le porte (`ctx`) le dà il registro; ogni porta che manca dice «non disponibile».
 * @returns {Promise<{ esito: string, letto: boolean, diario: { nome: string, cosa: string, rifiutato: boolean } }>}
 */
export async function eseguiAttrezzoALato({ nome, argomenti }, ctx = {}) {
  const diario = (cosa, rifiutato = false) => ({ nome, cosa: String(cosa ?? '').slice(0, 160), rifiutato })
  const nonDisponibile = () => ({ esito: `"${nome}" is not available here. Nothing was done.`, letto: false, diario: diario('', true) })
  try {
    if (nome === NOME_RICERCA_ATTREZZI) return { esito: cercaAttrezzi(differitiDelLato, argomenti), letto: false, diario: diario((argomenti.queries ?? []).toString()) }
    if (nome === NOME_DESCRIZIONE_ATTREZZI) return { esito: descriviAttrezzi(differitiDelLato, argomenti), letto: false, diario: diario((argomenti.names ?? []).toString()) }
    if (nome === 'time_now') return { esito: new Date(typeof ctx.ora === 'function' ? ctx.ora() : Date.now()).toISOString(), letto: false, diario: diario('') }
    if (nome === 'leggi' || nome === 'elenca' || nome === 'cerca') {
      if (typeof ctx.file !== 'function') return nonDisponibile()
      const r = await ctx.file(nome, argomenti)
      return { esito: taglia(r.esito, TETTI_ASSISTENTE.esito), letto: r.rifiutato !== true, diario: { ...diario(r.cosa ?? '', r.rifiutato === true), ...(typeof r.righe === 'string' && r.righe ? { righe: r.righe } : {}) } }
    }
    if (nome === 'naviga' || nome === 'web_search') {
      const testo = nome === 'naviga' ? String(argomenti.url ?? '') : String(argomenti.query ?? '')
      /* ⛔ nel diario (che si salva con la chat e arriva ai dispositivi) solo il fatto e il dominio, MAI l'indirizzo né la ricerca */
      const rete = (rifiutato, carta = null) => ({ nome, cosa: nome === 'naviga' ? dominioDi(testo) : '', rifiutato, ...(carta ? { carta } : {}) })
      const permesso = ctx.permessiPerAttrezzo?.[nome]
      if (permesso === 'nega') return { esito: rifiutoALato(nome, 'The network is switched off for this chat.'), letto: false, diario: rete(true) }
      /* le due guardie PRIMA della carta: una carta deve poter cambiare qualcosa, e mostrare tutto ciò che parte */
      if (nome === 'web_search' && ctx.ricercaPronta === false) return { esito: RIFIUTO_SENZA_FORNITORE, letto: false, diario: { ...rete(true), motivo: 'senza-fornitore' } }
      if (testo.length > INDIRIZZO_MASSIMO_SULLA_CARTA) return { esito: RIFIUTO_TROPPO_LUNGO, letto: false, diario: { ...rete(true), motivo: 'troppo-lungo' } }
      /* ⛔ Owner 11/11/2026 21:40, «Carta per ogni indirizzo»: dopo una lettura qualsiasi (file, chat, riassunto, domande di prima) ogni
         indirizzo mostra la carta con l'indirizzo INTERO, anche in Accesso pieno. La seconda rete (`indirizzoColContenuto`) non decide: lo
         dice sulla carta. Una richiesta che non può mostrare carte (telefono, CLI) riceve un rifiuto secco, mai un'attesa. */
      const contieneLetto = indirizzoColContenuto(testo, ctx.letti ?? [])
      const dopoUnaLettura = ctx.haLetto === true || (Array.isArray(ctx.letti) && ctx.letti.length > 0)
      const porta = nome === 'naviga' ? ctx.apriPagina : ctx.cercaSulWeb
      let carta = null
      if (dopoUnaLettura || permesso === 'chiedi' || contieneLetto) {
        if (typeof ctx.chiediCarta !== 'function') return { esito: RIFIUTO_SENZA_CARTA, letto: false, diario: rete(true, 'nessuna') }
        const si = await ctx.chiediCarta({ nome, indirizzo: testo, contieneLetto })
        if (si !== true) return { esito: RIFIUTO_CARTA_NEGATA, letto: false, diario: rete(true, 'no') }
        carta = 'si'
      }
      if (typeof porta !== 'function') return nonDisponibile()
      return { esito: taglia(await porta(argomenti), TETTI_ASSISTENTE.esito), letto: true, diario: rete(false, carta) }
    }
    if (ATTREZZI_NUOVI_LATO.has(nome)) {
      const porta = ctx.nuovi?.[nome]
      if (typeof porta !== 'function') return nonDisponibile()
      const r = await porta(argomenti)
      return { esito: taglia(r, TETTI_ASSISTENTE.esito), letto: true, diario: diario(argomenti.percorso ?? argomenti.id ?? argomenti.pagina ?? '') }
    }
    return nonDisponibile()
  } catch (errore) {
    return { esito: `"${nome}" failed: ${errore instanceof Error ? errore.message : String(errore)}. Nothing was changed.`, letto: false, diario: diario('', true) }
  }
}

/* ---------------------------------------------------------------- il ciclo ---------------------------------------------------------------- */

const nomiDi = (attrezzi) => new Set((Array.isArray(attrezzi) ? attrezzi : []).map((a) => a?.function?.name).filter((n) => typeof n === 'string'))
/** Il nome vero di una chiamata: quello scritto, o quello dentro `tool_call`. */
const nomeVeroDi = (c) => {
  if (c.function.name !== NOME_CHIAMATA_ATTREZZO) return c.function.name
  const a = argomentiDi(c.function.arguments)
  return typeof a?.name === 'string' ? a.name.trim() : ''
}
/** La strada dei differiti c'è se il giro offre `tool_search` e `tool_call`. */
export const haIlPonte = (attrezzi) => { const n = nomiDi(attrezzi); return n.has(NOME_RICERCA_ATTREZZI) && n.has(NOME_CHIAMATA_ATTREZZO) }

/**
 * Il ciclo dei passi: al più `tetti.passi` chiamate al modello, ognuna con gli STESSI `attrezzi` (la lista del giro, byte per byte).
 * `chiamaModello({ messaggi, attrezzi })` → `{ testo, tagliata?, chiamate?: [{ id, function: { name, arguments } }], usage? }`.
 * `soloTesto`: nessuna chiamata si esegue (il giro non ha la strada dei differiti).
 * @returns {Promise<{ testo: string, tagliata: boolean, passi: number, alTetto: boolean, diario: object[], letti: number }>}
 */
export async function cicloDellAssistente({ chiamaModello, messaggi, attrezzi = [], ctx = {}, tetti = TETTI_ASSISTENTE, segnale = null, soloTesto = false, contatoreNo = { n: 0 } }) {
  const offerti = nomiDi(attrezzi)
  /* giudice v1596 punto 4: senza fornitore la ricerca web non è fra gli strumenti dell'Assistente, anche se il giro della chat la elenca
     (i `tools` del giro restano byte per byte, per la cache: la domanda lo dice al modello, e qui si rifiuta prima di ogni carta) */
  const senzaRicerca = ctx.ricercaPronta === false
  if (senzaRicerca) offerti.delete('web_search')
  /* giudice v1605 (revisore A): i no si contano per la DOMANDA; chi fa più tentativi della stessa domanda passa lo stesso `contatoreNo` */
  const ponte = haIlPonte(attrezzi)
  const corrente = [...messaggi]
  const diario = []
  const letti = Array.isArray(ctx.letti) ? ctx.letti : []
  let quanteLetture = 0
  let ultimoTesto = ''
  for (let passo = 1; passo <= tetti.passi; passo += 1) {
    segnale?.throwIfAborted?.()
    const r = await chiamaModello({ messaggi: corrente, attrezzi })
    ultimoTesto = String(r?.testo ?? '')
    const chiamate = Array.isArray(r?.chiamate) ? r.chiamate.filter((c) => c && typeof c.function?.name === 'string') : []
    /* senza la strada dei differiti (`soloTesto`) una chiamata di strumento non si esegue mai: conta solo il testo, come la chat a lato di prima */
    if (chiamate.length === 0 || soloTesto) return { testo: ultimoTesto, tagliata: r?.tagliata === true, passi: passo, alTetto: false, diario, letti: quanteLetture }
    if (passo === tetti.passi) break
    corrente.push({ role: 'assistant', content: ultimoTesto || null, tool_calls: chiamate.map((c) => ({ id: c.id, type: 'function', function: { name: c.function.name, arguments: typeof c.function.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function.arguments ?? {}) } })) })
    for (const c of chiamate) {
      /* uno Stop (della chat o del pannello) a metà passo: nessuna chiamata dopo, nemmeno nello stesso passo */
      segnale?.throwIfAborted?.()
      const deciso = bloccatoALato(c.function.name, c.function.arguments, { offerti, ponte })
      let esito
      if (deciso.rifiuto && senzaRicerca && nomeVeroDi(c) === 'web_search') {
        esito = RIFIUTO_SENZA_FORNITORE
        diario.push({ nome: 'web_search', cosa: '', rifiutato: true, motivo: 'senza-fornitore' })
      } else if (deciso.rifiuto) {
        esito = deciso.rifiuto
        diario.push({ nome: c.function.name, cosa: '', rifiutato: true })
      } else {
        const fatto = await eseguiAttrezzoALato(deciso, { ...ctx, letti })
        esito = fatto.esito
        diario.push(fatto.diario)
        if (fatto.letto) { quanteLetture += 1; letti.push(esito) }
        if (fatto.diario?.carta === 'no') contatoreNo.n += 1
      }
      corrente.push({ role: 'tool', tool_call_id: c.id, content: esito })
      /* due no: la domanda si ferma qui, senza altre carte né altri passi; la riga la scrive il pannello (`fermataDaiNo`) */
      if (contatoreNo.n >= NO_PRIMA_DI_FERMARSI) return { testo: ultimoTesto, tagliata: false, passi: passo, alTetto: false, fermataDaiNo: true, diario, letti: quanteLetture }
    }
  }
  return { testo: ultimoTesto, tagliata: false, passi: tetti.passi, alTetto: true, diario, letti: quanteLetture }
}

/* ------------------------------------------------------------ altro modello ------------------------------------------------------------- */

/**
 * Scelta F (16:55, Hermes `agent/side_question.py:8`, «route the fork elsewhere with a compact digest»): un modello diverso da quello
 *   della chat non ha la sua cache, e riceve un riassunto compatto della conversazione più gli strumenti, offerti direttamente.
 */
export function riassuntoCompatto(messaggi, tetto = TETTI_ASSISTENTE.riassunto) {
  const righe = []
  for (const m of Array.isArray(messaggi) ? messaggi : []) {
    if (m?.role === 'system') continue
    const testo = typeof m?.content === 'string' ? m.content
      : Array.isArray(m?.content) ? m.content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join(' ') : ''
    const chiamate = Array.isArray(m?.tool_calls) ? m.tool_calls.map((c) => `${c?.function?.name ?? '?'}(${String(c?.function?.arguments ?? '').slice(0, 120)})`).join(', ') : ''
    const chi = m?.role === 'user' ? 'Person' : m?.role === 'assistant' ? 'Agent' : m?.role === 'tool' ? 'Tool result' : String(m?.role ?? '?')
    const corpo = m?.role === 'tool' ? testo.slice(0, 300) : testo
    if (corpo.trim() || chiamate) righe.push(`${chi}: ${corpo.trim()}${chiamate ? ` [calls: ${chiamate}]` : ''}`)
  }
  let testo = righe.join('\n')
  if (testo.length > tetto) testo = `[Older parts omitted: read them with trascritto_leggi.]\n${testo.slice(testo.length - tetto)}`
  return testo
}

/** Gli strumenti per un altro modello: le letture del giro che l'Assistente esegue, più gli attrezzi nuovi, offerti direttamente. */
export function attrezziPerAltroModello(attrezziDelGiro, { ricercaPronta = true } = {}) {
  const letture = (Array.isArray(attrezziDelGiro) ? attrezziDelGiro : []).filter((a) => ATTREZZI_LATO.has(a?.function?.name) && !NOMI_DEL_PONTE.includes(a.function.name)
    && !(ricercaPronta === false && a.function.name === 'web_search'))
  return [...letture, ...SCHEMI_NUOVI_LATO]
}

/* -------------------------------------------------------------- trascritto -------------------------------------------------------------- */

/**
 * Il trascritto INTERO dagli eventi della sessione (anche ciò che una compattazione ha tolto ai messaggi): una voce per messaggio della
 *   persona, testo dell'agente, chiamata di attrezzo (col suo id) ed esito accorciato.
 */
export function trascrittoDaEventi(eventi) {
  const voci = []
  const testi = new Map()
  const chiamate = new Map()
  for (const e of Array.isArray(eventi) ? eventi : []) {
    if (e?.type === 'RunStarted' && typeof e.input?.consegna === 'string') voci.push({ chi: 'person', testo: e.input.consegna, ...(Number.isSafeInteger(e._sequenza) ? { giro: e._sequenza } : {}) })
    else if (e?.type === 'TextMessageStart' && typeof e.messageId === 'string') { const v = { chi: 'agent', testo: '' }; testi.set(e.messageId, v); voci.push(v) }
    else if (e?.type === 'TextMessageContent' && testi.has(e.messageId)) testi.get(e.messageId).testo += String(e.delta ?? '')
    else if (e?.type === 'ToolCallStart' && typeof e.toolCallId === 'string') { const v = { chi: 'tool', id: e.toolCallId, nome: String(e.toolCallName ?? ''), argomenti: '', esito: null }; chiamate.set(e.toolCallId, v); voci.push(v) }
    else if (e?.type === 'ToolCallArgs' && chiamate.has(e.toolCallId)) chiamate.get(e.toolCallId).argomenti += String(e.delta ?? '')
    else if (e?.type === 'ToolCallResult' && chiamate.has(e.toolCallId)) chiamate.get(e.toolCallId).esito = typeof e.content === 'string' ? e.content : JSON.stringify(e.content ?? '')
    else if (e?.type === 'CUSTOM' && /compatt/iu.test(String(e.name ?? ''))) voci.push({ chi: 'note', testo: 'The conversation was compacted here; everything above is still in this transcript.' })
  }
  return voci.filter((v) => v.chi !== 'agent' || v.testo.trim())
}

/** Una pagina del trascritto, in testo. Senza pagina: l'ultima (la più recente). */
export function paginaDelTrascritto(voci, pagina, perPagina = TETTI_ASSISTENTE.righePagina) {
  const totale = Math.max(1, Math.ceil(voci.length / perPagina))
  const n = Number.isInteger(pagina) && pagina >= 1 ? Math.min(pagina, totale) : totale
  const fetta = voci.slice((n - 1) * perPagina, n * perPagina)
  const righe = fetta.map((v, i) => {
    const numero = (n - 1) * perPagina + i + 1
    if (v.chi === 'tool') return `#${numero} tool ${v.nome} id=${v.id} args=${v.argomenti.slice(0, 200)}${v.esito === null ? ' (no result yet)' : ` → ${taglia(v.esito, TETTI_ASSISTENTE.anteprimaEsito)}`}`
    return `#${numero} ${v.chi}: ${v.testo}`
  })
  return `Transcript page ${n} of ${totale} (${voci.length} entries).\n${righe.join('\n')}`
}
