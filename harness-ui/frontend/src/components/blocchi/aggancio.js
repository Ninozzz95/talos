/*
 * FE-003, blocco 4 della forma: i blocchi entrano nella chat del PC. `bloccoCodice` di `renderizzaMarkdown` riceve ogni recinto; quello con la
 * lingua del catalogo passa da qui invece di diventare un blocco di codice.
 *
 * ⛔ La coda del messaggio si ridisegna a ogni fotogramma: un blocco in arrivo NON si ricrea. Si tiene vivo (`montaBloccoVivo`) e riceve solo
 *   il pezzo nuovo; il nodo restituito è sempre lo stesso, e alla chiusura del recinto resta lui.
 * ⛔ Un clic diventa UN messaggio della persona: il primo gesto vince (`agisci`). Il gesto sta nel giornale del server: il messaggio porta
 *   `bolla.blocco`, il server ne fa `talos.blocco.azione.v1`, e dopo una ricarica o da un altro dispositivo `spegni` spegne il blocco.
 * ⛔ Quello che scrive passa dal messaggio e dalla carta: qui dentro non c'è nessun consenso.
 */
import { impronta } from '../../../../src/blocchi/impronta.mjs';
import { leggi } from '../../../../src/blocchi/lettore.mjs';
import { LINGUA_DEL_RECINTO } from '../../../../src/blocchi/catalogo.mjs';
import { sorgenteDelBlocco } from '../../../../src/blocchi/recinto.mjs';
import { EVENTO_VERSIONE_DEL_BLOCCO, creaStorico, eventoDellaVersione, rinumeraCorrente, storicoDagliEventi, versioneCorrente } from '../../../../src/blocchi/versioni.mjs';
import { t } from '../lingua.js';
import { disegnaBlocco, montaBloccoVivo, statoDelBlocco } from './guscio.js';
import { avvisaAzione, puoAgire } from './azione.js';
import { testoDelModulo } from './modulo.js';

export { impronta };
export { EVENTO_VERSIONE_DEL_BLOCCO };

export const eRecintoDiBlocco = (lingua) => lingua === LINGUA_DEL_RECINTO;

/** Ciò che viaggia nella bolla del messaggio: mai il valore, che è già il testo. */
export function bloccoPerLaBolla(azione) {
  return { idBlocco: azione.idBlocco, tipo: azione.tipo, chiave: azione.chiave, ...(azione.titolo ? { titolo: azione.titolo } : {}) };
}

/** Il testo del messaggio della persona per un'azione. */
export function testoDellAzione(azione, blocco) {
  return azione.tipo === 'modulo' ? testoDelModulo(blocco, azione.valore) : String(azione.valore ?? '');
}

/*
 * Decisione 142 (owner 04/11/2026): il blocco salvato in Libreria (una voce di testo col sorgente, `src/blocchi/in-libreria.mjs`) si
 * riapre VIVO nel lettore della Libreria. `riconosci` dice se il testo è un blocco completo (il recinto ```talos-blocco si toglie come al
 * salvataggio, `recinto.mjs`); `disegna` lo disegna col guscio della chat, in sola lettura: filtro e ordine sì, nessun clic che diventa
 * un messaggio (la Libreria non è una conversazione), nessun «Apri a lato» né «Salva in Libreria». «Copia» resta, come in chat.
 */
export function bloccoPerIlLettore({ document: doc, copia, bloccoCodice } = {}) {
  return {
    riconosci: (testo) => typeof testo === 'string' && leggi(sorgenteDelBlocco(testo)).stato === 'completo',
    disegna: (testo) => {
      const sorgente = sorgenteDelBlocco(testo);
      return disegnaBlocco(leggi(sorgente), { document: doc, testo: sorgente, soloLettura: true, azioni: {}, copia, bloccoCodice });
    },
  };
}

/* I gesti già fatti, per chiave. Durano quanto la pagina: dopo una ricarica tornano dal giornale. Il primo gesto di una chiave resta: un
   secondo `spegni` della stessa chiave (lo stesso evento rigiocato due volte, o senza valore) non lo riscrive.
   Cura BG3 round 4 (E3): one memory PER CHAT (`chat()`, the chat open when the gesture arrives). A fork keeps the parent's message ids, so
   `posto:m1@0#id` and `nome:b1@m1#id` are the same raw key in the parent and in its fork: one shared memory let the fork's first answer
   win in the parent too (on a tail redraw the parent showed «Fermati qui» while a reload showed its own «Continua»). Hermes answers a
   pending prompt by session AND prompt id (`gateway/session_pending_controls.py:66-71`); Codex keeps each thread's events in its own
   store (`codex-rs/tui/src/app/thread_events.rs:68-73`).
   Cura BG3 round 5 (reviewer A of round 4, BASSO-1): the memory grew with every chat opened in one page life (a plain lookup made a Map
   too, and none was ever dropped). Now a lookup creates nothing and only the `massime` most recently used chats are kept. 16 = four times
   the chats whose page can come back with NO replay (the open one and the `CHAT_PRONTE_MASSIME` = 3 ready ones, chat-pronte.js): a ready
   chat is dropped from here only after 16 other chats were answered or looked at while it waited, and by then the registry of ready chats
   (3 places) has dropped it too, unless every one of them was left while still running. A chat dropped here loses nothing: opened again
   with no ready page, its journal is replayed (`spegni`). Hermes keeps its caches the same way, `move_to_end` on a hit and `popitem(last=
   False)` past the cap (`agent/prompt_builder.py:1397`, `:1456-1458`). */
export const CHAT_CON_GESTI_MASSIME = 16;
export function creaMemoriaAzioni(chat, massime = CHAT_CON_GESTI_MASSIME) {
  const perChat = new Map(); // chat → (key → the first gesture); the insertion order is the order of use
  const voci = (crea) => {
    const c = String(chat() ?? '');
    let v = perChat.get(c);
    if (v) { perChat.delete(c); perChat.set(c, v); return v; } // used now: the most recent
    if (!crea) return null;
    v = new Map();
    perChat.set(c, v);
    while (perChat.size > massime) perChat.delete(perChat.keys().next().value); // the least recently used goes
    return v;
  };
  return {
    cerca: (chiave) => voci(false)?.get(chiave) ?? null,
    segna: (azione) => { const v = voci(true); if (!v.has(azione.chiave)) v.set(azione.chiave, { tipo: azione.tipo, valore: azione.valore }); },
    quante: () => perChat.size,
    /* cura BG3 round 7: a gesture whose send failed is taken back, in ITS chat (the person may be in another one by then) */
    togli: (chiave, diChat) => {
      const v = perChat.get(String(diChat ?? ''));
      const g = v?.get(chiave) ?? null;
      if (g) v.delete(chiave);
      return g;
    },
  };
}

