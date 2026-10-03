/*
 * ⭐ 27/09/2026, decisione owner (memoria `decisioni-owner-capacita-sezioni-27-09`, punto 3) — LE CONVERSAZIONI E LA BOARD
 *   PER IL MODELLO, in UN attrezzo a quattro forme, come `session_search` di Hermes (`tools/session_search_tool.py:650-710`,
 *   clone `65ad529`):
 *   - nessun argomento  = SFOGLIA: la Board — le conversazioni più recenti con stato, modello, giri, token, motivo di
 *     chiusura (Hermes: «no args = browse recent sessions», `_list_recent_sessions` :479-505);
 *   - `query`           = CERCA: le conversazioni che contengono quelle parole, la più pertinente prima, con l'estratto del
 *     messaggio migliore (Hermes: discovery FTS5; qui la ricerca per parole di `ricerca-per-parole.mjs`, perché le sessioni
 *     stanno già in memoria nel registro e sono poche — 69 journal, 9,4 MB il 27/09);
 *   - `conversation_id` = LEGGI a pagine;
 *   - `conversation_id` + `around_message` = SCORRI intorno a un messaggio (Hermes: `session_id` + `around_message_id`).
 *
 * Regole portate da Hermes, con la riga:
 *   - la conversazione CORRENTE non c'è (`hidden = {current_session_id, …}`, :495-497);
 *   - le FIGLIE si nascondono (`_HIDDEN_SESSION_SOURCES = ("kanban", "subagent", "tool")`, :20-21);
 *   - le AUTOMAZIONI si cercano ma vanno IN CODA (`_DEMOTED_SESSION_SOURCES = ("cron",)`, :22-31: il loro vocabolario
 *     ripetuto «affama» le conversazioni della persona, #19434);
 *   - i messaggi hanno un TETTO (`_READ_MAX_CONTENT = 2000`, :39) e si dice quanto manca;
 *   - senza risultati si dice come allargare (:379-383).
 *   - il link alla conversazione si scrive così com'è («write its `link` value verbatim», :664-665).
 * PURO: niente I/O. Il registro passa le righe di `elenca()` e gli eventi di ogni voce.
 */
import { chiedeTutto, paroleDellaRicerca, piega, punteggioPerParole } from './ricerca-per-parole.mjs';
import { testoPerLoSchermo } from './kernel/confine-dati.mjs'; // F-027: l'estratto di un risultato senza l'impalcatura del confine

export const LINK_CONVERSAZIONE = 'talos://conversazione/';
export const LIMITI_CONVERSAZIONI = Object.freeze({
  sfogliaPredefinito: 10, sfogliaMassimo: 30,
  cercaPredefinito: 3, cercaMassimo: 10,
  finestraPredefinita: 5, finestraMassima: 20,
  caratteriPerMessaggio: 2_000, caratteriPerMessaggioScorrendo: 8_000, caratteriPerPagina: 12_000, caratteriEstratto: 240,
});

/** Stato di una riga dell'elenco, con la stessa precedenza della Board (`frontend/src/components/session-item.js:69-94`). */
export function statoDellaConversazione(riga) {
  if (riga.inAttesaApprovazione || riga.inAttesaDomanda || riga.inAttesaPiano) return 'waiting for the person';
  if (riga.interrotta) return 'interrupted';
  if (!riga.conclusa) return 'running';
  if (riga.ultimoEsito === 'errore' && riga.motivoChiusura === 'fermata') return 'stopped by the person';
  if (riga.ultimoEsito === 'errore') return 'error';
  if (riga.ultimoEsito === 'successo') return 'done';
  return 'unknown';
}

const STATI_FILTRO = Object.freeze({
  running: 'running', waiting: 'waiting for the person', done: 'done', error: 'error',
  stopped: 'stopped by the person', interrupted: 'interrupted',
});
export const FILTRI_DI_STATO = Object.freeze(Object.keys(STATI_FILTRO));

const MOTIVI = Object.freeze({ 'fine-lavoro': 'finished the work', 'giri-finiti': 'ran out of turns', fermata: 'stopped by the person', errore: 'error' });

const intero = (valore, predefinito, minimo, massimo) => {
  const n = Math.trunc(Number(valore));
  return Number.isFinite(n) ? Math.min(Math.max(n, minimo), massimo) : predefinito;
};
const unaRiga = (testo) => String(testo ?? '').replace(/\s+/g, ' ').trim();
const taglia = (testo, max) => (testo.length > max ? `${testo.slice(0, max)}… [${testo.length - max} more characters]` : testo);
const titoloDi = (riga) => unaRiga(riga.nome) || unaRiga(riga.taskId) || 'Untitled conversation';
const ultimaAttivita = (riga) => riga.ultimaRispostaAlle || riga.avviataAlle || '';
/*
 * Quando, detto come la Board a schermo («2 min fa», `frontend/src/components/board.js` `tempoBoard`) più l'orario marcato UTC.
 * ⛔ 27/09/2026, collaudo vero sul 4174: col solo ISO troncato («2026-09-27 10:37») il modello ha detto «finita ieri mattina»
 *   di una conversazione di un'ora prima — l'orario era UTC e non lo diceva, e il modello non sa che ore sono.
 */
