/*
 * FE-070: il ponte dalla pagina principale al canale della bolla (Desktop 05/11 16:44). La pagina principale riceve già lo stream della sessione: inoltra sul canale SOLO gli
 * eventi del computer use, con lo stesso lettore della bolla, e la bolla e il segno (una pagina per schermo) li disegnano.
 * ⛔ Mai durante la rigiocata: un annuncio o un bordo di un'ora fa disegnerebbe sullo schermo un'azione che non c'è.
 * ⛔ Il canale si apre al primo evento che serve; se il browser non lo offre, la pagina principale va avanti come prima.
 *
 * FE-071 (Desktop 05/11 17:09): la pagina principale ascolta UNA sessione, quella visibile. Se la persona cambia chat mentre TALOS usa il computer in un'altra, il ponte
 * apre UN ascolto suo (`ascolta`) su quella sessione, da dopo l'ultima sequenza vista, e ne inoltra solo il computer use. Chi seguire:
 *   1. il segnale del server `talos.computer-use-sessione {sessionId|null, attivo}` (flusso del remoto, con l'istantanea all'apertura): UNA sessione alla volta, vince
 *      l'ultima accesa, `null` spento = nessuna (Desktop 05/11 17:45, concordato col computer use);
 *   2. dedotto, solo finché il server non ha mai mandato il segnale (dopo, `null` spento vuol dire davvero nessuna): un computer use iniziato e non concluso; poi un giro aperto (la richiesta è partita, il computer use può arrivare dopo); a parità l'ultima lasciata.
 * Gli indicatori si leggono anche dalla storia (una chat aperta a metà giro), ma dalla storia non si inoltra niente. Ogni sequenza passa una volta sola per sessione:
 * la stessa può arrivare dalla pagina principale e dall'ascolto del ponte. Mai più di un ascolto in più (6 collegamenti per origine in HTTP/1.1).
 * La bolla riceve `{tipo:'sessione'}` prima del primo evento di una sessione diversa: le sue risposte vanno alla chat che usa il computer, non a quella visibile.
 *
 * Reperto 2 (giudice v1470, v1472 correzioni 2-3; 13/11): il ponte ASCOLTA anche la bolla. `ferma`, `messaggio` e `risposta` diventano le `azioni` della pagina
 * principale (Stop del giro, coda, risposta alla carta), come i suoi pulsanti. La carta del computer use (`id` 'computer_use' sul canale delle domande) va alla
 * bolla con le scelte vere, e si chiude da tutte e due le parti quando il server la risolve (Codex `serverRequest/resolved`, app-server-protocol common.rs:2071).
 * ⛔ Una pagina della stessa origine può scrivere sul canale: una risposta vale solo per una carta che il ponte ha mostrato e non è chiusa, con una delle sue
 *   scelte; Ferma e messaggio solo per la sessione detta alla bolla o una che il ponte segue. Una scelta che vuole l'elenco aperto resta nella chat.
 */
import { CANALE_BOLLA, leggiMessaggio } from './bolla-protocollo.js';
/* Giro 4 della bolla (13/11, CU-23): la pagina principale monta del computer use SOLO questo ponte (FE-070). Il movimento ridotto che dice al server (reperto 17)
   passa di qui, non da un secondo import della regia. */
export { motoRidottoDa } from './bolla-messaggi.js';

const SEGNALE = 'talos.computer-use-sessione';
const FINE_STORIA = 'talos.fine-rigiocata';
const COMPUTER_USE_CONCLUSO = new Set(['talos.computer-use-esito', 'talos.computer-use-fermato']);
const testoPieno = (v) => typeof v === 'string' && v.length > 0;
/* Revisione delle cure piccole, difetto 1: quante posizioni di chat dimenticate si ricordano (la più vecchia esce per prima). */
const RICORDO_MASSIMO = 50;

