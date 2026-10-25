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
/* Parità remoto ↔ desktop, punto 2 (owner 23/10 sera, «le azioni piccole che il PC ha già»): l'id di una compattazione e di un
   processo, con la stessa grammatica dell'id di sessione — mai un pezzo di percorso scelto dal dispositivo */
const idCompattazione = (args) => {
  /* l'istante ISO con cui nasce il record (`talos.compattazione`), come lo vuole `…/compaction/:at/undo` */
  const id = args?.compactionAt;
  if (typeof id !== 'string' || !ID_SESSIONE.test(id)) throw errore('BAD_MESSAGE', 'A valid compaction id is needed.');
  return encodeURIComponent(id);
};
const idProcesso = (args) => {
  /* la scheda «Processi» indica un comando con l'id della sua chiamata d'attrezzo (`…/processes/:toolCallId/stop`) */
  const id = args?.toolCallId;
  if (typeof id !== 'string' || !ID_SESSIONE.test(id)) throw errore('BAD_MESSAGE', 'A valid process id is needed.');
  return encodeURIComponent(id);
};
const corpoVuoto = () => ({});
/* 24/10: il giro prima del quale tagliare un ramo — stessa grammatica degli id; assente = ramo intero */
const puntoDelGiro = (args) => {
  if (args?.primaDelGiro === undefined || args?.primaDelGiro === null) return null;
  if (typeof args.primaDelGiro !== 'string' || !ID_SESSIONE.test(args.primaDelGiro)) throw errore('BAD_MESSAGE', 'A valid turn id is needed.');
  return args.primaDelGiro;
};
/* Parità, punto 4 (24/10): l'id di un messaggio da togliere, con la stessa grammatica — mai un pezzo di percorso */
const idMessaggio = (args) => {
  const id = args?.messageId;
  if (typeof id !== 'string' || !ID_SESSIONE.test(id)) throw errore('BAD_MESSAGE', 'A valid message id is needed.');
  return encodeURIComponent(id);
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
 * ⛔ D-REM-9 (Mobile, 23/10/2026 sera, dal vivo: GPT-6-Luna scelto sul Pad e nessun ragionamento da scegliere): i livelli dei modelli
 *   fuori dal catalogo OpenRouter — il piano ChatGPT (`chatgpt-rotte.mjs:58`) e i fornitori diretti (`provider-registry.mjs`, letti da
 *   `model-destination.mjs:107`) — viaggiano in `livelliRagionamento` e `livelloRagionamentoPredefinito`, non in `reasoning`. Il filtro li
 *   toglieva: il dispositivo leggeva il campo giusto e non lo riceveva mai.
 */
const CAMPI_MODELLO_PER_IL_TELEFONO = Object.freeze(['id', 'nome', 'name', 'provider', 'contextLength', 'capacita', 'inputModalities', 'reasoning', 'ragionamento',
  'livelliRagionamento', 'livelloRagionamentoPredefinito', 'maxOutputTokens']);
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
  /* Parità remoto ↔ desktop, punto 2 (owner 23/10 sera, censimento A10, A19, A21, A22, A23, A24, C2): le azioni piccole che il PC
     ha già. Le rotte sono quelle della finestra, coi loro controlli: qui solo l'elenco chiuso e la forma degli argomenti. */
  'session.queue.send': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/queue/invia`, corpo: corpoOggetto },
  'session.queue.cancel': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/queue/annulla`, corpo: corpoOggetto },
  'session.compact.skip': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/compaction/skip`, corpo: corpoOggetto },
  'session.compact.undo': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/compaction/${idCompattazione(a)}/undo`, corpo: corpoVuoto },
  /* 24/10 (rami di «Riprova» / «Modifica e rimanda», contratto R1): `primaDelGiro` facoltativo, controllato già nel percorso perché
     la forma si giudica prima del consenso; senza, il ramo dell'intera conversazione come prima */
  'session.fork': { metodo: 'POST', percorso: (a) => { puntoDelGiro(a); return `/api/v1/sessions/${idSessione(a)}/fork`; },
    corpo: (a) => { const p = puntoDelGiro(a); return p ? { primaDelGiro: p } : {}; } },
  'session.delete': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/delete`, corpo: corpoVuoto },
  'session.delegation.pause': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/delegation/pause`, corpo: corpoVuoto },
  'session.delegation.resume': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/delegation/resume`, corpo: corpoVuoto },
  'session.delegation.retry': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/delegation/retry`, corpo: corpoVuoto },
  'session.process.stop': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/processes/${idProcesso(a)}/stop`, corpo: corpoVuoto },
  'session.process.remove': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/processes/${idProcesso(a)}/remove`, corpo: corpoVuoto },
  'session.process.background': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/processes/${idProcesso(a)}/sfondo`, corpo: corpoVuoto },
  /* parità, punto 4 (Mobile 24/10, la Chat sul PC): togliere un messaggio, come la finestra (DELETE, nessun corpo) */
  'session.message.delete': { metodo: 'DELETE', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/messages/${idMessaggio(a)}` },
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
/*
 * R5.12 (owner 23/10/2026 sera; contratto `CONTRATTO-DISPOSITIVI-CARTELLE-FILE-RISORSE-2026-10-23.md`, parte 1, revisione 1): con
 *   `cartelle` (il modulo `cartelle-dispositivi.mjs`) le cartelle del dispositivo sono le recenti del PC, e ogni SCRITTURA in una
 *   sessione — avvio, messaggio, carte, domande, impostazioni, annulla — vuole il consenso per la cartella REALE di quella sessione.
 *   Leggere resta libero; fermare sempre ammesso (`session.stop`, `session.close`). Qui il controllo veloce, con l'errore che il
 *   dispositivo sa dire (`CONSENT_REQUIRED` coi `params` della cartella); il cancello vero è nelle rotte (`http-app.mjs`).
 */