export function quando(iso, adesso = Date.now()) {
  const t = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(t)) return '';
  const minuti = Math.floor((adesso - t) / 60_000);
  const eta = minuti < 1 ? 'just now'
    : minuti < 60 ? `${minuti} ${minuti === 1 ? 'minute' : 'minutes'} ago`
      : minuti < 48 * 60 ? `${Math.floor(minuti / 60)} ${Math.floor(minuti / 60) === 1 ? 'hour' : 'hours'} ago`
        : `${Math.floor(minuti / 1440)} days ago`;
  return `${minuti < 0 ? 'in the future' : eta} (${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC)`;
}
const link = (id) => `${LINK_CONVERSAZIONE}${id}`;
const migliaia = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
/** I giri come li conta la Board (`frontend/src/components/consumo-sessione.js:82-88`): misurati + fermati; `null` se nessuno dei due. */
function giriDellaRiga(r) {
  const misurati = Number.isFinite(r.usageSessione?.giri) ? r.usageSessione.giri : null;
  const fermati = Number.isSafeInteger(r.giriFermati) && r.giriFermati > 0 ? r.giriFermati : 0;
  return misurati === null && fermati === 0 ? null : (misurati ?? 0) + fermati;
}

/**
 * I messaggi di una conversazione, dagli eventi del journal: la persona (`RunStarted.input.consegna`), il modello
 * (`TextMessage*` per `messageId`) e una riga per ogni attrezzo concluso. Il ragionamento resta fuori. Numerati da 1.
 * @returns {{n:number, ruolo:'person'|'model'|'tool', testo:string}[]}
 */
export function messaggiDaEventi(eventi) {
  const messaggi = [];
  const testi = new Map();
  const attrezzi = new Map();
  for (const e of eventi || []) {
    switch (e?.type) {
      case 'RunStarted': {
        const consegna = e.input?.consegna;
        if (typeof consegna === 'string' && consegna.trim()) messaggi.push({ ruolo: 'person', testo: consegna });
        break;
      }
      case 'TextMessageStart':
        if (!testi.has(e.messageId)) testi.set(e.messageId, messaggi.push({ ruolo: 'model', testo: '' }) - 1);
        break;
      case 'TextMessageContent': {
        let i = testi.get(e.messageId);
        if (i === undefined) { i = messaggi.push({ ruolo: 'model', testo: '' }) - 1; testi.set(e.messageId, i); }
        messaggi[i].testo += typeof e.delta === 'string' ? e.delta : '';
        break;
      }
      case 'ToolCallStart':
        attrezzi.set(e.toolCallId, { nome: e.toolCallName || 'tool', argomenti: '' });
        break;
      case 'ToolCallArgs': {
        const a = attrezzi.get(e.toolCallId);
        if (a) a.argomenti += typeof e.delta === 'string' ? e.delta : '';
        break;
      }
      case 'ToolCallResult': {
        const a = attrezzi.get(e.toolCallId);
        if (!a) break;
        attrezzi.delete(e.toolCallId);
        /* F-027: i 200 caratteri sono del CONTENUTO, non della riga d'apertura del confine; il risultato intero di
           `conversation_search` torna al modello dentro un confine suo (`talosHarness.mjs`, ramo delle sezioni). */
        messaggi.push({ ruolo: 'tool', testo: `${a.nome} ${taglia(unaRiga(a.argomenti), 160)} → ${taglia(unaRiga(testoPerLoSchermo(e.content)), 200)}` });
        break;
      }
      default:
    }
  }
  return messaggi.filter((m) => m.testo.trim() !== '').map((m, i) => ({ n: i + 1, ...m }));
}

/** Le righe che il modello può vedere: niente figlie, niente conversazione corrente. */
function visibili(righe, correnteId) {
  return (righe || []).filter((r) => r && !r.padreId && r.sessionId !== correnteId);
}

/**
 * SFOGLIA: la Board. Dalla più recente; filtri facoltativi per stato e cartella.
 * @param {object[]} righe le righe di `sessionRegistry.elenca()`, con `cartella` e `giri` aggiunti dal registro
 */
