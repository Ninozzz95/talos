/*
 * Controllo remoto — l'ELENCO CHIUSO delle operazioni che il telefono può chiedere (contratto §9, ELENCO-AZIONI §7: «tutto come
 * dal PC», una voce per azione, mai un'operazione generica tipo «chiamata HTTP» o «esegui comando»).
 *
 * Ogni voce ha un nome fisso `gruppo.azione` e un percorso FISSO del gestore HTTP del PC (`chiamata-interna.mjs`): validatori, tetti
 * ed errori sono quelli che usa la finestra del desktop. Gli argomenti del telefono diventano SOLO l'id della sessione (codificato
 * nel percorso) e il corpo; il metodo e il percorso non li sceglie mai il telefono.
 *
 * Le iscrizioni agli eventi non passano dal gestore HTTP (lì sono uno stream SSE): usano direttamente `iscriviti(sessionId,
 * ascoltatore, daSequenza)` del registro, lo stesso cursore «dal numero N» della rotta `/events` (http-app.mjs, `?after=` e
 * `Last-Event-ID`; contratto §11, nota di Nino1 §18.4). Un telefono che si ricollega chiede dal suo ultimo numero.
 *
 * Questo è il NUCLEO della prima uscita (contratto §9 + decisioni dell'owner): elenco, avvio, messaggio, coda, stop, carte,
 * domande, piano, impostazioni (modello, sforzo, permessi fino all'Accesso pieno), rinomina, eventi, e (R5.11) annullare le modifiche
 * ai file di un turno, con l'anteprima. Le altre voci dell'ELENCO
 * (agenti, viste, Lavoro, estensioni) si aggiungono qui, una per una, con la loro forma.
 * Solo dal PC (ELENCO-AZIONI §7.3): rendere fidati MCP, hook e plugin — non sono in elenco e il telefono riceve UNKNOWN_OPERATION.
 */

import { ID_CATALOGO_IN_UI } from '../provider-registry.mjs';

function errore(code, message) {
  return Object.assign(new Error(message), { code });
}

/* ⛔ Revisione del 19/10/2026: «.» e «..» passavano (`encodeURIComponent` non tocca i punti) e il gestore normalizza il percorso con
   `new URL`, quindi `/api/v1/sessions/../settings` diventava `/api/v1/settings` — fuori dall'elenco chiuso. Un id di soli punti no. */
const ID_SESSIONE = /^(?!\.+$)[A-Za-z0-9._:-]{1,200}$/;
const idSessione = (args) => {
  const id = args?.sessionId;
  if (typeof id !== 'string' || !ID_SESSIONE.test(id)) throw errore('BAD_MESSAGE', 'A valid session id is needed.');
  return encodeURIComponent(id);
};
/* R5.8: l'id di un server MCP (dichiarato nel progetto), mai un pezzo di percorso */
const idServerMcp = (args) => {
  const id = args?.serverId;
  if (typeof id !== 'string' || !ID_SESSIONE.test(id)) throw errore('BAD_MESSAGE', 'A valid MCP server id is needed.');
  return encodeURIComponent(id);
};
/* R5.11: il turno da cui annullare, un intero nel percorso (`…/file-undo/<turno>`), mai un pezzo di percorso scelto dal telefono */
const turnoDi = (args) => {
  const t = args?.turn;
  if (!Number.isSafeInteger(t) || t < 0 || t > 999_999_999) throw errore('BAD_MESSAGE', 'A valid turn number is needed.');
  return String(t);
};
/* R-M4 bis: il fornitore di cui il telefono chiede i modelli, solo fra quelli col catalogo nel selettore (la stessa lista della rotta,
   `http-app.mjs` `ROTTA_MODELLI_FORNITORE`), mai un pezzo di percorso */