const SCRITTURE_DI_SESSIONE = new Set(['session.send', 'session.queue', 'session.approve', 'session.answer', 'session.plan',
  'session.settings', 'session.rename', 'session.undo', 'session.undo.redo', 'session.mcp.test', 'session.compact',
  /* parità, punto 2: tutte scritture nella cartella della sessione (duplicare apre una sessione nuova lì, eliminare la chiude) — tranne
     fermare un processo e mettere in pausa una delega, che come `session.stop` sono sempre ammessi (fermare non scrive niente) */
  'session.queue.send', 'session.queue.cancel', 'session.compact.skip', 'session.compact.undo', 'session.fork', 'session.delete',
  'session.delegation.resume', 'session.delegation.retry', 'session.process.remove', 'session.process.background',
  'session.message.delete']); // parità, punto 4
export const OPERAZIONI_CONSENSO = Object.freeze(['consent.request', 'consent.wait', 'session.consent', 'chat.folder']); // Parte 4: chat.folder
/*
 * R5.13 (24/10/2026 notte; contratto Parte 2, «Revision 1: AGREED»): lo scambio di file, col modulo `file-dispositivi.mjs`. Ci sono
 *   solo se ci sono le cartelle col consenso (`cartelle`) E il modulo dei file: senza consenso non c'è modo di dire dove un dispositivo
 *   può scrivere, e si resta chiusi (UNKNOWN_OPERATION, come oggi). Le tre scritture vogliono il consenso della cartella REALE della
 *   sessione, ognuna (chunk ed end la ritrovano dal trasferimento, che porta la sua sessione); elenco e lettura sono letture: libere,
 *   come le altre letture di una sessione — ma solo dei file di quella conversazione, mai un percorso.
 */
export const OPERAZIONI_FILE = Object.freeze(['file.upload.begin', 'file.upload.chunk', 'file.upload.end', 'file.upload.abort', 'file.list', 'file.read', 'file.offers']);
const ID_RICHIESTA = /^[A-Za-z0-9_-]{8,64}$/u;
const conStato = (e, stato) => Object.assign(e, { stato });