/** Il messaggio per la bolla, o null se l'evento non è del computer use (letto per forma, come lo legge la bolla). */
function messaggioComputerUse(evento) {
  if (evento?.type !== 'CUSTOM') return null;
  return leggiMessaggio({ tipo: 'evento', evento: { name: evento.name, value: evento.value } });
}

/** La carta del computer use (`attrezzo.mjs`, `domanda`: una domanda sola, id 'computer_use'), con le scelte che si possono dare fuori dalla chat; o null. */
function cartaComputerUse(evento) {
  const q = Array.isArray(evento.questions) && evento.questions.length === 1 ? evento.questions[0] : null;
  if (!testoPieno(evento.requestId) || q?.id !== 'computer_use' || !testoPieno(q.question) || !Array.isArray(q.options)) return null;
  const opzioni = q.options.filter((o) => testoPieno(o?.label) && o.requiresDetails !== true)
    .map((o) => ({ label: o.label, ...(testoPieno(o.description) ? { descrizione: o.description } : {}) }));
  return opzioni.length ? { chiave: q.id, testo: q.question, opzioni } : null;
}

export function creaPonteBolla({ apri = (nome) => new BroadcastChannel(nome), ascolta = null, azioni = null } = {}) {
  let canale = null;
  let assente = false;
  let sessioneDellaBolla = null;
  /** requestId → { sessione, chiave, scelte }: le carte mostrate alla bolla e non ancora risolte */
  const carte = new Map();
  /** id → { ultima: sequenza più alta vista o null, giro, computerUse, caduta: l'ascolto è caduto e non si riapre finché non si rivede dal vivo, lasciata: orologio } */
  const chat = new Map();
  /** id → ultima sequenza vista, delle chat dimenticate più di recente: al massimo RICORDO_MASSIMO, in ordine d'inserimento (MDN `Map`). */
  const posizioni = new Map();
  let segnalata = null;
  let dalServer = false;
  let visibile = null;
  let orologio = 0;
  let ascolto = null;

  const scheda = (id) => {
    let s = chat.get(id);
    if (!s) {
      s = { ultima: posizioni.get(id) ?? null, giro: false, computerUse: false, caduta: false, lasciata: 0 };
      posizioni.delete(id);
      chat.set(id, s);
    }
    return s;
  };

  const fai = (f, ...a) => { try { f?.(...a); } catch { /* l'azione dice da sé il suo errore */ } };
  function dallaBolla(m) {
    if (!azioni || !m || typeof m !== 'object') return;
    if (m.tipo === 'risposta') {
      const c = testoPieno(m.id) ? carte.get(m.id) : null;
      if (!c || typeof m.valore !== 'string' || !c.scelte.has(m.valore)) return;
      carte.delete(m.id);
      fai(azioni.risposta, c.sessione, { requestId: m.id, status: 'answered', answers: { [c.chiave]: m.valore } });
      return;
    }
    const sessione = testoPieno(m.sessionId) ? m.sessionId : sessioneDellaBolla;
    if (sessione === null || (sessione !== sessioneDellaBolla && !chat.has(sessione))) return;
    if (m.tipo === 'ferma') fai(azioni.ferma, sessione);
    else if (m.tipo === 'messaggio' && typeof m.testo === 'string' && m.testo.trim()) fai(azioni.messaggio, sessione, m.testo.trim());
  }

  function manda(messaggio, sessione) {
    if (assente) return;
    if (!canale) {
      try { canale = apri(CANALE_BOLLA); } catch { assente = true; return; }
      canale.onmessage = (e) => dallaBolla(e?.data);
    }
    if (testoPieno(sessione) && sessione !== sessioneDellaBolla) {
      sessioneDellaBolla = sessione;
      canale.postMessage({ tipo: 'sessione', sessionId: sessione });
    }
    canale.postMessage(messaggio);
  }

  /** Dal vivo verso la bolla: il computer use, e la sua carta finché il server non la risolve (risolta da qui, dalla chat o da un altro schermo). */
  function inoltra(evento, sessione) {
    const m = messaggioComputerUse(evento);
    if (m) { manda(m, sessione); return; }
    const c = evento.type === 'UserQuestionRequested' ? cartaComputerUse(evento) : null;
    if (c) {
      carte.set(evento.requestId, { sessione, chiave: c.chiave, scelte: new Set(c.opzioni.map((o) => o.label)) });
      manda({ tipo: 'domanda', id: evento.requestId, porta: 'domanda', dati: { testo: c.testo, opzioni: c.opzioni } }, sessione);
    } else if (evento.type === 'UserQuestionResolved' && carte.delete(evento.requestId)) manda({ tipo: 'chiudi-domanda', id: evento.requestId }, sessione);
    else if (evento.type === 'RunFinished' || evento.type === 'RunError') for (const [id, k] of carte) if (k.sessione === sessione) carte.delete(id);
  }

  /** Aggiorna gli indicatori della sessione. Falso se la sequenza è già passata (doppione da non inoltrare). */
  function annota(s, evento) {
    if (typeof evento._sequenza === 'number' && Number.isFinite(evento._sequenza)) {
      if (s.ultima !== null && evento._sequenza <= s.ultima) return false;
      s.ultima = evento._sequenza;
    }
    if (evento.type === 'RunStarted') s.giro = true;
    else if (evento.type === 'RunFinished' || evento.type === 'RunError') { s.giro = false; s.computerUse = false; }
    else if (messaggioComputerUse(evento)) s.computerUse = !COMPUTER_USE_CONCLUSO.has(evento.name);
    return true;
  }

  /** La visibile la ascolta già la pagina principale; un ascolto già aperto su di lei resta finché la pagina principale non è dal vivo (la sua storia non si inoltra). */
  const seguibile = (id) => (id !== visibile || ascolto?.sessione === id) && chat.get(id)?.caduta !== true;

  function candidata() {
    if (dalServer) return segnalata !== null && seguibile(segnalata) ? segnalata : null;
    let migliore = null;
    for (const [id, s] of chat) {
      if (!seguibile(id) || s.ultima === null || !(s.giro || s.computerUse)) continue;
      const m = migliore && chat.get(migliore);
      if (!m || (s.computerUse && !m.computerUse) || (s.computerUse === m.computerUse && s.lasciata > m.lasciata)) migliore = id;
    }
    return migliore;
  }

  /* Difetto 8b (revisione 05/11 sera): una chat finita si dimentica, se non è la visibile, quella ascoltata o quella segnalata e non ha un giro né un computer use
     aperti (MDN `Map.prototype.delete`; Hermes `gateway/run_adapters.py:561`, `inflight.pop(session_id, None)` a sessione finita).
     Difetto 1 (revisione delle cure piccole): se ne tiene l'ultima sequenza in `posizioni`, così riaperta riprende da lì e non dalla storia intera, dove ogni
     evento del giro nuovo arrivato prima di `talos.fine-rigiocata` si perdeva. Oltre RICORDO_MASSIMO esce la più vecchia, e quella riparte dalla storia. */
  function dimentica(id) {
    const s = chat.get(id);
    if (!s || s.giro || s.computerUse || id === visibile || id === segnalata || ascolto?.sessione === id) return;
    chat.delete(id);
    if (s.ultima === null) return;
    posizioni.set(id, s.ultima); // `scheda` l'ha già tolta riaprendola: entra in coda, la più recente
    if (posizioni.size > RICORDO_MASSIMO) posizioni.delete(posizioni.keys().next().value);
  }

  function stacca() {
    const a = ascolto;
    ascolto = null;
    if (a?.stacca) { try { a.stacca(); } catch { /* già chiuso */ } }
  }

  function dalPonte(mio, evento) {
    if (!evento || typeof evento !== 'object') return;
    const s = scheda(mio.sessione);
    if (mio.inStoria) {
      if (evento.type === 'CUSTOM' && evento.name === FINE_STORIA) { mio.inStoria = false; return; }
      annota(s, evento);
    } else if (annota(s, evento)) inoltra(evento, mio.sessione);
    scegli();
    if (evento.type === 'RunFinished' || evento.type === 'RunError') dimentica(mio.sessione);
  }

  function scegli() {
    const id = candidata();
    if (ascolto?.sessione === id) return;
    stacca();
    if (id === null || typeof ascolta !== 'function') return;
    const dopo = scheda(id).ultima ?? 0;
    /* Senza sequenza vista (avviato dal telefono, chat mai aperta qui o uscita dal ricordo) si ascolta dalla storia intera e si inoltra solo dopo `talos.fine-rigiocata`. */
    const mio = { sessione: id, inStoria: dopo === 0, stacca: null };
    ascolto = mio;
    try {
      mio.stacca = ascolta(id, dopo, (evento) => { if (ascolto === mio) dalPonte(mio, evento); }, () => {
        if (ascolto !== mio) return;
        stacca();
        scheda(id).caduta = true;
        scegli();
      });
    } catch {
      if (ascolto === mio) ascolto = null;
      scheda(id).caduta = true;
    }
  }

  return {
    evento(evento, { inRigiocata = false, sessione = null } = {}) {
      if (!evento || typeof evento !== 'object') return;
      if (!testoPieno(sessione)) {
        if (!inRigiocata) inoltra(evento, null);
        return;
      }
      visibile = sessione;
      const s = scheda(sessione);
      if (!inRigiocata) {
        s.caduta = false;
        if (ascolto?.sessione === sessione) stacca();
      }
      if (annota(s, evento) && !inRigiocata) inoltra(evento, sessione);
      scegli();
    },
    /** La pagina principale lascia la chat visibile (cambio di chat): da qui in poi la segue, se serve, l'ascolto del ponte. */
    lascia(sessione) {
      if (!testoPieno(sessione)) return;
      const s = chat.get(sessione);
      if (s) s.lasciata = ++orologio;
      if (visibile === sessione) visibile = null;
      scegli();
      dimentica(sessione);
    },
    /** `talos.computer-use-sessione` dal flusso del remoto, letto per forma. */
    segnale(e) {
      if (!e || typeof e !== 'object' || typeof e.attivo !== 'boolean') return;
      if (!(testoPieno(e.sessionId) || (e.sessionId === null && e.attivo === false))) return;
      dalServer = true;
      const prima = segnalata;
      if (e.attivo) {
        segnalata = e.sessionId;
        const s = chat.get(e.sessionId);
        if (s) s.caduta = false;
      } else {
        /* Spenta: quella nominata, o con `null` quella che il server aveva acceso. Non la si deduce più dagli indicatori. */
        const spenta = e.sessionId ?? segnalata;
        if (segnalata === spenta) segnalata = null;
        const s = spenta === null ? null : chat.get(spenta);
        if (s) { s.giro = false; s.computerUse = false; }
        scegli();
        if (spenta !== null) dimentica(spenta);
        return;
      }
      scegli();
      /* Difetto 2 (revisione delle cure piccole): il server può passare a un'altra chat senza spegnere quella di prima; finita, si dimentica come spenta.
         `dimentica` tiene la stessa riaccesa (è la segnalata), una a metà giro e la visibile. */
      dimentica(prima);
    },
    /** Quante chat il ponte ricorda (diagnosi e prove). */
    ricordate: () => chat.size,
    /** pagehide: si chiude l'ascolto e il canale (riaperto al primo evento se la pagina torna dalla cache). */
    chiudi() {
      stacca();
      if (canale) { try { canale.close(); } catch { /* già chiuso */ } }
      canale = null;
      sessioneDellaBolla = null;
    },
  };
}