const idFornitore = (args) => {
  const id = args?.provider;
  if (typeof id !== 'string' || !ID_CATALOGO_IN_UI.includes(id)) throw errore('BAD_MESSAGE', 'A known provider id is needed.');
  return id;
};
const corpoOggetto = (args) => {
  const c = args?.corpo ?? {};
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw errore('BAD_MESSAGE', 'The body must be an object.');
  return c;
};
/*
 * ⛔ RA-03 della revisione del Mobile (20/10/2026 notte, ALTA): `session.start` passava il corpo così com'è a `/sessions/custom`, che
 *   ammette anche `cartellaLibera` (qualunque percorso assoluto, `custom-task.mjs`) e `workspaceLaunchId`. Un telefono accoppiato (o
 *   un'app compromessa) apriva una sessione in QUALUNQUE cartella del PC, mentre «scegliere una cartella qualsiasi del PC» resta solo
 *   dal PC (sotto, R-M4). Dal telefono una sessione nuova si apre solo fra le cartelle ammesse (`cartellaId` di `projects.list`,
 *   decisione dell'owner). La rotta lo rifiuta di nuovo per l'origine remota (`http-app.mjs`): due cancelli, il secondo è il vero.
 */
const CAMPI_CARTELLA_SOLO_DAL_PC = Object.freeze(['cartellaLibera', 'workspaceLaunchId']);
const corpoAvvioDalTelefono = (args) => {
  const c = corpoOggetto(args);
  /* revisione del 21/10 (S4): lo stesso 403 della rotta, o il telefono (RA-04) leggerebbe «esito incerto» e la carta resterebbe ferma */
  if (CAMPI_CARTELLA_SOLO_DAL_PC.some((k) => Object.hasOwn(c, k))) throw Object.assign(errore('NOT_ALLOWED_REMOTELY', 'From the device a new session opens only in one of the allowed folders (cartellaId).'), { stato: 403 });
  return c;
};

/*
 * R-M4 (20/10/2026, Mobile: la sessione del PC usata dal telefono) — i fornitori del PC per il selettore dei modelli, in forma
 *   RIDOTTA: nome, se c'è una chiave (sì/no), modelli, accesso. Mai l'indirizzo (può portare un gettone nella query), mai il pool
 *   delle chiavi: «chiavi e accessi» restano solo dal PC (ELENCO-AZIONI §7, riga Modello).
 */
const CAMPI_FORNITORE_PER_IL_TELEFONO = Object.freeze(['id', 'label', 'requiresKey', 'keyConfigured', 'cloud', 'modelli', 'modelliDiRiserva', 'supportsOAuth', 'execution']);
const fornitoriRidotti = (dati) => ({
  items: (Array.isArray(dati?.items) ? dati.items : []).map((voce) => Object.fromEntries(
    CAMPI_FORNITORE_PER_IL_TELEFONO.filter((campo) => voce && Object.hasOwn(voce, campo)).map((campo) => [campo, voce[campo]]))),
});

/*
 * R-M4, revisione del 20/10 (A1): il Doctor del PC porta le righe COMPLETE dei fornitori (`doctor.mjs`, `providers.items` =
 *   `listPublic()`) e i percorsi del PC (`scratch`, archivio delle sessioni, nelle frasi e nei loro parametri). Al telefono arrivano
 *   i fornitori ridotti come in `providers.list`, e ogni percorso assoluto, in qualunque stringa, perde le cartelle (dove sta il nome
 *   dell'utente del PC): resta il nome finale, che basta a dire di che cosa si parla.
 */