/*
 * G-G2 (06/11/2026), scena 5: la chiave del gesto di un blocco COL NOME è `nome:bN@<messaggio>#<id>` — il nome (forma §1: «b1, b2… mai
 * riusati, stabili fra ricarica, ramo e rigenerazione») e il messaggio del suo v1. Lo stesso testo in un messaggio nuovo è un altro
 * blocco (UIG-5.3b); nel ramo il v1 rigiocato porta il messaggio della madre, e il gesto della madre spegne ancora lui (UIG-5.3c). Senza
 * il v1 il messaggio è `~<conversazione>`. Il controllo del server (`bolla-della-persona.mjs:56`) chiede ':' e `#id` in fondo: c'è.
 * Hermes fa lo stesso: una risposta per domanda, per id (`gateway/session_pending_controls.py:70-71`), e le scelte legate alla generazione
 * che le ha prodotte (`ui-tui/src/gatewayTypes.ts:394-395`). Il blocco senza nome tiene la chiave di prima, `sessione:impronta#id`.
 */

/**
 * @param {{ document: Document, sessione: () => string, consegna: (testo: string, azione: object, blocco: object) => void,
 *           scrivoIo?: Function, copia?: Function, bloccoCodice?: Function, azioni?: object, timer?: object }} o
 * @returns {{ blocco: (testo: string, chiuso: boolean) => HTMLElement, spegni: (chiave: string, gesto?: { tipo?: string, valore?: unknown }) => void,
 *            azzera: () => void, viviAperti: () => number }}
 */