export function creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle = null, file = null }) {
  /** La cartella reale di una sessione del PC, o null (la rotta deciderà). */
  const cartellaDellaSessione = async (sessionId) => {
    try {
      const w = await sessionRegistry?.cartellaPerChatFile?.(sessionId);
      return typeof w?.cartella === 'string' && w.cartella ? w.cartella : null;
    } catch { return null; }
  };
  const richiedeConsenso = async (dispositivoId, sessionId) => {
    const cartella = await cartellaDellaSessione(sessionId);
    if (!cartella || await cartelle.consentita(dispositivoId, cartella)) return;
    const descritta = await cartelle.descrivi(cartella);
    throw conStato(Object.assign(errore('CONSENT_REQUIRED', 'The computer must allow this device to write in this folder.'),
      { reason: 'consent-required', params: descritta ?? {} }), 403);
  };
  return {
    elenco() { return [...Object.keys(OPERAZIONI_HTTP), ...OPERAZIONI_EVENTI, ...(cartelle ? OPERAZIONI_CONSENSO : []), ...(cartelle && file ? OPERAZIONI_FILE : [])]; },

    async esegui(op, args, contesto) {
      const origine = `telefono:${contesto?.dispositivo?.id ?? '?'}`;
      const dispositivoId = contesto?.dispositivo?.id ?? null;
      /* l'identità viene dal canale autenticato, mai dagli argomenti (contratto, revisione 1, obiezione 3 del Mobile) */
      const origineRemota = { tipo: 'telefono', nome: contesto?.dispositivo?.nome ?? null, dispositivoId };
      if (cartelle && dispositivoId) {
        if (op === 'projects.list') return { items: await cartelle.elenco(dispositivoId) };
        /* Parte 4 (contratto, Mobile 24/10): la cartella della Chat, a parte dall'elenco del Codice (i dispositivi già usciti non la
           conoscono e la mostrerebbero fra le cartelle) */
        if (op === 'chat.folder') {
          const c = await cartelle.chat(dispositivoId);
          if (!c) throw conStato(errore('CHAT_UNAVAILABLE', 'This computer has no folder for the chats of devices.'), 404);
          return c;
        }
        if (op === 'consent.request') {
          const cartellaId = args?.cartellaId;
          if (typeof cartellaId !== 'string' || !cartellaId) throw conStato(errore('BAD_MESSAGE', 'A folder id is needed.'), 400);
          return cartelle.chiedi({ dispositivoId, nomeDispositivo: contesto?.dispositivo?.nome ?? null, cartellaId });
        }
        if (op === 'consent.wait') {
          const richiestaId = args?.richiestaId;
          if (typeof richiestaId !== 'string' || !ID_RICHIESTA.test(richiestaId)) throw conStato(errore('BAD_MESSAGE', 'A consent request id is needed.'), 400);
          return cartelle.attendi(dispositivoId, richiestaId);
        }
        if (op === 'session.consent') {
          idSessione(args);
          const cartella = await cartellaDellaSessione(args.sessionId);
          const descritta = cartella ? await cartelle.descrivi(cartella) : null;
          return { consentita: cartella ? await cartelle.consentita(dispositivoId, cartella) : false, ...(descritta ?? {}) };
        }
        if (op === 'session.start') {
          /* La cartella viene dall'elenco del dispositivo (mai un percorso suo); senza consenso, il PC tiene il corpo e avvia LUI la
             sessione al «Consenti» (obiezione 4 del Mobile): il primo messaggio della persona non si perde se il dispositivo cade. */
          const corpo = corpoAvvioDalTelefono(args);
          const trovata = await cartelle.trova(dispositivoId, corpo.cartellaId);
          if (!trovata) throw conStato(Object.assign(errore('FOLDER_NOT_LISTED', 'This folder is no longer on the computer.'), { reason: 'folder-not-listed' }), 404);
          const { cartellaId: _id, ...resto } = corpo;
          const avvia = async () => {
            const dati = (await chiama({ metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: { ...resto, cartellaLibera: trovata.reale }, origine, origineRemota })).dati;
            /* Parte 4: nella cartella della Chat si ricorda chi l'ha aperta (`dispositivoId` nelle righe di `sessions.list`) */
            if (trovata.riga.tipo === 'chat' && typeof dati?.sessionId === 'string') await cartelle.segnaSessioneChat(dati.sessionId, dispositivoId);
            return dati;
          };
          if (trovata.riga.consentita) return avvia();
          return cartelle.chiedi({ dispositivoId, nomeDispositivo: contesto?.dispositivo?.nome ?? null, cartellaId: trovata.riga.cartellaId,
            avvio: async () => (await avvia())?.sessionId ?? null });
        }
        /* parità, punto 4 (24/10, CHD-04): la FORMA degli argomenti prima del consenso — un id storto è BAD_MESSAGE, non «consenso
           richiesto» (che darebbe al dispositivo la carta di una cartella per una richiesta che non partirebbe comunque) */
        if (SCRITTURE_DI_SESSIONE.has(op)) { idSessione(args); OPERAZIONI_HTTP[op]?.percorso(args); await richiedeConsenso(dispositivoId, args.sessionId); }
      }
      if (OPERAZIONI_FILE.includes(op)) {
        if (!(cartelle && file && dispositivoId)) throw errore('UNKNOWN_OPERATION', 'This operation is not available from the device.');
        const a = args ?? {};
        if (op === 'file.upload.begin') {
          /* D-5/D-6 (25/10/2026): un'immagine per il modello non tocca cartelle: niente sessione, niente consenso (come la finestra) */
          if (a.immagine === true) {
            return file.inizia({ dispositivoId, nome: a.nome, dimensione: a.dimensione, sha256: a.sha256, riprendi: a.riprendi, immagine: true, sessionId: a.sessionId });
          }
          idSessione(a);
          await richiedeConsenso(dispositivoId, a.sessionId);
          return file.inizia({ dispositivoId, sessionId: a.sessionId, nome: a.nome, dimensione: a.dimensione, sha256: a.sha256, riprendi: a.riprendi });
        }
        /* B10-1 (contratto Parte 2 «Revision 4»): il dispositivo rinuncia a un suo trasferimento; niente consenso, toglie solo il suo parziale */
        if (op === 'file.upload.abort') return file.annulla({ dispositivoId, trasferimentoId: a.trasferimentoId });
        if (op === 'file.upload.chunk' || op === 'file.upload.end') {
          /* la sessione viene dal trasferimento (di QUESTO dispositivo), mai dagli argomenti; senza, il modulo dice UNKNOWN/EXPIRED */
          const sessione = await file.sessioneDelTrasferimento(dispositivoId, a.trasferimentoId);
          if (sessione) await richiedeConsenso(dispositivoId, sessione);
          return op === 'file.upload.chunk'
            ? file.pezzo({ dispositivoId, trasferimentoId: a.trasferimentoId, da: a.da, dati: a.dati })
            : file.fine({ dispositivoId, trasferimentoId: a.trasferimentoId });
        }
        /* D-3 (25/10/2026): le offerte in attesa di QUESTO dispositivo, in tutte le sessioni; il dispositivo viene dal canale */
        if (op === 'file.offers') return file.offerteInAttesa(dispositivoId);
        idSessione(a);
        if (op === 'file.list') return file.elenco({ dispositivoId, sessionId: a.sessionId });
        return file.leggi({ dispositivoId, sessionId: a.sessionId, fileId: a.fileId, versione: a.versione, da: a.da, quanti: a.quanti });
      }
      const voce = Object.hasOwn(OPERAZIONI_HTTP, op) ? OPERAZIONI_HTTP[op] : null;
      if (voce) {
        const percorso = voce.percorso(args);
        const corpo = voce.corpo ? voce.corpo(args) : undefined;
        const { dati } = await chiama({ metodo: voce.metodo, percorso, corpo, origine, origineRemota });
        const filtrati = voce.filtra ? voce.filtra(dati) : dati;
        /* il dispositivo sa PRIMA di scrivere se una sessione gli è consentita (frame 8 del bozzetto approvato) */
        if (cartelle && dispositivoId && op === 'sessions.list' && Array.isArray(filtrati?.items)) {
          return { ...filtrati, items: await Promise.all(filtrati.items.map(async (riga) => {
            const id = typeof riga?.sessionId === 'string' ? riga.sessionId : (typeof riga?.id === 'string' ? riga.id : null);
            const cartella = id ? await cartellaDellaSessione(id) : null;
            const descritta = cartella ? await cartelle.descrivi(cartella) : null;
            const daChi = descritta?.tipo === 'chat' && id ? await cartelle.dispositivoDellaSessioneChat(id) : null;
            return { ...riga, consentita: cartella ? await cartelle.consentita(dispositivoId, cartella) : false, ...(descritta ? { cartellaId: descritta.cartellaId } : {}),
              ...(daChi ? { dispositivoId: daChi } : {}) }; // Parte 4: chi ha aperto una chat sul PC
          })) };
        }
        return filtrati;
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
        const togliEventi = iscriviConRigiocata({ sessionRegistry, sessionId: id, daSequenza: after, manda: (evento) => { manda(evento)?.catch?.(() => {}); } });
        /* R5.13: l'avviso leggero `file.nuovo {sessionId, fileId}` sullo stesso stream (contratto, «Revision 1», Q2) — non salvato, non
           rigiocato: `file.list` resta la fonte di verità. Solo a chi ha le operazioni dei file. */
        const togliFile = cartelle && file && dispositivoId ? file.ascoltaSessione(id, dispositivoId, (evento) => { manda(evento)?.catch?.(() => {}); }) : null;
        disiscrivi = () => { togliEventi?.(); togliFile?.(); };
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