const PERCORSO_ASSOLUTO = /(?:\b[A-Za-z]:[\\/]|\\\\[^\\\s"'<>|]+\\|\/(?:home|Users|mnt|root|tmp|var|private)\/)(?:[^\\/\s"'<>|]+[\\/])*/gu;
export function senzaPercorsiAssoluti(valore) {
  if (typeof valore === 'string') return valore.replace(PERCORSO_ASSOLUTO, '…/');
  if (Array.isArray(valore)) return valore.map(senzaPercorsiAssoluti);
  if (valore && typeof valore === 'object') return Object.fromEntries(Object.entries(valore).map(([k, v]) => [k, senzaPercorsiAssoluti(v)]));
  return valore;
}
const doctorPerIlTelefono = (dati) => senzaPercorsiAssoluti(dati?.providers
  ? { ...dati, providers: { ...dati.providers, items: fornitoriRidotti(dati.providers).items } }
  : dati);

/*
 * R-M4 bis (owner 20/10/2026 notte, dal Mobile: «quando il telefono usa una sessione del PC, il selettore mostra i modelli DEL PC»,
 *   come Hermes `slash_commands_model.py:454-492`, che offre solo i fornitori configurati): i modelli di un fornitore, coi soli campi
 *   che servono a sceglierne uno, e i modelli locali del PC con id e nome — MAI il percorso del file (porta il nome dell'utente).
 */
const CAMPI_MODELLO_PER_IL_TELEFONO = Object.freeze(['id', 'nome', 'name', 'provider', 'contextLength', 'capacita', 'inputModalities', 'reasoning', 'ragionamento', 'maxOutputTokens']);
const soloCampi = (voce, campi) => Object.fromEntries(campi.filter((c) => voce && Object.hasOwn(voce, c)).map((c) => [c, voce[c]]));
const modelliPerIlTelefono = (dati) => senzaPercorsiAssoluti({
  provider: typeof dati?.provider === 'string' ? dati.provider : null,
  modelli: (Array.isArray(dati?.modelli) ? dati.modelli : []).map((m) => soloCampi(m, CAMPI_MODELLO_PER_IL_TELEFONO)),
});
const modelliLocaliPerIlTelefono = (dati) => ({
  items: (Array.isArray(dati?.items) ? dati.items : []).filter((m) => typeof m?.id === 'string' && m.id)
    .map((m) => ({ id: m.id, nome: typeof m.name === 'string' && m.name ? m.name : m.id, modello: `local:${m.id}` })),
});

/** nome → { metodo, percorso(args), corpo?(args), filtra?(dati) } */
export const OPERAZIONI_HTTP = Object.freeze({
  'sessions.list': { metodo: 'GET', percorso: () => '/api/v1/sessions' },
  'session.start': { metodo: 'POST', percorso: () => '/api/v1/sessions/custom', corpo: corpoAvvioDalTelefono },
  'session.send': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/resume`, corpo: corpoOggetto },
  'session.queue': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/queue`, corpo: corpoOggetto },
  'session.stop': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/stop`, corpo: corpoOggetto },
  'session.approve': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/approve`, corpo: corpoOggetto },
  'session.answer': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/question`, corpo: corpoOggetto },
  'session.plan': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/plan-decision`, corpo: corpoOggetto },
  'session.settings': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/settings`, corpo: corpoOggetto },
  'session.rename': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/rename`, corpo: corpoOggetto },
  /* R5.11 (owner 18/10/2026, «Come Hermes, PC e telefono»): annullare le modifiche ai file dal telefono, con l'anteprima prima */
  'session.undo.list': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/file-undo` },
  'session.undo.preview': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/file-undo/${turnoDi(a)}` },
  'session.undo': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/file-undo/${turnoDi(a)}`, corpo: corpoOggetto },
  'session.undo.redo': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/file-undo/redo`, corpo: () => ({}) },
  /* R5.8 (owner 17/10): prova e riconnessione di un server MCP fidato; l'id del server passa per lo stesso filtro dell'id di sessione */
  /* R5.8 (owner 18/10, «Ferma e libera tutto»): la conferma la chiede il telefono prima di mandarla */
  'session.close': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/close`, corpo: () => ({}) },
  'session.mcp.list': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/mcp` },
  'session.mcp.test': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/mcp/${idServerMcp(a)}/test`, corpo: () => ({}) },
  /* R-M4 (20/10/2026, Mobile): le viste della sessione del PC dal telefono, come le righe dell'ELENCO-AZIONI §7 — Agenti (vedere),
     Il giro (attese aperte), Viste (/usage, processi in sola lettura), Estensioni (elenco degli hook, /doctor), Conversazione
     (/compact). Restano solo dal PC: /export, /fork, /delete, terminali, albero dei file, politica di compattazione, scegliere una
     cartella qualsiasi del PC, e ogni azione sui processi. */
  'session.children': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/children` },
  'session.pending': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/pending` },
  'session.metrics': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/metrics` },
  'session.processes': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/processes` },
  'session.hooks.list': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/hooks` },
  'session.compact': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/compact`, corpo: corpoOggetto },
  'doctor': { metodo: 'GET', percorso: () => '/api/v1/doctor', filtra: doctorPerIlTelefono },
  /* le cartelle dell'allowlist del PC: id e nome, mai il percorso (http-app.mjs, `/api/v1/projects`) — per `session.start` con `cartellaId` */
  'projects.list': { metodo: 'GET', percorso: () => '/api/v1/projects' },
  'models.list': { metodo: 'GET', percorso: () => '/api/v1/models' },
  'providers.list': { metodo: 'GET', percorso: () => '/api/v1/providers', filtra: fornitoriRidotti },
  'provider.models': { metodo: 'GET', percorso: (a) => `/api/v1/providers/${idFornitore(a)}/models`, filtra: modelliPerIlTelefono },
  'local-models.list': { metodo: 'GET', percorso: () => '/api/v1/local-models', filtra: modelliLocaliPerIlTelefono },
});

export const OPERAZIONI_EVENTI = Object.freeze(['session.events', 'session.unsubscribe']);
export const ISCRIZIONI_MASSIME = 8; // per connessione: il telefono guarda una conversazione, al più qualche figlia

/**
 * `chiama`: `creaChiamataInterna(...)`. `sessionRegistry`: per le iscrizioni (`esiste`, e la rigiocata di `iscrizione-sessione.mjs`,
 * la stessa della rotta `/events`).
 */
export function creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata }) {
  return {
    elenco() { return [...Object.keys(OPERAZIONI_HTTP), ...OPERAZIONI_EVENTI]; },

    async esegui(op, args, contesto) {
      const origine = `telefono:${contesto?.dispositivo?.id ?? '?'}`;
      const voce = Object.hasOwn(OPERAZIONI_HTTP, op) ? OPERAZIONI_HTTP[op] : null;
      if (voce) {
        const percorso = voce.percorso(args);
        const corpo = voce.corpo ? voce.corpo(args) : undefined;
        const origineRemota = { tipo: 'telefono', nome: contesto?.dispositivo?.nome ?? null };
        const { dati } = await chiama({ metodo: voce.metodo, percorso, corpo, origine, origineRemota });
        return voce.filtra ? voce.filtra(dati) : dati;
      }
      if (op === 'session.events') {
        const id = args?.sessionId;
        if (typeof id !== 'string' || !ID_SESSIONE.test(id)) throw errore('BAD_MESSAGE', 'A valid session id is needed.');
        const after = Number.isSafeInteger(args?.after) && args.after >= 0 ? args.after : 0;
        const sub = typeof args?.sub === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(args.sub) ? args.sub : null;
        if (!sub) throw errore('BAD_MESSAGE', 'A subscription needs a short id chosen by the device.');
        if (!sessionRegistry.esiste(id)) throw errore('NOT_FOUND', 'Session not found.');
        /* La stessa iscrizione due volte (il telefono la richiede dopo una «Riprova»): la vecchia si chiude prima. */
        contesto.iscrizioni.get(sub)?.();
        if (contesto.iscrizioni.size >= ISCRIZIONI_MASSIME && !contesto.iscrizioni.has(sub)) throw errore('RATE_LIMITED', 'Too many subscriptions on this connection.');
        let disiscrivi = null;
        const manda = contesto.iscrivi(sub, () => disiscrivi?.());
        disiscrivi = iscriviConRigiocata({ sessionRegistry, sessionId: id, daSequenza: after, manda: (evento) => { manda(evento)?.catch?.(() => {}); } });
        return { sub, after };
      }
      if (op === 'session.unsubscribe') {
        const sub = args?.sub;
        const chiudi = contesto.iscrizioni.get(sub);
        if (typeof chiudi === 'function') { chiudi(); contesto.iscrizioni.delete(sub); }
        return { sub, chiusa: typeof chiudi === 'function' };
      }
      throw errore('UNKNOWN_OPERATION', 'This operation is not available from the device.');
    },
  };
}