export function sfogliaConversazioni(righe, { limit, status, folder, correnteId = null, adesso = Date.now() } = {}) {
  const limite = intero(limit, LIMITI_CONVERSAZIONI.sfogliaPredefinito, 1, LIMITI_CONVERSAZIONI.sfogliaMassimo);
  const statoCercato = typeof status === 'string' ? STATI_FILTRO[status] : undefined;
  if (typeof status === 'string' && status && !statoCercato) {
    return `conversation_search: unknown status «${status}». Use one of: ${FILTRI_DI_STATO.join(', ')}.`;
  }
  const cartella = typeof folder === 'string' && folder.trim() ? piega(folder.trim()).replace(/\\/g, '/') : null;
  const tutte = visibili(righe, correnteId)
    .filter((r) => !statoCercato || statoDellaConversazione(r) === statoCercato)
    .filter((r) => !cartella || piega(String(r.cartella ?? '')).replace(/\\/g, '/').includes(cartella))
    .sort((a, b) => String(ultimaAttivita(b)).localeCompare(String(ultimaAttivita(a))));
  if (tutte.length === 0) {
    return statoCercato || cartella
      ? 'No conversation matches these filters. Call conversation_search without arguments to see the most recent ones.'
      : 'There are no other conversations yet.';
  }
  const pagina = tutte.slice(0, limite);
  const righeTesto = pagina.map((r) => {
    const parti = [statoDellaConversazione(r)];
    if (r.modello) parti.push(`model ${r.modello}`);
    const giri = giriDellaRiga(r);
    if (giri !== null) parti.push(`${giri} ${giri === 1 ? 'turn' : 'turns'}`);
    const token = (r.usageSessione?.prompt_tokens ?? 0) + (r.usageSessione?.completion_tokens ?? 0);
    if (token > 0) parti.push(`${migliaia(token)} tokens`);
    if (r.motivoChiusura && MOTIVI[r.motivoChiusura]) parti.push(`closed: ${MOTIVI[r.motivoChiusura]}`);
    if (r.senzaInterfaccia) parti.push('automation');
    if (quando(ultimaAttivita(r), adesso)) parti.push(`last activity ${quando(ultimaAttivita(r), adesso)}`);
    /* Solo il NOME della cartella: il percorso intero legato a una sessione non esce dal registro (`session-registry.mjs`,
       `cartellePiuUsate`: «mai la mappa sessione→cartella»). Il filtro `folder` lavora sul percorso senza stamparlo. */
    const nomeCartella = String(r.cartella ?? '').replace(/[\\/]+$/u, '').split(/[\\/]/u).pop();
    if (nomeCartella) parti.push(`project ${nomeCartella}`);
    return `- [${titoloDi(r)}](${link(r.sessionId)}) — ${parti.join(' · ')} — id ${r.sessionId}`;
  });
  const testa = `Conversations: showing ${pagina.length} of ${tutte.length}, most recent first.`;
  const coda = 'Pass query= to search inside them, or conversation_id= to read one.';
  return [testa, ...righeTesto, coda].join('\n');
}

/** L'estratto intorno alla prima parola trovata. */
function estratto(testo, parole) {
  const piatto = unaRiga(testo);
  const piegato = piega(piatto);
  let at = -1;
  for (const p of parole) { const i = piegato.indexOf(p); if (i >= 0 && (at < 0 || i < at)) at = i; }
  const max = LIMITI_CONVERSAZIONI.caratteriEstratto;
  if (at < 0 || piatto.length <= max) return taglia(piatto, max);
  const inizio = Math.max(0, at - Math.floor(max / 3));
  return `${inizio > 0 ? '…' : ''}${piatto.slice(inizio, inizio + max)}${inizio + max < piatto.length ? '…' : ''}`;
}

/**
 * CERCA: le conversazioni che contengono le parole. Punteggio della conversazione = titolo ×3 + testo di persona e modello
 * ×1 (ogni parola una volta); l'estratto è il messaggio che ne contiene di più. Automazioni in coda.
 * @param {{riga:object, eventi:object[]}[]} voci
 */