export function creaAggancioBlocchi(o) {
  const memoriaAzioni = creaMemoriaAzioni(() => o.sessione());
  /* i blocchi con un gesto ancora libero, per spegnerli quando l'azione arriva dal giornale */
  const disegnati = []; // [{ nodo, testo, nome, id, holder, regola }]: regola = spento da un gesto del giornale, non da un clic qui
  /* i blocchi che stanno arrivando, di solito uno solo: si riconoscono dal testo, che cresce soltanto */
  const vivi = new Set();
  const origineDi = (testo) => `${o.sessione() ?? ''}:${impronta(testo)}`;
  const messaggioDi = (nome) => perNome.get(nome)?.messaggio || `~${o.sessione() ?? ''}`;
  /*
   * Cura 288, round 2 (A1, A2): a block with NO name, clicked on this page, is keyed by its PLACE: `posto:<message>@<position>#id`, the
   * message that holds it and its index among the shells of that message (the same index the v1's `posizione` uses). Its text said which
   * words, not which block: two twins answered one after the other sent the same key, and the server keeps one action per key, so the
   * second answer was lost; and a key with no owner locked twins the page had left free. assistant-ui gives a tool call with no id of
   * its own `${messageId}-tool-${index}-${partIndex}` (`packages/core/src/react/runtimes/useLocalRuntime.ts:69`) and LangGraph's
   * `lc-toolcall-${messageId}-computer-${partIndex}` (`packages/react-langgraph/src/convertLangChainMessages.ts:280`); Hermes answers a
   * prompt once by its id and says `already_resolved` to a second answer (`gateway/session_pending_controls.py:70-71`). With no host
   * lookup (`o.messaggioDelNodo`), or a key over the server's cap (`TETTI_BOLLA.chiave`, 400), the old `sessione:impronta#id` stays.
   */
  const TETTO_CHIAVE = 400;
  const chiaveDi = (testo, nome, id, posto = null) => {
    if (nome) return `nome:${nome}@${messaggioDi(nome)}#${id}`;
    const delPosto = posto?.chiave ? `posto:${posto.chiave}#${id}` : '';
    return delPosto && delPosto.length <= TETTO_CHIAVE ? delPosto : `${origineDi(testo)}#${id}`;
  };
  const POSTO = /^posto:([^@#]+@\d+)#(.+)$/u;
  const perPosto = new Map(); // `${message}@${position}#${id}` → the gesture (the same object as the raw memory, first wins)
  const sezioniIn = (elemento) => [...elemento.querySelectorAll('section')].filter((x) => x.classList?.contains('gu'));
  /*
   * Where a shell is NOW: its message (the host's element) and its index there, or its parent when the host gives no message. `chiave`
   * only for a real message: the journal key must find the same shell after a reload.
   * Cura 288 round 3 (D3/N4): a shell still inside its message has that place also while the message is off the page (the replay window
   * takes old turns off in the slice that drew them, and «Show earlier» puts them back; a ready chat's page waits in a fragment), so the
   * place is read from the message, not from the document. A shell out of every message is read only while attached.
   */
  const postoDi = (nodo) => {
    if (!nodo) return null;
    const messaggio = typeof o.messaggioDelNodo === 'function' ? (o.messaggioDelNodo(nodo) ?? null) : null;
    const elemento = messaggio !== null && typeof o.elementoDelMessaggio === 'function' ? o.elementoDelMessaggio(messaggio) : null;
    const nelMessaggio = elemento?.contains?.(nodo) === true;
    if (!nelMessaggio && !nodo.isConnected) return null;
    const radice = nelMessaggio ? elemento : nodo.parentNode;
    if (!radice?.querySelectorAll) return null;
    const posizione = sezioniIn(radice).indexOf(nodo);
    if (posizione < 0) return null;
    return { radice, posizione, chiave: radice === elemento ? `${encodeURIComponent(String(messaggio))}@${posizione}` : null };
  };
  /* the drawn shell standing at a place key's place (`<message>@<index>`), looked up from the host's message element (cura 288 round 3, D4) */
  const voceAlPosto = (luogo) => {
    const at = luogo.lastIndexOf('@');
    let messaggio;
    try { messaggio = decodeURIComponent(luogo.slice(0, at)); } catch { return null; }
    const elemento = typeof o.elementoDelMessaggio === 'function' ? o.elementoDelMessaggio(messaggio) : null;
    const nodo = elemento?.querySelectorAll ? sezioniIn(elemento)[Number(luogo.slice(at + 1))] : null;
    return nodo ? (disegnati.find((d) => d.nodo === nodo) ?? null) : null;
  };
  /* a drawn block's place, refreshed while it is on the page and kept once it leaves (a whole redraw looks for it, see `assesta`) */
  const fissaPosto = (voce) => {
    const posto = postoDi(voce?.nodo);
    if (posto) voce.posto = posto;
    return voce?.posto ?? null;
  };
  /* le chiavi date dai clic di questa pagina, per stato del gesto: un clic fatto prima del nome tiene la chiave vecchia (vedi `riconsidera`) */
  const chiaviDate = new WeakMap();
  /*
   * ⛔⛔ Cura BG3 round 7 (reviewer A of round 6, MEDIO): the answer of a block whose SEND failed is taken back (`riapri`, called by the
   * host's `rimettiInvioFallito`/`rimettiNelCompositore`) and never put in the composer: the model wrote it, and the person's Enter ran
   * it as their own command. The clicked holders are kept per chat and raw key OUTSIDE the parked state (the failure can come after the
   * person moved to another chat, and the parked page's holders are the same objects); a taken-back gesture is marked (`annullato`) for
   * the indexes that hold it, and an old key taken back is skipped (`annullate`) until the block is answered again. Bounded: an answer
   * taken back RIAPERTE_MASSIME answers ago is forgotten. Hermes rolls a clarify answer back on a failed send and keeps the card
   * answerable (`apps/desktop/src/store/clarify.ts:366-389`, `components/assistant-ui/clarify/pending.tsx:211-216`).
   */
  const RIAPERTE_MASSIME = 200;
  const chatDi = (c) => String(c ?? '');
  const cliccati = new Map(); // `${chat}\n${raw key}` → Set of the holders clicked on this page with that key
  const annullate = new Set(); // `${chat}\n${raw key}` of the taken-back gestures, till the block is answered again
  const vale = (g) => (g && !g.annullato ? g : null);
  const limita = (raccolta) => { while (raccolta.size > RIAPERTE_MASSIME) raccolta.delete(raccolta.keys().next().value); };
  const annullata = (chiave) => annullate.size > 0 && annullate.has(`${chatDi(o.sessione())}\n${chiave}`);
  /*
   * G-BG2, UIG-5.11 (06/11/2026): a gesture made on a named block BEFORE its v1 carries `nome:bN@~<chat>#id`; once the v1 binds, the same
   * block asks for `nome:bN@<message>#id`. The provisional key stays an alias of its name (the reconciliation of a client-made id with the
   * server's one; Increase still honours the renamed `unique_identifier` as `Idempotency-Key`, increase.com/documentation/unique_identifiers,
   * read 06/11/2026). Indexed by the chat it ARRIVES in, not the chat it names: a fork replays the parent's `~parent` keys in its own chat.
   */
  const TILDE = /^nome:(b[1-9]\d*)@~[^#]*#(.+)$/u;
  const perTilde = new Map(); // `${chat}|${nome}#${id}` → the gesture (the same object as the raw memory, first wins)
  /*
   * G-BG2, UIG-5.2c: an OLD key (`sessione:impronta#id`, a gesture saved before G-G2 names) says which text, not which block. It locks every
   * named block with that text drawn BEFORE it in journal order, and none first drawn after it (a later message with the same words is a new
   * question: Hermes binds a pending answer to the generation that asked it, `ui-tui/src/gatewayTypes.ts:394-395`). The order is the page's
   * drawing order, which on a replay IS the journal order (text, v1, bubble, gesture). `primoDi` keeps, per name, the first drawing of a
   * block with that name, so a redraw or a v2 of a locked block stays locked. A gesture that arrives before ANY block of its text (only a
   * hand-built order; the journal never does it) keeps G-G2's rule: the first name that asks takes it. Indexed by the chat the gesture
   * ARRIVES in, like `perTilde`: a fork replays the parent's key in its own chat.
   * G-BG3, UIG-5.2d: so the parent's `s1:` key and the fork's own `s1-ramo:` key land on the SAME index. It keeps EVERY gesture, one per raw
   * key, in arrival order, each with its order; a named block takes the FIRST gesture that arrived after its first drawing (the fork's own
   * answer on its later twin is not swallowed by the parent's, and a third twin does not take the last one). A branch replays the parent's
   * events in order, each at its own position (Salamander DB `fork_branch`/`replay_branch`, docs.rs/salamander-db, read 06/11/2026).
   */
  const VECCHIA = /^(.*):([^:#]+)#(.+)$/u;
  let contatore = 0;
  const primoDi = new Map(); // nome → the order of its first drawing
  const impronteViste = new Set(); // `${chat}:${impronta}` of the blocks drawn so far
  const perVecchia = new Map(); // `${chat}:${impronta}#${id}` → [{ chiave, tipo, valore, ordine, prima, di?, dopo? }] in arrival order
  /* cura 288 (owner 06/11/2026 09:08): the order of the last v1 that arrived, for `dopo` below; null while the chat has shown no name */
  let ultimoV1 = null;
  const diChi = new Map(); // raw key clicked on THIS page → the clicked block's first order, till the page changes chat (`azzera`)
  const notaNome = (nome, ordine) => {
    if (!nome || !Number.isFinite(ordine)) return;
    if (!(primoDi.get(nome) <= ordine)) primoDi.set(nome, ordine);
  };
  /* the order of a block's FIRST drawing: per name for a named block (a redraw or a v2 keeps it), its own drawing otherwise */
  const primoDelBlocco = (nome, ordine) => (nome ? (primoDi.get(nome) ?? ordine) : ordine);
  /*
   * Cura 288, defect 1 of REVISIONE-UIG-BG2-BG3: a click on a twin BEFORE its v1 (the v1 comes at the end of the response) sends an OLD
   * key, and the order rule then locked every earlier, unanswered twin too. Whose gesture it is, is known: `di` = the clicked block's
   * first drawing (this page's click). After a reload the journal says text, bubble+gesture, v1: if a twin of that text was drawn after
   * the LAST v1 (so in the response still waiting for its own v1), the gesture is that response's click, and `dopo` keeps it off the twins
   * of the earlier, already named responses. A chat that never showed a v1 (before G-B3), or a gesture after the last v1 with no new twin
   * (a G-B3-era click on a named twin), keeps 277's rule: every twin drawn before it. Hermes ties a pending answer to the generation that
   * asked it (`ui-tui/src/gatewayTypes.ts:394-395`); an optimistic client action carries the client id of the thing it acts on until the
   * server one arrives (TanStack Query, «Optimistic Updates», tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates).
   * The owner of a click stays with its key while the page shows chats: its echo arriving after a switch to the fork (UIG-5.3, the
   * «Riprova») is still the old block's gesture, never the regenerated twin's.
   */
  const segnaGesto = (azione, di) => {
    const riaperta = annullate.delete(`${chatDi(o.sessione())}\n${azione.chiave}`); // answered again after a failed send (cura BG3 round 7)
    memoriaAzioni.segna(azione);
    const m = TILDE.exec(azione.chiave);
    if (m) {
      const k = `${o.sessione() ?? ''}|${m[1]}#${m[2]}`;
      if (!vale(perTilde.get(k))) perTilde.set(k, memoriaAzioni.cerca(azione.chiave));
      return;
    }
    const p = POSTO.exec(azione.chiave);
    if (p) {
      const k = `${p[1]}#${p[2]}`; // a place key names one shell: no order rule, no owner to guess
      if (!vale(perPosto.get(k))) perPosto.set(k, memoriaAzioni.cerca(azione.chiave));
      return;
    }
    const v = azione.chiave.startsWith('nome:') ? null : VECCHIA.exec(azione.chiave);
    if (!v) return;
    const origine = `${o.sessione() ?? ''}:${v[2]}`;
    const k = `${origine}#${v[3]}`;
    let gesti = perVecchia.get(k) ?? [];
    if (riaperta) gesti = gesti.filter((x) => x.chiave !== azione.chiave); // the taken-back copy goes: the new answer is the first again
    if (gesti.some((x) => x.chiave === azione.chiave)) return; // the same raw key again (bubble + event): it keeps its first place
    const g = memoriaAzioni.cerca(azione.chiave);
    const voce = { chiave: azione.chiave, tipo: g.tipo, valore: g.valore, ordine: ++contatore, prima: impronteViste.has(origine) };
    /* a raw key seen again returned above, and `diChi` is cleared and parked together with `perVecchia`: the first owner is the only one */
    if (Number.isFinite(di)) diChi.set(azione.chiave, di);
    if (diChi.has(azione.chiave)) voce.di = diChi.get(azione.chiave);
    else if (ultimoV1 !== null && disegnati.some((d) => d.id === v[3] && origineDi(d.testo) === origine
      && primoDelBlocco(d.nome, d.ordine) > ultimoV1)) voce.dopo = ultimoV1; // the FENCE name: a look-alike name is a guess (R15)
    gesti.push(voce);
    perVecchia.set(k, gesti);
  };
  /* an old-key gesture goes to a block drawn before it (277), and only to its owner when it has one (`di`, `dopo`: cura 288) */
  const vaA = (x, primo) => primo < x.ordine && (x.di === undefined || x.di === primo) && (x.dopo === undefined || primo > x.dopo);
  /*
   * UIG-5.2b: il gesto di un blocco. Col nome: la chiave col nome (o il suo alias `~`, UIG-5.11); se non c'è, la chiave VECCHIA (un gesto
   * salvato prima di G-G2) vale per UN nome solo, il primo che la chiede (`reclamatoDa`). Senza nome: la chiave vecchia, come prima.
   * Cura 288: the `find` takes EVERY gesture, also one received while the first twin was still streaming (`prima` false; defect 2:
   * filtering it made the shown answer jump to a later key when the v1 bound). `prima` only turns the order rule on.
   */
  const gestoPer = (testo, nome, id, ordine, luogo = null) => {
    const delPosto = luogo ? vale(perPosto.get(`${luogo}#${id}`)) : null; // cura 288 round 2: the shell's own place key, named or not
    if (delPosto) return delPosto;
    const gesti = (perVecchia.get(`${origineDi(testo)}#${id}`) ?? []).filter((x) => !annullata(x.chiave));
    const perOrdine = gesti.some((x) => x.prima);
    if (nome) {
      const g = memoriaAzioni.cerca(chiaveDi(testo, nome, id)) ?? vale(perTilde.get(`${o.sessione() ?? ''}|${nome}#${id}`));
      if (g) return g;
      if (perOrdine) {
        const primo = primoDi.get(nome) ?? Infinity;
        return gesti.find((x) => vaA(x, primo)) ?? null;
      }
    } else if (perOrdine) {
      /* Cura 288 (decision 277 for EVERY chat): an UNNAMED block, in an old chat with no names or in its fork, follows the same order
         rule by its own first drawing: locked by a gesture after it, never by one before it (a later message with the same words is a
         new question, UIG-5.3), and a fork reads the parent's replayed key in its own chat (UIG-5.3c) */
      return gesti.find((x) => vaA(x, Number.isFinite(ordine) ? ordine : Infinity)) ?? null;
    }
    /* no gesture after any block of its text (only a hand-built order: the gesture before them all): the raw old key of the chat */
    const vecchio = memoriaAzioni.cerca(`${origineDi(testo)}#${id}`);
    if (!vecchio || !nome) return vecchio;
    if (!vecchio.reclamatoDa) vecchio.reclamatoDa = nome;
    return vecchio.reclamatoDa === nome ? vecchio : null;
  };
  const nomeDelNodo = (nodo, nome) => (NOME.test(nodo?.dataset?.nome ?? '') ? nodo.dataset.nome : (nome || ''));
  /*
   * Il gesto di un blocco si decide DOPO che il blocco ha (o cambia) nome: un v1 che arriva dopo il testo lo lega, e un nome dato per
   * somiglianza di testo può essere corretto dal v1 giusto. Spento da un clic qui: resta spento (al più il clic fatto senza nome dà la sua
   * chiave vecchia al nome che arriva). Spento dal giornale (`regola`): si riaccende se il nome nuovo non ha gesti.
   * G-BG3: except `tieni`, a block with no name in its fence, on screen when its own chat's OLD key arrived (the `spegni` redraw): that
   * key says this text, and the block was there before it, so its own v1 does not free it (UIG-5.8b). A block drawn AFTER the key is a
   * new question and still frees on its v1 (UIG-5.7, 5.3b).
   */
  const riconsidera = (voce) => {
    const h = voce.holder;
    const nome = nomeDelNodo(voce.nodo, voce.nome);
    notaNome(nome, voce.ordine);
    if (h.azione && !voce.regola) {
      const data = memoriaAzioni.cerca(chiaviDate.get(h) ?? '');
      if (nome && data && !data.reclamatoDa) data.reclamatoDa = nome;
      return;
    }
    const g = gestoPer(voce.testo, nome, voce.id, voce.ordine, fissaPosto(voce)?.chiave);
    if (g) {
      if (h.azione?.tipo === g.tipo && h.azione?.valore === g.valore) return;
      h.azione = { tipo: g.tipo, valore: g.valore };
      voce.regola = true;
      avvisaAzione(h);
    } else if (voce.regola && !voce.tieni) {
      h.azione = null;
      voce.regola = false;
      avvisaAzione(h);
    }
  };
  /*
   * Cura 288, round 2: a WHOLE redraw (`contenitore.replaceChildren(...)`, legacy/app.js `renderizzaMarkdownIncrementale`; the reasoning
   * card) draws the new shell while the old one is still on the page, so at drawing time nothing tells them apart from two messages.
   * Once the new shell is on the page it stands where the old one stood: the same message (or parent) and the same index, the same text
   * and id. Then it IS that block: it takes its order and its answer, and the old one leaves the list. Checked right after the drawing
   * (a microtask: the host attaches the shell in the same task) and again at the click, so an answered block never sends twice.
   */
  const predecessore = (voce, posto) => disegnati.find((d) => d !== voce && !d.nodo.isConnected && d.id === voce.id && d.testo === voce.testo
    && d.posto?.radice === posto.radice && d.posto.posizione === posto.posizione) ?? null;
  const prendeIlPosto = (voce, prima) => {
    disegnati.splice(disegnati.indexOf(prima), 1);
    voce.ordine = prima.ordine;
    if (!prima.holder.azione) return null;
    voce.holder.azione = { tipo: prima.holder.azione.tipo, valore: prima.holder.azione.valore };
    voce.regola = prima.regola;
    voce.tieni = prima.tieni;
    if (chiaviDate.has(prima.holder)) chiaviDate.set(voce.holder, chiaviDate.get(prima.holder));
    for (const insieme of cliccati.values()) if (insieme.has(prima.holder)) insieme.add(voce.holder); // a failed send reopens the new shell too
    return voce.holder.azione;
  };
  /* the answer a shell already has where it stands: its own place key (also off the page, D3), or the answered block it replaced */
  const giaRisposto = (voce) => {
    const posto = fissaPosto(voce);
    if (!posto) return null;
    const delPosto = posto.chiave ? vale(perPosto.get(`${posto.chiave}#${voce.id}`)) : null;
    if (delPosto) return delPosto;
    if (!voce.nodo.isConnected) return null;
    const prima = predecessore(voce, posto);
    return prima ? prendeIlPosto(voce, prima) : null;
  };
  const assesta = (voce) => {
    if (!disegnati.includes(voce)) return;
    /* a tail redraw took the order of the answered twin that had just left the page (`alPostoDi`): if the new shell stands somewhere
       else (that message was deleted, and the same words came in another one), it was not that block, and it starts from now; the
       answered twin goes back to the list, for the shell that does stand at its place */
    const prima = voce.ereditato;
    voce.ereditato = null;
    const qui = prima?.posto ? postoDi(voce.nodo) : null;
    if (qui && (qui.radice !== prima.posto.radice || qui.posizione !== prima.posto.posizione)) {
      if (!disegnati.includes(prima)) disegnati.push(prima);
      voce.posto = qui;
      voce.ordine = ++contatore;
      if (voce.regola) {
        voce.holder.azione = null;
        voce.regola = false;
        avvisaAzione(voce.holder);
      }
    }
    if (voce.holder.azione) { fissaPosto(voce); return; }
    const g = giaRisposto(voce);
    if (g) {
      voce.holder.azione = { tipo: g.tipo, valore: g.valore };
      if (!voce.regola) voce.regola = !chiaviDate.has(voce.holder);
      avvisaAzione(voce.holder);
      return;
    }
    if (voce.nodo.isConnected) riconsidera(voce); // the order rule with the order it may have just taken
  };
  const ricorda = (voce) => {
    disegnati.push(voce);
    if (disegnati.length > 400) {
      const i = disegnati.findIndex((x) => !x.nodo.isConnected);
      disegnati.splice(i >= 0 ? i : 0, 1);
    }
    if (typeof queueMicrotask === 'function') queueMicrotask(() => assesta(voce));
  };
  /* la chiave si calcola qui col testo intero: un blocco nato vivo e lo stesso blocco ridisegnato dopo una ricarica devono coincidere */
  const quandoAgisce = (bloccoDi, testoDi, nomeDi, holder, ordineDi, voceDi) => (azione) => {
    const voce = voceDi();
    /* one click, one message: the shell already answered where it stands (a whole redraw not yet settled) shows that answer instead */
    const gia = voce ? giaRisposto(voce) : null;
    if (gia) {
      holder.azione = { tipo: gia.tipo, valore: gia.valore };
      avvisaAzione(holder);
      return;
    }
    const nome = nomeDi();
    const fissata = { ...azione, chiave: chiaveDi(testoDi(), nome, azione.idBlocco, voce ? fissaPosto(voce) : null) };
    chiaviDate.set(holder, fissata.chiave);
    /* cura BG3 round 7: who clicked with this key, so a failed send can open it again (`riapri`); the most recent key last.
       Cura BG3 round 8 (B1): only the LAST click of a key is kept. A twin clicked before with the same old key, whose send went through,
       stays answered when this one fails: it never opens again saying «not sent», and a new click never sends it twice. */
    const kc = `${chatDi(o.sessione())}\n${fissata.chiave}`;
    const insieme = new Set();
    cliccati.delete(kc);
    insieme.add(holder);
    cliccati.set(kc, insieme);
    limita(cliccati);
    holder.nonInviata = false;
    /* cura 288: this page's click is the clicked block's own gesture (`di`); an old key exists only with no name, where the block's
       first drawing is its own order */
    segnaGesto(fissata, ordineDi());
    const blocco = bloccoDi();
    o.consegna(testoDellAzione(fissata, blocco), fissata, blocco);
  };
  /*
   * G-B3 (06/11/2026), UIG-1.15-1.18: the names and versions of the blocks, from the `talos.blocco.versione` events (live and replayed
   * after a reload). The v1 says which message and which fence (`messaggio`, `posizione`, `impronta`): the shell there gets the name
   * (`dataset.nome`) and its history. A later version redraws the shell of that name in place, its history rebuilt with
   * `storicoDagliEventi` only. A version made on the screen (view, back to v1) of a NAMED block is saved through `o.salvaVersione` (one
   * POST, no turn); if it fails the version stays on screen and one toast says it was not saved.
   */
  const NOME = /^b[1-9]\d*$/u;
  const NOME_NEL_RECINTO = /(?:^|\s)nome=(b[1-9]\d{0,8})(?=\s|$)/u;
  const perNome = new Map(); // nome → { sorgente1, eventi: value[], storico, sezioni: Set<HTMLElement>, impronta, messaggio }
  const sequenzeViste = new Set(); // G-B4 (D): bounded — past SEQUENZE_VISTE_MASSIME the oldest goes out (a Set keeps insertion order)
  const SEQUENZE_VISTE_MASSIME = 2000;
  const sezioniSenzaNome = []; // [{ nodo, impronta }]: shells drawn before their v1 arrived
  const nomiAttesi = []; // v1s whose shell is not on screen yet: [{ nome, impronta }]
  const legaSezione = (voce, nodo) => {
    for (const altra of perNome.values()) if (altra !== voce) altra.sezioni.delete(nodo); // G-G2: il v1 giusto corregge un nome dato per somiglianza
    voce.sezioni.add(nodo);
    const i = sezioniSenzaNome.findIndex((x) => x.nodo === nodo);
    if (i >= 0) sezioniSenzaNome.splice(i, 1);
    nodo.__storicoDalServer?.(voce.storico);
    const d = disegnati.find((x) => x.nodo === nodo);
    if (d) riconsidera(d);
  };
  const sezioneDelMessaggio = (valore) => {
    const msg = typeof o.elementoDelMessaggio === 'function' && valore.messaggio ? o.elementoDelMessaggio(valore.messaggio) : null;
    if (!msg?.querySelectorAll || !Number.isInteger(valore.posizione)) return null;
    const sezioni = [...msg.querySelectorAll('section')].filter((x) => x.classList?.contains('gu'));
    return sezioni[valore.posizione] ?? null;
  };
  /* a shell waiting for its v1: the one whose fence carries that name first, else one with the same text and no other name */
  const sezioneLibera = (imp, nome) => (sezioniSenzaNome.find((x) => x.nodo.dataset?.nome === nome)
    ?? sezioniSenzaNome.find((x) => x.impronta === imp && x.nodo.isConnected !== false && !NOME.test(x.nodo.dataset?.nome ?? '')))?.nodo ?? null;
  /* a shell just drawn: it takes the name waiting for its text, or the one name with that text (a redraw of the message tail) */
  const registraSezione = (nodo, testo, nome = '') => {
    if (!nodo || nodo.dataset?.stato !== 'completo') return;
    /* the fence carries its name (`nome=bN`, stamped by the host): that name, and no guessing */
    if (nome) {
      const i = nomiAttesi.findIndex((x) => x.nome === nome);
      if (i >= 0) nomiAttesi.splice(i, 1);
      if (perNome.has(nome)) { legaSezione(perNome.get(nome), nodo); return; }
    }
    const imp = impronta(testo);
    const attesa = nome ? -1 : nomiAttesi.findIndex((x) => x.impronta === imp); // a shell with its own name never takes another one
    if (attesa >= 0) {
      const [{ nome }] = nomiAttesi.splice(attesa, 1);
      if (perNome.has(nome)) { legaSezione(perNome.get(nome), nodo); return; }
    }
    const nomi = [...perNome.values()].filter((v) => v.impronta === imp);
    if (!nome && nomi.length === 1) { legaSezione(nomi[0], nodo); return; }
    sezioniSenzaNome.push({ nodo, impronta: imp });
    if (sezioniSenzaNome.length > 200) sezioniSenzaNome.shift();
  };
  const avvisoNonSalvata = () => { try { o.avvisa?.(t('blocchi.versions.saveFailed')); } catch { /* the toast never breaks the block */ } };
  const quandoCambiaVersione = (storico, corrente) => {
    const nome = storico?.nome;
    if (typeof nome !== 'string' || !NOME.test(nome) || !corrente || corrente.versione < 2) return;
    if (corrente.origine !== 'vista' && corrente.origine !== 'ritorno') return;
    const voce = perNome.get(nome);
    if (voce) voce.storico = storico; // the screen already shows it: the echo of the saved event does not redraw again
    if (typeof o.salvaVersione !== 'function') return;
    const valore = eventoDellaVersione(storico, corrente, { conversazione: o.sessione() ?? '', messaggio: voce?.messaggio ?? '' });
    const salva = (v) => { try { return Promise.resolve(o.salvaVersione(v)); } catch (e) { return Promise.reject(e); } };
    /* G-B4 (UIG-1.20): the number is the server's. A 409 carries the next one (`prossima`): re-send ONCE with it — a harmless conflict
       is re-read and re-applied, bounded (docs.proteanhq.com, optimistic concurrency, read 06/11/2026) — and relabel the local version
       so the screen says what the journal will. A second refusal is a toast, never a loop. */
    const rietichetta = (prossima) => {
      const qui = voce?.storico && versioneCorrente(voce.storico);
      if (!qui || qui.versione !== corrente.versione || qui.sorgente !== corrente.sorgente) return; // the screen moved on meanwhile
      const nuovo = rinumeraCorrente(voce.storico, prossima);
      if (nuovo === voce.storico) return;
      voce.storico = nuovo;
      for (const nodo of voce.sezioni) nodo.__storicoDalServer?.(nuovo);
    };
    salva(valore).then((r) => {
      if (r && r.ok === false && Number.isInteger(r.prossima) && r.prossima > 1) {
        const prossima = r.prossima;
        return salva({ ...valore, versione: prossima }).then((r2) => { if (r2 && r2.ok === false) avvisoNonSalvata(); else rietichetta(prossima); });
      }
      if (r && r.ok === false) avvisoNonSalvata();
      return undefined;
    }).catch(avvisoNonSalvata);
  };
  const base = { document: o.document, scrivoIo: o.scrivoIo, copia: o.copia, bloccoCodice: o.bloccoCodice, azioni: o.azioni, timer: o.timer, quandoCambiaVersione };
  const trovaVivo = (testo) => [...vivi].filter((v) => testo.startsWith(v.testo)).sort((a, b) => b.testo.length - a.testo.length)[0] ?? null;

  /** @param {boolean} [ridisegno] the `spegni` redraw of a block already on screen (G-BG3: see `tieni` at `riconsidera`) */
  /*
   * Cura 288: an unnamed block has no name to keep its place in the order across a redraw. The tail renderer removes the old tail
   * BEFORE drawing the new one (`legacy/app.js`, `renderizzaMarkdownIncrementale`: `nodo.remove()` then `renderizzaMarkdownSemplice`),
   * so an ANSWERED unnamed twin that is out of the page (no parent at all: a twin still in the fragment being built has one) is the
   * block this drawing replaces: the new drawing takes its first order, and stays locked by the gesture that came after it.
   */
  const alPostoDi = (testo, id) => {
    const origine = origineDi(testo);
    for (let i = disegnati.length - 1; i >= 0; i -= 1) {
      const d = disegnati[i];
      if (d.id !== id || d.nodo.parentNode || !d.holder.azione || nomeDelNodo(d.nodo, d.nome) || origineDi(d.testo) !== origine) continue;
      disegnati.splice(i, 1);
      return d;
    }
    return null;
  };

  /** @param {object} [postoDato] the `spegni` redraw: the place of the shell it replaces (the new one is not on the page yet) */
  function chiuso(testo, nome, ordineDato, ridisegno = false, postoDato = null) {
    const risultato = leggi(testo);
    const blocco = risultato.blocco ?? null;
    const origine = origineDi(testo);
    const stato = statoDelBlocco();
    const agisce = Boolean(blocco && puoAgire(risultato));
    const prima = ordineDato == null && !nome && agisce ? alPostoDi(testo, blocco.id) : null;
    const voce = { nodo: null, testo, nome, id: blocco?.id, holder: stato.azione, regola: false, ordine: ordineDato ?? prima?.ordine ?? ++contatore,
      posto: postoDato ?? prima?.posto ?? null, ereditato: prima };
    if (agisce) { impronteViste.add(origine); notaNome(nome, voce.ordine); }
    const gia = agisce ? gestoPer(testo, nome, blocco.id, voce.ordine, voce.posto?.chiave) : null;
    if (gia) stato.azione.azione = { tipo: gia.tipo, valore: gia.valore };
    voce.regola = Boolean(gia);
    voce.tieni = ridisegno && !nome && Boolean(gia);
    voce.nodo = disegnaBlocco(risultato, { ...base, ...(nome ? { nome } : {}), testo, stato, origine,
      quandoAgisce: quandoAgisce(() => blocco, () => testo, () => nomeDelNodo(voce.nodo, nome), stato.azione, () => voce.ordine, () => (agisce ? voce : null)) });
    if (agisce) ricorda(voce);
    registraSezione(voce.nodo, testo, nome);
    return voce.nodo;
  }

  function vivo(testo, nome) {
    const voce = { testo: '', v: null, blocco: null, nome, stato: statoDelBlocco(), ordine: ++contatore, d: null };
    voce.v = montaBloccoVivo({ ...base, ...(nome ? { nome } : {}), stato: voce.stato,
      quandoAgisce: quandoAgisce(() => voce.blocco, () => voce.testo, () => nomeDelNodo(voce.v?.nodo, voce.nome), voce.stato.azione,
        () => voce.d?.ordine ?? voce.ordine, () => voce.d) });
    vivi.add(voce);
    voce.v.aggiungi(testo);
    voce.testo = testo;
    return voce;
  }

  /*
   * Cura 288 round 3 (D1, N3): a chat's state is parked by the HOST, inside the entry of its ready page (legacy/app.js
   * `parcheggiaChatAperta`, next to the steps' `istantanea`), so page and state are kept, capped and thrown away together: a page no
   * longer parked has no state waiting for it, and an old state never comes back over a page drawn again from the journal. Codex keeps a
   * thread's buffered events and its pending prompts in one store and drops them together (codex-rs/tui/src/app/thread_events.rs:69-73).
   */
  const raccolte = [disegnati, perNome, perTilde, perVecchia, perPosto, primoDi, impronteViste, sequenzeViste, sezioniSenzaNome, nomiAttesi, diChi];
  const copiaDi = (r) => (Array.isArray(r) ? [...r] : r instanceof Map ? new Map(r) : new Set(r));
  const svuota = (r) => { if (Array.isArray(r)) r.length = 0; else r.clear(); };
  const riempi = (r, da) => {
    svuota(r);
    if (Array.isArray(r)) r.push(...da);
    else if (r instanceof Map) for (const [k, v] of da) r.set(k, v);
    else for (const v of da) r.add(v);
  };

  return {
    /** @param {string} [info] the rest of the fence line after the language (`nome=b1`): G-B3, the name stamped by the host */
    blocco(testo, recintoChiuso, info = '') {
      const nome = NOME_NEL_RECINTO.exec(String(info ?? ''))?.[1] ?? '';
      const voce = trovaVivo(testo);
      if (!voce) {
        if (recintoChiuso) return chiuso(testo, nome);
        return vivo(testo, nome).v.nodo;
      }
      if (testo.length > voce.testo.length) {
        voce.v.aggiungi(testo.slice(voce.testo.length));
        voce.testo = testo;
      }
      if (recintoChiuso) {
        vivi.delete(voce);
        const finito = voce.v.fine();
        voce.blocco = finito?.blocco ?? null;
        const d = voce.blocco && puoAgire(finito)
          ? { nodo: voce.v.nodo, testo: voce.testo, nome: voce.nome || nome, id: voce.blocco.id, holder: voce.stato.azione, regola: false, ordine: voce.ordine } : null;
        if (d) { voce.d = d; impronteViste.add(origineDi(voce.testo)); ricorda(d); }
        registraSezione(voce.v.nodo, voce.testo, voce.nome || nome);
        if (d) riconsidera(d); // anche senza nome: il gesto del giornale col testo uguale, come un blocco ridisegnato
      }
      return voce.v.nodo;
    },
    /** L'azione arriva dal giornale: da qui in poi il blocco è usato, e se è già a schermo si ridisegna spento. Il gesto di questa pagina è già segnato. */
    /* G-G2: la chiave vecchia (`sessione:impronta#id`) e quella col nome (`nome:bN@messaggio#id`) si leggono tutte e due (`gestoPer`);
       il blocco a schermo si ridisegna spento COL SUO NOME (UIG-5.3d), e un blocco già spento non si tocca */
    spegni(chiave, gesto = {}) {
      if (typeof chiave !== 'string' || !chiave) return;
      segnaGesto({ chiave, tipo: gesto.tipo, valore: gesto.valore ?? null });
      /* Cura 288 round 3 (D4): a place key names one shell, looked up AT that place (the message, then the index): one host lookup per
         gesture, not one per shell of that id (300 messages and 300 gestures made 45 450). A shell whose kept place is that place but
         that stands elsewhere now is read again, so it never takes a gesture that is not its own. */
      const delPosto = POSTO.exec(chiave)?.[1] ?? null;
      const qui = delPosto ? voceAlPosto(delPosto) : null;
      if (qui) fissaPosto(qui);
      for (const voce of [...disegnati]) {
        if (voce.holder.azione) continue;
        const nome = nomeDelNodo(voce.nodo, voce.nome);
        const luogo = (delPosto && voce !== qui && voce.posto?.chiave === delPosto ? fissaPosto(voce) : voce.posto)?.chiave;
        if (!gestoPer(voce.testo, nome, voce.id, voce.ordine, luogo)) continue;
        if (!voce.nodo.isConnected) { riconsidera(voce); continue; }
        disegnati.splice(disegnati.indexOf(voce), 1);
        /* G-BG2, UIG-5.8: the redraw takes the FENCE name only, and goes back to the name its shell was bound to. Passing the name read on
           the node made a look-alike name (bound by text before the block's own v1) stick for good: the right v1 could no longer move it */
        const legato = [...perNome.values()].find((v) => v.sezioni.has(voce.nodo)) ?? null;
        for (const v of perNome.values()) v.sezioni.delete(voce.nodo);
        /* the new shell takes the old one's place (`replaceWith`: same parent, same index), so it gets that place now */
        const nuovo = chiuso(voce.testo, voce.nome, voce.ordine, true, fissaPosto(voce));
        voce.nodo.replaceWith(nuovo);
        if (legato) legaSezione(legato, nuovo);
      }
    },
    /**
     * G-B3: a `talos.blocco.versione` event (live or replayed). v1 binds the name to its shell; a later version redraws the named shell in
     * place with the history rebuilt from the events. The same `_sequenza`, or the same (name, version) twice, does nothing.
     * @returns {boolean} whether it changed the screen state
     */
    aggiornaVersione(evento) {
      if (evento?.type !== 'CUSTOM' || evento.name !== EVENTO_VERSIONE_DEL_BLOCCO) return false;
      const seq = evento._sequenza;
      if (seq !== undefined && seq !== null) {
        if (sequenzeViste.has(seq)) return false;
        sequenzeViste.add(seq);
        if (sequenzeViste.size > SEQUENZE_VISTE_MASSIME) sequenzeViste.delete(sequenzeViste.values().next().value);
      }
      const v = evento.value;
      if (!v || typeof v.blocco !== 'string' || !NOME.test(v.blocco) || !Number.isInteger(v.versione) || typeof v.sorgente !== 'string') return false;
      if (v.versione === 1) {
        if (perNome.has(v.blocco)) return false;
        const letto = leggi(v.sorgente);
        if (letto.stato !== 'completo') return false;
        const imp = typeof v.impronta === 'string' && v.impronta ? v.impronta : impronta(v.sorgente);
        const voce = { sorgente1: v.sorgente, eventi: [v], storico: creaStorico(letto.blocco, v.blocco, { sorgente: v.sorgente, quando: v.quando }), sezioni: new Set(), impronta: imp, messaggio: v.messaggio || '' };
        perNome.set(v.blocco, voce);
        ultimoV1 = contatore; // cura 288: what was drawn before this v1 is an earlier, named response (see `dopo` in `segnaGesto`)
        const nodo = sezioneDelMessaggio(v) ?? sezioneLibera(imp, v.blocco);
        if (nodo) legaSezione(voce, nodo); else nomiAttesi.push({ nome: v.blocco, impronta: imp });
        return true;
      }
      let voce = perNome.get(v.blocco);
      /* a name with no v1 event (kept from an older journal): the shell on screen with that name gives its v1 */
      if (!voce) {
        const nodo = [...(o.document?.body?.querySelectorAll?.('section') ?? [])].find((x) => x.dataset?.nome === v.blocco && x.__storico?.voci?.length);
        const sorgente1 = nodo?.__storico.voci[0].sorgente;
        if (typeof sorgente1 !== 'string') return false;
        voce = { sorgente1, eventi: [], storico: nodo.__storico, sezioni: new Set([nodo]), impronta: impronta(sorgente1), messaggio: '' };
        perNome.set(v.blocco, voce);
      }
      /* the journal keeps the first event per number (as `storicoDagliEventi`); G-B4 (UIG-1.20): the SCREEN check below compares number AND
         source — a model v2 is not the local v2 the screen shows while its save is in flight */
      if (voce.eventi.some((e) => e.versione === v.versione)) return false;
      voce.eventi.push(v);
      const nuovo = storicoDagliEventi(v.blocco, voce.sorgente1, voce.eventi);
      if (!nuovo) return false;
      const giaASchermo = voce.storico?.voci?.some((x) => x.versione === v.versione && x.sorgente === v.sorgente);
      voce.storico = nuovo;
      if (giaASchermo) return false;
      for (const nodo of voce.sezioni) nodo.__storicoDalServer?.(nuovo);
      return true;
    },
    /*
     * The page leaves the chat. Cura BG3 round 4 (E1): the host calls it in ONE place, `nuovaGenerazioneSessione` right after the
     * parking, for every chat change (switch, new chat, fork, «Retry», pending and custom chats) and never on a resume (`continua`); a
     * selection-mode click or a click on the open chat's own row never gets there (cura 288 round 3, N1/N2). The next chat replays its own
     * gestures; the raw memory (first wins) is kept, one per chat (E3); a click's owner (`diChi`) from this chat means nothing there. A
     * ready page's state left with it (`parcheggia`).
     */
    azzera() {
      for (const voce of vivi) voce.v.ferma();
      vivi.clear();
      for (const r of raccolte) svuota(r);
      ultimoV1 = null;
    },
    /**
     * The host parks the open page as a ready chat: what the hook knows of it is HANDED OVER to the same entry, and the hook keeps none
     * of it. Cura BG3 round 4 (E1, E2): a copy of the containers still shared their entries (holders, places, sections, v2 events) with
     * the live hook, and every caller that opened a chat with no reset (fork, «Retry», a new chat) let that chat answer, redraw or name
     * the parked page. Not a deep copy: the parked shells' click handlers close over these very holders, so the entries move with the
     * page instead. The host also resets the hook right after, in one place (`azzera` in `nuovaGenerazioneSessione`); the memory of
     * gestures is per chat (`creaMemoriaAzioni`), so it needs no hand-over. Hermes drops the previous session's pending controls when a
     * session is reset (`ui-tui/src/app/useSessionLifecycle.ts:608`).
     * @returns {object} the state, for `ripristina` when that page comes back with no replay
     */
    parcheggia() {
      const stato = { raccolte: raccolte.map(copiaDi), ultimoV1 };
      for (const r of raccolte) svuota(r);
      ultimoV1 = null;
      return stato;
    },
    /** @returns {boolean} whether there was a state to put back (the host restored its page with no replay) */
    ripristina(stato) {
      if (!stato || !Array.isArray(stato.raccolte) || stato.raccolte.length !== raccolte.length) return false;
      raccolte.forEach((r, i) => riempi(r, stato.raccolte[i]));
      ultimoV1 = stato.ultimoV1 ?? null;
      return true;
    },
    /**
     * ⛔⛔ Cura BG3 round 7: the send of the answer with this raw key FAILED (`chat` = the chat it was sent in). The answer is taken back:
     * the clicked block opens again (`nonInviata`: its note says it was not sent), in that chat also when the person is in another one
     * now (the parked page's holders are these very objects), and any twin the same key had locked opens too. Nothing goes to the
     * composer: the model wrote that text. A new click sends it again, once.
     * @returns {boolean} whether a block opened again
     */
    riapri(chiave, chat) {
      if (typeof chiave !== 'string' || !chiave) return false;
      const c = chatDi(chat);
      const kc = `${c}\n${chiave}`;
      const qui = c === chatDi(o.sessione());
      const g = memoriaAzioni.togli(chiave, c);
      /* the twins this key locks now (the open chat only: a parked page comes back with its own state) */
      const presi = qui ? disegnati.filter((voce) => {
        if (!voce.regola || !voce.holder.azione) return false;
        const x = gestoPer(voce.testo, nomeDelNodo(voce.nodo, voce.nome), voce.id, voce.ordine, voce.posto?.chiave);
        return Boolean(x) && (x === g || x.chiave === chiave);
      }) : [];
      if (g) g.annullato = true;
      annullate.add(kc);
      limita(annullate);
      /* `diChi` keeps the clicked twin: a failure can be ambiguous (the server got it), and its event then locks that twin only, never an
         earlier twin of the same words (cura 288); a new click on any twin writes its own owner */
      let riaperto = false;
      for (const h of cliccati.get(kc) ?? []) {
        if (chiaviDate.get(h) !== chiave) continue;
        chiaviDate.delete(h);
        h.azione = null;
        h.nonInviata = true;
        avvisaAzione(h);
        riaperto = true;
      }
      cliccati.delete(kc);
      for (const voce of presi) {
        if (gestoPer(voce.testo, nomeDelNodo(voce.nodo, voce.nome), voce.id, voce.ordine, voce.posto?.chiave)) continue;
        voce.holder.azione = null;
        voce.regola = false;
        voce.tieni = false;
        voce.holder.nonInviata = true; // the same answer, not sent: a shell drawn again while it was on its way says so too
        avvisaAzione(voce.holder);
        riaperto = true;
      }
      return riaperto;
    },
    viviAperti: () => vivi.size,
  };
}