export function cercaConversazioni(voci, { query, limit, correnteId = null, adesso = Date.now() } = {}) {
  if (chiedeTutto(query)) return null; // chi chiama passa a SFOGLIA
  const limite = intero(limit, LIMITI_CONVERSAZIONI.cercaPredefinito, 1, LIMITI_CONVERSAZIONI.cercaMassimo);
  const parole = paroleDellaRicerca(query);
  const ammesse = new Set(visibili(voci.map((v) => v.riga), correnteId).map((r) => r.sessionId));
  const candidati = voci.filter((v) => ammesse.has(v.riga.sessionId)).map((v) => {
    const messaggi = messaggiDaEventi(v.eventi).filter((m) => m.ruolo !== 'tool');
    const corpo = messaggi.map((m) => m.testo).join('\n');
    const punti = punteggioPerParole({ titolo: titoloDi(v.riga), corpo }, parole);
    let migliore = null;
    let puntiMigliore = 0;
    for (const m of messaggi) {
      const p = punteggioPerParole({ corpo: m.testo }, parole);
      if (p > puntiMigliore) { migliore = m; puntiMigliore = p; }
    }
    return { v, punti, migliore };
  });
  const trovate = candidati.filter((c) => c.punti > 0)
    .sort((a, b) => Number(Boolean(a.v.riga.senzaInterfaccia)) - Number(Boolean(b.v.riga.senzaInterfaccia))
      || b.punti - a.punti
      || String(ultimaAttivita(b.v.riga)).localeCompare(String(ultimaAttivita(a.v.riga))));
  if (trovate.length === 0) {
    return `No conversation contains ${parole.map((p) => `«${p}»`).join(', ')}. Try other or fewer words, or call `
      + 'conversation_search without arguments to browse the most recent conversations.';
  }
  const righe = trovate.slice(0, limite).map((c, i) => {
    const r = c.v.riga;
    const testa = `${i + 1}. [${titoloDi(r)}](${link(r.sessionId)}) — ${statoDellaConversazione(r)}`
      + `${r.senzaInterfaccia ? ' · automation' : ''} · last activity ${quando(ultimaAttivita(r), adesso) || 'unknown'} — id ${r.sessionId}`;
    const corpo = c.migliore
      ? `   message #${c.migliore.n} (${c.migliore.ruolo}): ${estratto(c.migliore.testo, parole)}`
      : '   (the words are in the title)';
    return `${testa}\n${corpo}`;
  });
  return [`Conversations: ${trovate.length} contain these words, showing ${Math.min(limite, trovate.length)}, best first.`,
    ...righe,
    'Read one with conversation_id=, or the messages around a hit with conversation_id= and around_message=.'].join('\n');
}

/**
 * LEGGI e SCORRI. Una pagina da `from` fino al tetto di caratteri, oppure la finestra intorno a `around_message`.
 * @param {{riga:object, eventi:object[]}|null} voce
 */
export function leggiConversazione(voce, { conversation_id: id, from, around_message: attorno, window: finestra, correnteId = null } = {}) {
  if (!voce || voce.riga.padreId) return `conversation_search: no conversation with id «${id}». Browse without arguments to see the ids.`;
  if (voce.riga.sessionId === correnteId) return 'conversation_search: that is the current conversation — it is already in front of you.';
  const messaggi = messaggiDaEventi(voce.eventi);
  const r = voce.riga;
  const testa = `Conversation [${titoloDi(r)}](${link(r.sessionId)}) — ${statoDellaConversazione(r)}`
    + `${r.modello ? ` · model ${r.modello}` : ''} · ${messaggi.length} messages.`;
  if (messaggi.length === 0) return `${testa}\nIt has no messages yet.`;
  let scelti;
  let nota;
  let tetto = LIMITI_CONVERSAZIONI.caratteriPerMessaggio;
  if (attorno !== undefined && attorno !== null) {
    tetto = LIMITI_CONVERSAZIONI.caratteriPerMessaggioScorrendo; // scorrendo si vede di più, come Hermes (scroll 4.000 contro read 2.000)
    const centro = intero(attorno, 1, 1, messaggi.length);
    const f = intero(finestra, LIMITI_CONVERSAZIONI.finestraPredefinita, 1, LIMITI_CONVERSAZIONI.finestraMassima);
    scelti = messaggi.slice(Math.max(0, centro - 1 - f), centro + f);
    nota = `Showing messages ${scelti[0].n}-${scelti.at(-1).n} of ${messaggi.length}, around #${centro}.`;
  } else {
    const inizio = intero(from, 1, 1, messaggi.length);
    scelti = [];
    let spesi = 0;
    for (const m of messaggi.slice(inizio - 1)) {
      const costo = Math.min(m.testo.length, LIMITI_CONVERSAZIONI.caratteriPerMessaggio);
      if (scelti.length > 0 && spesi + costo > LIMITI_CONVERSAZIONI.caratteriPerPagina) break;
      scelti.push(m);
      spesi += costo;
    }
    const ultimo = scelti.at(-1).n;
    nota = ultimo < messaggi.length
      ? `Showing messages ${scelti[0].n}-${ultimo} of ${messaggi.length}. Continue with from=${ultimo + 1}.`
      : `Showing messages ${scelti[0].n}-${ultimo} of ${messaggi.length}: the end of the conversation.`;
  }
  const corpo = scelti.map((m) => `#${m.n} ${m.ruolo}: ${taglia(m.testo.trim(), tetto)}`);
  return [testa, ...corpo, nota].join('\n');
}
