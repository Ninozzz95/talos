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

import { realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { creaServizioGit } from '../git-service.mjs';
import { ID_CATALOGO_IN_UI } from '../provider-registry.mjs';
import { creaRotteNotifiche } from '../notifiche-rotte.mjs';
import { applicaToccaLaConversazione, voceCheVuoleIlPc, fraseDelPcPerIlDispositivo } from '../impostazioni/rotte-impostazioni.mjs';
import { PREFISSO_ROTTE_LUOGHI, creaRotteLuoghi } from '../computer-use/luoghi-rotte.mjs';
import { bloccataDa, indiceDeiNomi, isPathInside } from '../path-policy.mjs';
import { eventiDentroIlTetto } from './evento-dentro-il-tetto.mjs';
import { testoSfondoPerGliEventi } from '../kernel/talosHarness.mjs'; // revisione del blocco 26 (R26-1/2): ogni forma del percorso, non solo quella esatta
import { D, FILTRI_GIT, FILTRI_LIBRERIA, FILTRI_RICERCA, FILTRO_CARICAMENTO, OFFERTA, anteprimaAnnullaPerIlDispositivo, esitoAnnullaPerIlDispositivo, pesoSulFilo, rifiutoPerIlDispositivo, testoDentroIByte, tieni } from './lista-bianca.mjs';

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
/*
 * Context Manager dal dispositivo (`CONTRATTO-REMOTO-CONTEXT-MANAGER-2026-10-31.md`, punto 4). Forma misurata alla fonte il 01/11/2026: lavori e versioni sono UUID
 *   (`idFactory`, `engine.mjs:130`), le fonti `message-<n>` (`context-desktop-service.mjs:450`), i fatti l'id scelto dal chiamante. La forma della sessione li copre tutti.
 */
const idDelContesto = (args, campo) => {
  const id = args?.[campo];
  if (typeof id !== 'string' || !ID_SESSIONE.test(id)) throw errore('BAD_MESSAGE', `A valid ${campo} is needed.`);
  return encodeURIComponent(id);
};
const delContesto = (a) => `/api/v1/sessions/${idSessione(a)}/context`;
/* Le due letture a pezzi: l'impronta è uno sha-256, e la finestra si controlla prima di farne un pezzo di percorso */
const finestraDeiPezzi = (a) => {
  if (typeof a?.impronta !== 'string' || !/^[a-f0-9]{64}$/u.test(a.impronta) || !Number.isSafeInteger(a?.daByte) || a.daByte < 0 || !Number.isSafeInteger(a?.quantiByte) || a.quantiByte < 1) throw errore('BAD_MESSAGE', 'A valid piece is needed.');
  return new URLSearchParams({ impronta: a.impronta, daByte: String(a.daByte), quantiByte: String(a.quantiByte) }).toString();
};
const indiceDelMessaggio = (a) => {
  if (!Number.isSafeInteger(a?.indice) || a.indice < 0) throw errore('BAD_MESSAGE', 'A valid message index is needed.');
  return a.indice;
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
/* Owner 27/10/2026 («il dispositivo collegato deve poter cambiare tutte le impostazioni»): le azioni dell'obiettivo (/goal), solo quelle
   della rotta del PC (`http-app.mjs`, `/goal/(?:pausa|riprendi|togli|contratto|criteri|proposta|verifica)`), mai un pezzo di percorso */
const AZIONI_OBIETTIVO = new Set(['pausa', 'riprendi', 'togli', 'contratto', 'criteri', 'proposta', 'verifica']);
const azioneObiettivo = (args) => {
  const a = args?.action;
  if (typeof a !== 'string' || !AZIONI_OBIETTIVO.has(a)) throw errore('BAD_MESSAGE', 'A valid goal action is needed.');
  return a;
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
/*
 * 31/10/2026 (Mobile): `/home/` scattava anche dentro un indirizzo (`https://example.com/home/news/a`), e le fonti di una ricerca arrivavano rotte.
 * ⛔ D-38 (revisione del blocco 14): la prima cura guardava il carattere PRIMA di `/`, e così riapriva `/c/Users/...`, la forma di Git Bash: una riga di testo non si legge da un
 *   carattere. Ora si tiene solo ciò che è davvero altro: un indirizzo http(s) intero (primo ramo, che il `replace` rimette com'è) e un percorso RELATIVO, che comincia con un nome o
 *   con `.`/`..` e non dice niente del PC (`../home/x`, `a/home/b`, `src/tmp/c.js`, un ramo `feat/home/x/y`; Mobile). Tutto ciò che comincia con `/` resta da pulire, comunque continui.
 *   L'indirizzo finisce anche a `,;()[]{}`: se taglia un indirizzo vero il resto si controlla e basta, se lo lasciassi correre un percorso subito dopo uscirebbe (vince il percorso pulito).
 * ⛔ Il controllo del relativo sta DOPO la testa e guarda indietro di un tratto limitato: gira su ogni stringa di ogni risposta, e davanti a ogni `/` costerebbe quadratico. Oltre 32
 *   pezzi un percorso si tratta come assoluto, e si pulisce.
 * ⭐ Un nome con gli spazi (Mobile: `C:\Users\Mario Rossi\...`): un pezzo può avere fino a tre parole, se finisce con una barra. Le parole dopo la prima non hanno `:`, o `file.txt vedi
 *   https://x` mangerebbe l'indirizzo. Prezzo dichiarato: «/var/log/app è rotto/guasto» perde «app è rotto». Ricerca del 31/10/2026: Arti (`fs-mistrust`, `anon_home.rs`, che nomina proprio
 *   `C:\Users\Jane Doe\`) sostituisce la casa nota, che qui non basta perché la cartella può stare ovunque; lo scrubber di trusty-mpm (`scrubber/rules.rs`) si ferma allo spazio.
 */
const TESTA_DEL_PC = String.raw`\/(?:home|Users|mnt|root|tmp|var|private)\/`;
const NOME_DI_PERCORSO = String.raw`[\p{L}\p{N}._-]`;
const RELATIVO = String.raw`(?:^|[^\p{L}\p{N}._\\\/+@%~-])(?:\.{1,2}|[\p{L}\p{N}_]${NOME_DI_PERCORSO}{0,254}(?<!\.))(?:\/${NOME_DI_PERCORSO}{1,255}){0,32}`;
const INDIRIZZO_WEB = String.raw`\b[Hh][Tt][Tt][Pp][Ss]?:\/\/[^\s"'<>|\\,;(){}[\]]+`;
const PAROLA = String.raw`[^\\/\s"'<>|]+`;
const PAROLA_DOPO = String.raw`[^\\/\s"'<>|:]+`;
const PERCORSO_ASSOLUTO = new RegExp(String.raw`(${INDIRIZZO_WEB})|(?:\b[Ff][Ii][Ll][Ee]:\/\/\/?(?:[A-Za-z]:[\\/])?|\b[A-Za-z]:[\\/]|\\\\[^\\\s"'<>|]+\\|${TESTA_DEL_PC}(?<!${RELATIVO}${TESTA_DEL_PC}))(?:${PAROLA}(?: ${PAROLA_DOPO}){0,2}[\\/])*`, 'gu');
export function senzaPercorsiAssoluti(valore) {
  if (typeof valore === 'string') return valore.replace(PERCORSO_ASSOLUTO, (trovato, indirizzo) => (indirizzo ? trovato : '…/'));
  if (Array.isArray(valore)) return valore.map(senzaPercorsiAssoluti);
  if (valore && typeof valore === 'object') return Object.fromEntries(Object.entries(valore).map(([k, v]) => [k, senzaPercorsiAssoluti(v)]));
  return valore;
}
/*
 * Blocco 26 (condizione del Mobile alla forma dei registri dello sfondo, 01/11/2026): il registro di un comando in sottofondo ha un
 *   percorso ASSOLUTO del PC (col nome dell'utente). Al dispositivo arriva il nome da mostrare relativo alla cartella dati
 *   (`background/<id>.log`), nello stesso campo che legge già.
 * ⛔ Ritocco del Mobile (02/11/2026): regola unica, il nome è relativo alla SUA cartella — `background/<id>.log` nella cartella dati,
 *   `.talos/processi-sfondo/<id>.log` per un registro di prima rimasto nel progetto; mai `…/<id>.log`, mai il percorso del PC. Lo stesso
 *   nome prende il posto del percorso anche nel testo dell'evento (difesa: il nucleo lo manda già col nome corto). Un percorso che non
 *   è né l'uno né l'altro perde le cartelle come ogni altro percorso del PC. Il resto dell'evento o della riga resta com'è.
 */
const REGISTRO_NEL_PROGETTO = /[\\/]\.talos[\\/]processi-sfondo[\\/]([^\\/]+)$/u;
const fileSfondoPerIlTelefono = (voce) => {
  if (!voce || typeof voce !== 'object' || typeof voce.fileSfondo !== 'string' || voce.fileSfondo === '') return voce;
  const mostrato = typeof voce.fileSfondoMostrato === 'string' && voce.fileSfondoMostrato !== '' ? voce.fileSfondoMostrato : null;
  const vecchio = REGISTRO_NEL_PROGETTO.exec(voce.fileSfondo);
  const nome = mostrato ?? (vecchio ? `.talos/processi-sfondo/${vecchio[1]}` : senzaPercorsiAssoluti(voce.fileSfondo));
  return { ...voce, fileSfondo: nome, fileSfondoMostrato: nome,
    ...(typeof voce.content === 'string' ? { content: testoSfondoPerGliEventi(voce.content, voce.fileSfondo, nome) } : {}) };
};
const eventoPerIlTelefono = (evento) => (evento?.type === 'ToolCallResult' ? fileSfondoPerIlTelefono(evento) : evento);
const processiPerIlTelefono = (dati) => (Array.isArray(dati?.processi) ? { ...dati, processi: dati.processi.map(fileSfondoPerIlTelefono) } : dati);
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
  'livelliRagionamento', 'livelloRagionamentoPredefinito', 'maxOutputTokens', 'fasciaVeloce']);
const soloCampi = (voce, campi) => Object.fromEntries(campi.filter((c) => voce && Object.hasOwn(voce, c)).map((c) => [c, voce[c]]));
const modelliPerIlTelefono = (dati) => senzaPercorsiAssoluti({
  provider: typeof dati?.provider === 'string' ? dati.provider : null,
  modelli: (Array.isArray(dati?.modelli) ? dati.modelli : []).map((m) => {
    const { fasciaVeloce, ...campi } = soloCampi(m, CAMPI_MODELLO_PER_IL_TELEFONO);
    /* contratto §11: la lista bianca vale anche dentro il campo. Un sottocampo nuovo non esce da solo */
    return typeof fasciaVeloce?.id === 'string' && fasciaVeloce.id ? { ...campi, fasciaVeloce: { id: fasciaVeloce.id, descrizione: typeof fasciaVeloce.descrizione === 'string' ? fasciaVeloce.descrizione : null } } : campi;
  }),
});
const modelliLocaliPerIlTelefono = (dati) => ({
  items: (Array.isArray(dati?.items) ? dati.items : []).filter((m) => typeof m?.id === 'string' && m.id)
    .map((m) => ({ id: m.id, nome: typeof m.name === 'string' && m.name ? m.name : m.id, modello: `local:${m.id}` })),
});

/*
 * Ponte Git (owner 31/10/2026 sera, «Lettura e scrittura insieme»; contratto `CONTRATTO-GIT-PONTE-BOZZA-2026-10-31.md`, OK di Mobile e CLI): dal dispositivo le
 *   rotte della scheda Git del PC, una voce per azione: validatori, tetti ed errori restano i loro. Quattro livelli:
 *   - leggere è libero, coi soli campi di `lista-bianca.mjs`: un campo non elencato non esce;
 *   - il diff è il contenuto dei file, e il dispositivo non sfoglia i file del PC: vuole il consenso della cartella (Mobile), con un tetto. Il suo testo non si riscrive;
 *   - le scritture vogliono il consenso (owner: niente interruttore in più); ciò che perde lavoro vuole anche la carta (owner: due livelli; CLI, protezione 6);
 *   - l'invio si lega a ramo, remoto e commit che la carta ha mostrato (Mobile): se il PC è cambiato nel frattempo si rifiuta e si rimostra.
 *   Le voci che vogliono il consenso esistono solo se il PC ha le cartelle col consenso: senza, non c'è modo di dire chi può farlo (come `OPERAZIONI_FILE`).
 *   Un PC o un ospite senza servizio Git risponde `GIT_STORE_UNAVAILABLE`: le rotte sono facoltative (CLI).
 */
const queryGit = (args, ammesse) => {
  const q = new URLSearchParams();
  for (const k of ammesse) {
    const v = args?.[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') throw errore('BAD_MESSAGE', 'A Git query value must be text.');
    q.set(k, v);
  }
  const testo = q.toString();
  return testo ? `?${testo}` : '';
};
const letturaGit = (nome, ammesse = []) => ({ metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/git/${nome}${queryGit(a, ammesse)}`, filtra: FILTRI_GIT[nome] });
const cartaGit = (args) => {
  if (args?.confermata !== true) throw conStato(errore('CONFIRMATION_REQUIRED', 'This Git action needs the confirmation on the device.'), 409);
};
/* `forma`: ciò che si giudica prima del consenso (B5): una richiesta che non partirebbe comunque non chiede una carta di cartella */
const scritturaGit = (nome, vuoleCarta = false, corpo = corpoOggetto, forma = null) => ({ metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/git/${nome}`, corpo, filtra: FILTRI_GIT[nome],
  forma: (a) => { corpoOggetto(a); forma?.(a); },
  ...(vuoleCarta ? { controlla: vuoleCarta === true ? cartaGit : vuoleCarta } : {}) });
const VISTO_DELL_INVIO = Object.freeze(['ramo', 'remoto', 'urlInvio', 'destinazione', 'commit']);
const vistoDellInvio = (args) => {
  if (VISTO_DELL_INVIO.some((k) => typeof args?.visto?.[k] !== 'string' || !args.visto[k])) throw errore('BAD_MESSAGE', 'The push must say what the card showed.');
};
const cartaDellInvio = (args) => { cartaGit(args); vistoDellInvio(args); };
/* Punto 4 del Mobile: ciò che la carta ha mostrato si confronta dentro `invia`, nella stessa operazione dell'invio: dal ponte restava una finestra */
const corpoDellInvio = (a) => ({ ...corpoOggetto(a), visto: Object.fromEntries(VISTO_DELL_INVIO.map((k) => [k, a.visto[k]])) });
/* Parità remoto (censimento C3, owner: «dal dispositivo gira sul PC»): la Ricerca di una sessione, sulle rotte della finestra. L'id con la grammatica di `idRicercaValido`, mai un
   pezzo di percorso. Fuori: l'esportazione, che è un file e non una risposta JSON. Una ricerca nuova parte dal messaggio, con l'attrezzo del modello. */
const ID_RICERCA = /^[A-Za-z0-9_-]{1,64}$/u;
const idRicerca = (args) => {
  if (typeof args?.ricercaId !== 'string' || !ID_RICERCA.test(args.ricercaId)) throw errore('BAD_MESSAGE', 'A valid research id is needed.');
  return args.ricercaId;
};
const percorsoRicerca = (a, coda = '') => `/api/v1/sessions/${idSessione(a)}/research/${idRicerca(a)}${coda}`;
const chiaveRicerca = (a) => `ricerca/${idRicerca(a)}`;
const VOCI_RICERCA = Object.freeze({
  'session.research.list': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/research`, filtra: FILTRI_RICERCA.list },
  'session.research.get': { metodo: 'GET', percorso: (a) => percorsoRicerca(a), filtra: FILTRI_RICERCA.get },
  'session.research.pause': { metodo: 'POST', percorso: (a) => percorsoRicerca(a, '/pausa'), corpo: corpoVuoto, filtra: FILTRI_RICERCA.azione }, // fermare non scrive niente
  'session.research.resume': { metodo: 'POST', percorso: (a) => percorsoRicerca(a, '/ripresa'), corpo: corpoVuoto, filtra: FILTRI_RICERCA.azione },
  'session.research.recheck': { metodo: 'POST', percorso: (a) => percorsoRicerca(a, '/riverifica'), corpo: corpoVuoto, filtra: FILTRI_RICERCA.recheck },
  /* come `session.library.delete`: la ricerca se ne va col suo rapporto e non torna indietro, e la conferma che sul PC vive nel pannello qui è la carta */
  'session.research.delete': { metodo: 'DELETE', percorso: (a) => percorsoRicerca(a), controlla: (a) => cartaGit(a), copie: (a) => chiaveRicerca(a), filtra: FILTRI_RICERCA.delete },
});
/* Parità remoto (censimento C1, forma col Mobile 31/10/2026): la Libreria di una sessione. L'elenco porta la cartella del PC con la provenienza (`library-store.mjs:262`): via, non
   mascherata. Il contenuto passa da `session.library.fetch`, un'offerta per quel dispositivo; `rivela` e `apri` agiscono sullo schermo del PC e restano fuori. */
const ID_VOCE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u; // `idVoceLibreriaValido`
const idVoce = (args) => {
  if (typeof args?.voceId !== 'string' || !ID_VOCE.test(args.voceId)) throw errore('BAD_MESSAGE', 'A valid Library entry id is needed.');
  return args.voceId;
};
const idVersione = (args) => {
  if (typeof args?.versione !== 'string' || !ID_VOCE.test(args.versione)) throw errore('BAD_MESSAGE', 'A valid version id is needed.');
  return args.versione;
};
const percorsoVoce = (a, coda = '') => `/api/v1/sessions/${idSessione(a)}/library/${idVoce(a)}${coda}`;
const chiaveVoce = (a) => `libreria/${idVoce(a)}`;
const VOCI_LIBRERIA = Object.freeze({
  'session.library.list': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/library`, filtra: FILTRI_LIBRERIA.list },
  'session.library.versions': { metodo: 'GET', percorso: (a) => percorsoVoce(a, '/versions'), filtra: FILTRI_LIBRERIA.versions },
  'session.library.rename': { metodo: 'PATCH', percorso: (a) => percorsoVoce(a), corpo: corpoOggetto, forma: corpoOggetto, filtra: FILTRI_LIBRERIA.rename },
  'session.library.restore': { metodo: 'POST', percorso: (a) => percorsoVoce(a, `/versions/${idVersione(a)}/restore`), corpo: corpoVuoto, copie: (a) => chiaveVoce(a), filtra: FILTRI_LIBRERIA.restore },
  /* `eliminaVoce` toglie la voce con le sue versioni e non torna indietro: la conferma, che sul PC vive nel pannello, qui è la carta (Mobile) */
  'session.library.delete': { metodo: 'DELETE', percorso: (a) => percorsoVoce(a), controlla: (a) => cartaGit(a), copie: (a) => chiaveVoce(a), filtra: FILTRI_LIBRERIA.delete },
});
const VOCI_GIT = Object.freeze({
  ...Object.fromEntries(['status', 'branch', 'log', 'branches', 'stashes', 'remotes', 'sync'].map((nome) => [`session.git.${nome}`, letturaGit(nome)])),
  'session.git.changes': letturaGit('changes', ['a', 'da']),
  'session.git.diff': letturaGit('diff', ['percorso', 'area']),
  'session.git.changes-diff': letturaGit('changes-diff', ['a', 'da', 'percorso', 'prima']),
  ...Object.fromEntries(['stage', 'unstage', 'commit', 'commit-staged', 'switch', 'branch-create', 'branch-rename', 'stash', 'stash-pop', 'fetch', 'commit-message']
    .map((nome) => [`session.git.${nome}`, scritturaGit(nome)])),
  ...Object.fromEntries(['discard', 'amend', 'undo-commit', 'branch-delete', 'stash-drop', 'pull'].map((nome) => [`session.git.${nome}`, scritturaGit(nome, true)])),
  /* Punto 1 del Mobile: la rotta legge l'azione come chiave, e `['annulla']` annullava senza carta. Si salta la carta solo con le due stringhe note; ogni altro tipo si rifiuta prima */
  'session.git.hunk': scritturaGit('hunk', (a) => { if (a.corpo.azione === 'annulla') cartaGit(a); }, corpoOggetto, (a) => {
    if (!['prepara', 'togli', 'annulla'].includes(a?.corpo?.azione)) throw errore('BAD_MESSAGE', 'A valid hunk action is needed.');
  }),
  /* senza carta il rifiuto giusto è la carta: il `visto` si guarda solo in chi dice di averla vista */
  'session.git.push': scritturaGit('push', cartaDellInvio, corpoDellInvio, (a) => { if (a?.confermata === true) vistoDellInvio(a); }),
  'session.git.fetch-stop': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/git/fetch-stop`, corpo: corpoVuoto, filtra: FILTRI_GIT['fetch-stop'] }, // fermare non scrive niente
});
const VOCI_GIT_LIBERE = new Set(['status', 'branch', 'log', 'branches', 'stashes', 'remotes', 'sync', 'changes', 'fetch-stop'].map((nome) => `session.git.${nome}`));
/* revisione del Mobile (31/10/2026): su un PC senza consenso delle cartelle nessuna scrittura per la cartella esiste, né nell'elenco né alla rotta. Prima valeva solo per Git */
const VOCI_COL_CONSENSO = new Set([...Object.keys(VOCI_GIT).filter((op) => !VOCI_GIT_LIBERE.has(op)),
  'session.research.resume', 'session.research.recheck', 'session.research.delete',
  'session.library.rename', 'session.library.restore', 'session.library.delete', 'session.library.fetch', 'session.research.export']);
const nomiGit = (...nomi) => nomi.map((nome) => `session.git.${nome}`);
/* Punto 12 del Mobile: da una sottocartella queste cambiano tutto il repository, quindi vogliono il consenso sulla sua radice */
const VOCI_SULLA_RADICE = new Set(nomiGit('amend', 'undo-commit', 'switch', 'branch-create', 'branch-rename', 'branch-delete', 'stash-pop', 'stash-drop', 'fetch', 'pull', 'push'));
const VOCI_COI_PERCORSI = new Set(nomiGit('stage', 'unstage', 'commit', 'discard', 'hunk', 'diff', 'changes-diff'));
/* N7 del Mobile: `corpo.percorsi` vale solo dove la rotta lo legge. Sulle altre voci non è niente, e non conta nel tetto */
const VOCI_CON_ELENCO = new Set(nomiGit('stage', 'unstage', 'commit', 'discard'));
const percorsiDellaVoce = (args, op) => [...(VOCI_CON_ELENCO.has(op) && Array.isArray(args.corpo?.percorsi) ? args.corpo.percorsi : []), args.corpo?.percorso, args.percorso, args.prima].filter((p) => typeof p === 'string');
/*
 * D5: `percorsoVero` e `bloccataDa` risalgono un livello alla volta e rileggono tutto il percorso a ogni livello: il costo è lunghezza per livelli, misurato il 31/10/2026 con una risalita sola:
 *   16.383 livelli in 32.765 caratteri 3,1 s, 2.048 livelli in 32.767 caratteri 262 ms. Si misura prima di ogni risalita e prima del consenso, come ogni forma.
 *   ⛔ I due tetti non sono scelti: 32.767 caratteri è il limite di Windows per un percorso («a maximum total path length of 32,767 characters», Microsoft Learn, «Maximum Path Length
 *   Limitation»), e 2048 livelli è il tetto di git (`core.maxTreeDepth`, git-config(1)): oltre, git non ci arriva. Il tetto di caratteri da solo non basta: 20 KB stanno sotto, e fermavano il PC 3 s.
 *   1000 percorsi è il tetto della rotta (`normalizzaElenco`), qui prima che ognuno risalga.
 *   ⛔ I tre tetti da soli lasciavano 32 percorsi ai due tetti in 1 MiB: 32 s, col ciclo fermo fino a 20 s (misurato). Una richiesta intera costa al più come un percorso solo ai due tetti, ~1 s:
 *   1000 percorsi da 400 caratteri e 20 livelli ne usano meno di un ottavo.
 */
const TETTO_CARATTERI_PERCORSO = 32_767;
const TETTO_LIVELLI_PERCORSO = 2048;
const TETTO_PERCORSI = 1000;
const TETTO_COSTO_RICHIESTA = TETTO_CARATTERI_PERCORSO * TETTO_LIVELLI_PERCORSO;
const misuraDeiPercorsi = (args, op) => {
  const percorsi = percorsiDellaVoce(args, op);
  if (percorsi.length > TETTO_PERCORSI) throw conStato(errore('GIT_PATHS_REQUIRED', 'Too many paths in a single request.'), 422);
  let costo = 0;
  for (const p of percorsi) {
    const livelli = p.length > TETTO_CARATTERI_PERCORSO ? Infinity : p.split(/[\\/]+/u).length;
    costo += p.length * livelli;
    if (livelli > TETTO_LIVELLI_PERCORSO || costo > TETTO_COSTO_RICHIESTA) throw conStato(errore('GIT_PATH_INVALID', 'This path is too long.'), 422);
  }
};
/* D2: queste leggono o chiudono il preparato senza nominare un percorso */
const VOCI_DEL_PREPARATO = new Set(nomiGit('commit-message', 'commit-staged'));

/** nome → { metodo, percorso(args), corpo?(args), filtra?(dati), controlla?(args) } */
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
  'session.pin': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/pin`, corpo: corpoOggetto }, // decisione 69 (03/11), ritocco del Mobile
  /* R5.11 (owner 18/10/2026, «Come Hermes, PC e telefono»): annullare le modifiche ai file dal telefono, con l'anteprima prima */
  'session.undo.list': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/file-undo` },
  'session.undo.preview': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/file-undo/${turnoDi(a)}`, filtra: anteprimaAnnullaPerIlDispositivo }, // il diff è il contenuto dei file (contratto)
  'session.undo': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/file-undo/${turnoDi(a)}`, corpo: corpoOggetto, forma: corpoOggetto, filtra: esitoAnnullaPerIlDispositivo },
  'session.undo.redo': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/file-undo/redo`, corpo: () => ({}), filtra: esitoAnnullaPerIlDispositivo },
  /* R5.8 (owner 17/10): prova e riconnessione di un server MCP fidato; l'id del server passa per lo stesso filtro dell'id di sessione */
  /* R5.8 (owner 18/10, «Ferma e libera tutto»): la conferma la chiede il telefono prima di mandarla */
  'session.close': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/close`, corpo: () => ({}) },
  'session.mcp.list': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/mcp` },
  'session.mcp.test': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/mcp/${idServerMcp(a)}/test`, corpo: () => ({}) },
  /* R-M4 (20/10/2026, Mobile): le viste della sessione del PC dal telefono, come le righe dell'ELENCO-AZIONI §7 — Agenti (vedere),
     Il giro (attese aperte), Viste (/usage, processi in sola lettura), Estensioni (elenco degli hook, /doctor), Conversazione
     (/compact). Quella lista di «solo dal PC» è stata superata pezzo per pezzo: /fork e /delete (parità, 24/10), processi (parità, punto 2),
     esportazione e politica di compattazione (Context Manager dal dispositivo, 01/11). Restano solo dal PC: terminali, albero dei file e
     scegliere una cartella qualsiasi del PC. */
  'session.children': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/children` },
  'session.pending': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/pending` },
  'session.metrics': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/metrics` },
  'session.processes': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/processes`, filtra: processiPerIlTelefono }, // blocco 26
  'session.hooks.list': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/hooks` },
  'session.compact': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/compact`, corpo: corpoOggetto },
  /* FE-010: la chat a lato legge la conversazione e spende, quindi passa dal consenso del dispositivo */
  'session.side': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/a-lato`, corpo: corpoOggetto },
  'session.side.transform': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/a-lato/trasforma`, corpo: corpoOggetto },
  /* Parità remoto ↔ desktop, punto 2 (owner 23/10 sera, censimento A10, A19, A21, A22, A23, A24, C2): le azioni piccole che il PC
     ha già. Le rotte sono quelle della finestra, coi loro controlli: qui solo l'elenco chiuso e la forma degli argomenti. */
  'session.queue.send': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/queue/invia`, corpo: corpoOggetto },
  /* owner 27/10/2026: «il dispositivo collegato deve poter cambiare tutte le impostazioni» — anche dove girano i comandi e il loro racconto */
  'session.commands-location': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/dove-girano-i-comandi`, corpo: corpoOggetto },
  /* owner 27/10/2026, secondo passo: il motore del contesto della conversazione — leggerlo e cambiarne le impostazioni (la rotta vuole
     `{ patch, expectedRevision }`: la revisione la dà la lettura, come al pannello del PC). Il motore avvisa già ogni finestra da sé. */
  'session.context': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/context` },
  'session.context.settings': { metodo: 'PATCH', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/context/settings`, corpo: corpoOggetto },
  /* Context Manager dal dispositivo: le rotte che il PC chiama da `context-client.js`. `expectedRevision` e `idempotencyKey` li manda il dispositivo; un conflitto torna
     `CTX_STALE_REVISION` così com'è, e senza servizio del contesto `CTX_NOT_ENABLED`: il telefono rilegge o nasconde */
  'session.context.job.start': { metodo: 'POST', percorso: (a) => `${delContesto(a)}/jobs`, corpo: corpoOggetto },
  'session.context.job': { metodo: 'GET', percorso: (a) => `${delContesto(a)}/jobs/${idDelContesto(a, 'jobId')}` },
  'session.context.job.cancel': { metodo: 'DELETE', percorso: (a) => `${delContesto(a)}/jobs/${idDelContesto(a, 'jobId')}`, corpo: corpoOggetto },
  'session.context.job.resume': { metodo: 'POST', percorso: (a) => `${delContesto(a)}/jobs/${idDelContesto(a, 'jobId')}/resume`, corpo: corpoOggetto },
  'session.context.versions': { metodo: 'GET', percorso: (a) => `${delContesto(a)}/versions` },
  'session.context.version.restore': { metodo: 'POST', percorso: (a) => `${delContesto(a)}/versions/${idDelContesto(a, 'versionId')}/restore`, corpo: corpoOggetto },
  'session.context.facts': { metodo: 'GET', percorso: (a) => `${delContesto(a)}/facts` },
  /* come `upsertProtectedFact` del PC: col `factId` si modifica quel fatto, senza se ne crea uno */
  'session.context.fact.upsert': { metodo: 'PATCH', metodoSeNuovo: (a) => (a?.factId === undefined ? 'POST' : null), percorso: (a) => `${delContesto(a)}/facts${a?.factId === undefined ? '' : `/${idDelContesto(a, 'factId')}`}`, corpo: corpoOggetto },
  'session.context.fact.remove': { metodo: 'DELETE', percorso: (a) => `${delContesto(a)}/facts/${idDelContesto(a, 'factId')}`, corpo: corpoOggetto },
  'session.context.fact.resolve': { metodo: 'POST', percorso: (a) => `${delContesto(a)}/facts/${idDelContesto(a, 'factId')}/resolve`, corpo: corpoOggetto },
  'session.context.source': { metodo: 'GET', percorso: (a) => `${delContesto(a)}/sources/${idDelContesto(a, 'sourceId')}` },
  'session.compaction-policy': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/compaction-policy` },
  'session.compaction-state': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/compaction-state` },
  /* ultima richiesta ed esportazione a pezzi (`letture-a-pezzi.mjs`): letture, ma col consenso della cartella, qui e nella rotta. Oscurate prima di uscire dal PC */
  'session.last-request': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/last-request/pieces` },
  'session.last-request.message': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/last-request/pieces/${indiceDelMessaggio(a)}?${finestraDeiPezzi(a)}` },
  'session.export': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/export/pieces` },
  'session.export.piece': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/export/pieces/data?${finestraDeiPezzi(a)}` },
  'session.goal': { metodo: 'GET', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/goal` },
  'session.goal.set': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/goal`, corpo: corpoOggetto },
  'session.goal.action': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/goal/${azioneObiettivo(a)}`, corpo: corpoOggetto },
  'session.commands-in-chat': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/comandi-nella-conversazione`, corpo: corpoOggetto },
  'session.queue.cancel': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/queue/annulla`, corpo: corpoOggetto },
  'session.compact.skip': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/compaction/skip`, corpo: corpoOggetto },
  'session.compact.undo': { metodo: 'POST', percorso: (a) => `/api/v1/sessions/${idSessione(a)}/compaction/${idCompattazione(a)}/undo`, corpo: corpoVuoto },
  /* 24/10 (rami di «Riprova» / «Modifica e rimanda», contratto R1): `primaDelGiro` facoltativo, controllato già nel percorso perché
     la forma si giudica prima del consenso; senza, il ramo dell'intera conversazione come prima */
  'session.fork': { metodo: 'POST', percorso: (a) => { puntoDelGiro(a); return `/api/v1/sessions/${idSessione(a)}/fork`; },
    corpo: (a) => { const p = puntoDelGiro(a); return p ? { primaDelGiro: p } : {}; } },
  /* Decisione 198 (condizione 1 del Mobile): «Riprova» del telefono in UNA operazione — il ramo e il giro insieme; consenso come `session.fork` */
  'session.retry': { metodo: 'POST', percorso: (a) => { puntoDelGiro(a); return `/api/v1/sessions/${idSessione(a)}/retry`; },
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
  'engine.loading': { metodo: 'GET', percorso: () => '/api/v1/runtime/caricamento', filtra: FILTRO_CARICAMENTO }, // 01/11/2026, sola lettura: un telefono vecchio non la chiede
  'providers.list': { metodo: 'GET', percorso: () => '/api/v1/providers', filtra: fornitoriRidotti },
  'provider.models': { metodo: 'GET', percorso: (a) => `/api/v1/providers/${idFornitore(a)}/models`, filtra: modelliPerIlTelefono },
  'local-models.list': { metodo: 'GET', percorso: () => '/api/v1/local-models', filtra: modelliLocaliPerIlTelefono },
  /* owner 29/10/2026: preferiti e usati di recente dei modelli, gli stessi del PC (contratto CONTRATTO-PREFERITI-MODELLI-2026-10-29.md);
     il corpo lo controlla la rotta, come per le altre scritture */
  'models.preferences': { metodo: 'GET', percorso: () => '/api/v1/model-preferences' },
  'models.preferences.update': { metodo: 'POST', percorso: () => '/api/v1/model-preferences', corpo: corpoOggetto },
  /* owner 27/10/2026, «tutte le impostazioni» (FE-053, 01/11): il modello delle compattazioni e la sua riserva valgono per tutto il PC, come i preferiti
     qui sopra: niente consenso per cartella, che non c'entra. Il corpo lo controlla la rotta. */
  'context.settings': { metodo: 'GET', percorso: () => '/api/v1/context-settings' },
  'context.settings.update': { metodo: 'POST', percorso: () => '/api/v1/context-settings', corpo: corpoOggetto },
  /* UI-151 (04/11/2026, Mobile 11:40, CLI 11:41): «Blocchi vivi nelle risposte» (decisione 140), SOLA lettura. Si scrive solo con
     `app-settings.apply` (voce `chat.liveBlocks`, ricevuta col dispositivo e Annulla): niente `chat.settings.update`. Un ospite senza
     l'archivio (la CLI) risponde 503 `CHAT_SETTINGS_UNAVAILABLE`, che il telefono legge «spento, non disponibile»: mai «acceso». */
  'chat.settings': { metodo: 'GET', percorso: () => '/api/v1/chat-settings' },
  /* `/settings` della persona dal dispositivo (02/11/2026, forma FORMA-SETTINGS-DELLA-PERSONA, OK del Mobile): la rotta del PC, col corpo
     `{ sessionId?, changes, expectedRevision? }`. Origine e conferma le stampa la rotta (`dispositivo`, l'id del canale); le voci di
     sicurezza e aggiornamenti tornano `PC_CONFIRMATION_REQUIRED` senza scrivere; una voce della conversazione vuole il consenso della cartella. */
  'app-settings.apply': { metodo: 'POST', percorso: () => '/api/v1/app-settings/apply', corpo: corpoOggetto },
  ...VOCI_GIT,
  ...VOCI_RICERCA,
  ...VOCI_LIBRERIA,
});

const VOCI_DI_ANNULLA = Object.freeze(['session.undo.preview', 'session.undo', 'session.undo.redo']);
/* Fermare non scrive niente e resta sempre possibile: nessun consenso, e nemmeno la lettura dei blocchi (B6). Sulla pausa della ricerca lo stesso */
const VOCI_CHE_FERMANO = Object.freeze(new Set(['session.git.fetch-stop', 'session.research.pause']));
/* Le voci di `CONTRATTO-LISTA-BIANCA-PONTE-2026-10-31.md`: i loro campi e i loro rifiuti stanno in `lista-bianca.mjs` */
export const VOCI_DEL_CONTRATTO = Object.freeze(new Set([...Object.keys(VOCI_GIT), ...Object.keys(VOCI_RICERCA), ...Object.keys(VOCI_LIBRERIA), 'session.library.fetch', 'session.research.export', ...VOCI_DI_ANNULLA]));
/* Revisione del Mobile: una lettura può pesare 1 MiB, e ricordarne 512 per dispositivo costa mezzo giga. Rileggere è già idempotente */
export const LETTURE_DEL_CONTRATTO = Object.freeze(new Set([...VOCI_DEL_CONTRATTO].filter((op) => OPERAZIONI_HTTP[op]?.metodo === 'GET')));
/* D-45: una scrittura eseguita non si dice rifiutata perché la sua risposta non entra nel filo. Il tetto lascia spazio alla busta */
const TETTO_RISPOSTA_BYTE = 1024 * 1024 - 1024;
export const OPERAZIONI_EVENTI = Object.freeze(['session.events', 'session.unsubscribe']);
/**
 * 27/10/2026 (Mobile, caso dell'owner «sul PC è fermo, sul dispositivo lavora»): lo stream locale ha `:battito` ogni 15 s
 * (`http-app.mjs`, P0 punto 7), l'iscrizione remota non aveva niente. Un'iscrizione persa senza che la connessione si chiuda, o uno
 * stream muto, lasciava il dispositivo senza modo di accorgersene. Ora ogni iscrizione viva riceve questo evento ogni 15 s: senza
 * `_sequenza`, quindi mai salvato, mai rigiocato, e `after` non si muove. Il dispositivo (dalla sua parte) riapre l'iscrizione se a
 * giro vivo non arriva niente per 40 s. Un CUSTOM sconosciuto i telefoni già usciti lo ignorano (verificato dal Mobile).
 */
export const BATTITO_REMOTO = Object.freeze({ type: 'CUSTOM', name: 'talos.battito', value: Object.freeze({}) });
/**
 * 27/10/2026 (revisione GFR del Mobile, B1/B2): il battito prova il FILO, non la sorgente — un'iscrizione al registro persa con la
 *   connessione viva, o un PC riavviato a metà giro (nessun terminale scritto), lasciavano il battito regolare e il dispositivo «al
 *   lavoro». Ora porta anche `ultimaSequenza` e `lavora` dal registro (`statoPerIlBattito`), letti a ogni battito; un registro che
 *   non li sa dare manda il battito di prima, vuoto.
 */
export function battitoConStato(stato) {
  if (!stato || !Number.isSafeInteger(stato.ultimaSequenza) || typeof stato.lavora !== 'boolean') return BATTITO_REMOTO;
  return { type: 'CUSTOM', name: 'talos.battito', value: { ultimaSequenza: stato.ultimaSequenza, lavora: stato.lavora } };
}
export const BATTITO_REMOTO_MS = 15_000;
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
const SCRITTURE_DI_SESSIONE = new Set(['session.side', 'session.side.transform', 'session.send', 'session.queue', 'session.approve', 'session.answer', 'session.plan',
  'session.settings', 'session.rename', 'session.pin', 'session.undo', 'session.undo.redo', 'session.mcp.test', 'session.compact',
  /* parità, punto 2: tutte scritture nella cartella della sessione (duplicare apre una sessione nuova lì, eliminare la chiude) — tranne
     fermare un processo e mettere in pausa una delega, che come `session.stop` sono sempre ammessi (fermare non scrive niente) */
  'session.queue.send', 'session.queue.cancel', 'session.compact.skip', 'session.compact.undo', 'session.fork', 'session.retry', 'session.delete',
  'session.delegation.resume', 'session.delegation.retry', 'session.process.remove', 'session.process.background',
  'session.message.delete', // parità, punto 4
  'session.commands-location', 'session.commands-in-chat', 'session.goal.set', 'session.goal.action', 'session.context.settings', 'session.undo.preview',
  'session.context.job.start', 'session.context.job.resume', 'session.context.version.restore', 'session.context.fact.upsert', 'session.context.fact.remove', 'session.context.fact.resolve', 'session.last-request', 'session.last-request.message', 'session.export', 'session.export.piece', // Context Manager dal dispositivo
  /* revisione del blocco 25, R2: una fonte dell'archivio del motore (`message-<n>`) porta gli stessi messaggi dell'ultima richiesta. Consenso qui, prima di chiamare la rotta */
  'session.context.source',
  /* condizione del Mobile (01/11/2026 sera): riassunto e indice della compattazione semplice, scritti da chi riceve prompt di sistema, progetto e memoria */
  'session.compaction-state',
  ...VOCI_COL_CONSENSO]); // owner 27/10/2026: impostazioni dal dispositivo
export const OPERAZIONI_CONSENSO = Object.freeze(['consent.request', 'consent.wait', 'session.consent', 'chat.folder']); // Parte 4: chat.folder
/*
 * R5.13 (24/10/2026 notte; contratto Parte 2, «Revision 1: AGREED»): lo scambio di file, col modulo `file-dispositivi.mjs`. Ci sono
 *   solo se ci sono le cartelle col consenso (`cartelle`) E il modulo dei file: senza consenso non c'è modo di dire dove un dispositivo
 *   può scrivere, e si resta chiusi (UNKNOWN_OPERATION, come oggi). Le tre scritture vogliono il consenso della cartella REALE della
 *   sessione, ognuna (chunk ed end la ritrovano dal trasferimento, che porta la sua sessione); elenco e lettura sono letture: libere,
 *   come le altre letture di una sessione — ma solo dei file di quella conversazione, mai un percorso.
 */
export const OPERAZIONI_FILE = Object.freeze(['file.upload.begin', 'file.upload.chunk', 'file.upload.end', 'file.upload.abort', 'file.list', 'file.read', 'file.offers']);
/*
 * Contratto «notifiche» (31/10/2026, bozza 2, «Rotte e cursore»): le stesse tre funzioni delle rotte della finestra, chiamate dal
 *   registro e non via HTTP (le rotte rifiutano un'origine remota). Leggere è libero; «visto» non scrive in nessuna cartella, quindi
 *   niente consenso. Nessuna iscrizione nuova: l'avviso viaggia sul flusso globale. Senza registro: UNKNOWN_OPERATION, come un PC
 *   vecchio (il telefono torna a `pending`).
 */
export const OPERAZIONI_OFFERTA = Object.freeze(['session.library.fetch', 'session.research.export']);
/* N4: le due voci senza rotta dicono qui la loro forma, che si giudica prima del consenso come per le altre */
const OPZIONI_DI_ESPORTAZIONE = Object.freeze(['formato', 'tono', 'lingua']);
const FORME_DELLE_OFFERTE = Object.freeze({
  'session.library.fetch': idVoce,
  'session.research.export': (a) => {
    idRicerca(a);
    for (const k of OPZIONI_DI_ESPORTAZIONE) if (a[k] !== undefined && typeof a[k] !== 'string') throw errore('BAD_MESSAGE', 'An export option must be text.');
  },
});
export const OPERAZIONI_NOTIFICHE = Object.freeze(['notifications.list', 'notifications.seen', 'notifications.seen-all']);
/* 03/11/2026 (Mobile): i luoghi di «Consenti sempre». Togliere va nel verso sicuro (TALOS chiede di più, mai di meno): basta un dispositivo
   abbinato, niente consenso di cartella. Nessuna operazione aggiunge. Ogni rimozione dal dispositivo diventa una notifica sul PC. */
export const OPERAZIONI_LUOGHI = Object.freeze(['computer-use.places.list', 'computer-use.places.remove', 'computer-use.places.clear']);
const ID_RICHIESTA = /^[A-Za-z0-9_-]{8,64}$/u;
const conStato = (e, stato) => Object.assign(e, { stato });
/* N3: si risale al primo antenato che esiste, come `percorsoRealeAncheSeManca` di `path-policy.mjs`: una cartella sparita dal disco resta nella storia, e dietro una giunzione va riconosciuta lo stesso */
/*
 * D1 del Mobile (01/11/2026): tre risalite per percorso, e 1000 percorsi inesistenti da 110 livelli fermavano Node 5,6 s prima del consenso. Il percorso vero di una richiesta si chiede al disco una volta sola
 *   per cartella, e fratelli con la stessa madre costano una risalita. Il tetto conta le domande vere al disco, non i livelli scritti: 1000 file normali ne fanno circa 1000, anche cancellati, e un elenco fatto
 *   apposta si ferma qui. ⛔ 20.000, anche i blocchi contano: si arriva al tetto in circa 670 ms con percorsi corti (BLOCCHI-38) e in 1338-1377 ms con percorsi lunghi (sonde del Mobile, 01/11/2026).
 */
const TETTO_DOMANDE_AL_DISCO = 20_000;
function creaPercorsoVero() {
  const noti = new Map();
  let domande = 0;
  const vero = (p) => {
    if (noti.has(p)) return noti.get(p);
    domande += 1;
    if (domande > TETTO_DOMANDE_AL_DISCO) throw conStato(errore('GIT_PATH_INVALID', 'This path is too long.'), 422);
    let risolto;
    try { risolto = realpathSync.native(p); } catch {
      const su = dirname(p);
      risolto = su === p ? p : join(vero(su), basename(p));
    }
    noti.set(p, risolto);
    return risolto;
  };
  return vero;
}
/* N1, «Percorso esatto» del contratto: `bloccataDa` toglie gli spazi dai bordi, e git no. Un percorso assoluto chiuso da `/.` non ha bordi da togliere: il nome che si confronta è quello di git */
const esatto = (assoluto) => `${assoluto}/.`;
/* Su Windows `sopra.` e `sopra ` sono `sopra`: lo fa il sistema, in coda a ogni nome. Una testa di spazi invece fa parte del nome */
const senzaCodaDiWindows = (p) => (process.platform === 'win32' ? p.replace(/(?<=[^/. ])[. ]+(?=\/|$)/gu, '') : p);
/* `rifiuto()` di `session-registry.mjs`: la sessione o la voce non ci sono. Ogni altro codice è un guasto nel leggere */
const CODICI_DI_VOCE_ASSENTE = new Set(['NOT_FOUND', 'LIBRARY_NOT_FOUND', 'RESEARCH_NOT_FOUND']);
/*
 * D-36 (revisione del blocco 14, 31/10/2026; Mobile: «uno `stato` su ogni rifiuto del ponte»): senza stato il telefono legge «esito incerto» (RA-04) e la carta resta ferma. Gli stati
 *   di ciò che non passa da una rotta: gli stessi della rotta del PC (`STATUS_BY_CODE` di `http-app.mjs`, che qui non si importa: l'app importa già il ponte; COPIE-09 li confronta).
 *   Ciò che non è qui è un guasto, e 500 è la risposta giusta: un guasto può essere arrivato a metà, e quello è davvero incerto. `UNKNOWN_OPERATION` è 404: è un rifiuto, niente è partito.
 */
export const STATI_DEI_RIFIUTI = Object.freeze({ BAD_MESSAGE: 400, QUERY_INVALID: 400, NOT_FOUND: 404, UNKNOWN_OPERATION: 404, RATE_LIMITED: 429, TOO_LARGE: 413,
  CONSENT_NOT_PENDING: 409, FOLDER_CHANGED: 409, FOLDER_BLOCKED: 409, FOLDER_NOT_LISTED: 404, FOLDER_NOT_ALLOWED: 403, FOLDER_INVALID: 400, FILE_EXISTS: 409, PAYLOAD_LIMIT: 413,
  LIBRARY_NOT_FOUND: 404, LIBRARY_TOO_LARGE: 413, LIBRARY_INVALID: 400, RESEARCH_NOT_FOUND: 404, RESEARCH_INVALID: 400, RESEARCH_CONFLICT: 409,
  /* la lettura interna delle rinomine (D2) non passa da una rotta */
  GIT_NOT_A_REPOSITORY: 409, GIT_COMMIT_INVALID: 422, GIT_COMMIT_UNKNOWN: 404, GIT_TIMEOUT: 504, GIT_OUTPUT_TOO_LARGE: 413 });
/* il rifiuto del registro arriva col suo codice, e il suo testo può portare un percorso del PC */
const rifiutoDelRegistro = (esito, codice) => errore(esito?.code ?? codice, senzaPercorsiAssoluti(String(esito?.erroreAvvio ?? 'Not found.')));
const statoDelRifiuto = (e) => (Number.isInteger(e?.stato) ? e.stato : (Object.hasOwn(STATI_DEI_RIFIUTI, e?.code ?? '') ? STATI_DEI_RIFIUTI[e.code] : 500));
const conStatoDelRifiuto = (esegui) => async (...argomenti) => {
  try { return await esegui(...argomenti); } catch (e) {
    if (VOCI_DEL_CONTRATTO.has(argomenti[0])) throw rifiutoPerIlDispositivo(argomenti[0], e, statoDelRifiuto);
    if (e && typeof e === 'object' && !Number.isInteger(e.stato)) e.stato = statoDelRifiuto(e);
    throw e;
  }
};

export function creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle = null, file = null, notifiche = null, luoghi = null, bloccateDi = null,
  /* decisione 310 (06/11/2026): la scelta della persona dal vivo (`computer-use/interruttore.mjs`). Spenta: `computer-use.places.*` fuori
     dall'elenco e UNKNOWN_OPERATION, come senza `luoghi`. Assente: conta solo `luoghi`. */
  luoghiAccesiFn = null,
  /* la lettura interna delle rinomine (`git-service.mjs`), nella cartella che il cancello sta giudicando. Non passa da una rotta: non esce mai verso il dispositivo */
  rinomineDi = ({ sessionId, cartella, confronto, riguarda }) => creaServizioGit({ cartellaDiSessione: () => cartella }).rinomineDelRepository({ sessionId, confronto, riguarda }),
  battitoMs = BATTITO_REMOTO_MS, ogni = setInterval, smetti = clearInterval }) {
  /* Blocco 21 (contratto dell'elenco, 31/10/2026): le righe dell'elenco prendono la cartella dalla stessa `descrivi` del giro di `sessions.list` qui sotto */
  if (cartelle) sessionRegistry?.usaDescrizioneCartelle?.((percorso) => cartelle.descrivi(percorso));
  /* decisione 310: il registro dei luoghi solo se la persona ha acceso il computer use, riletto a ogni elenco e a ogni operazione */
  const luoghiOra = () => (luoghi && (typeof luoghiAccesiFn !== 'function' || luoghiAccesiFn() === true) ? luoghi : null);
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
  const copiaSparita = () => conStato(errore('FILE_GONE', 'This file changed or is no longer in this conversation.'), 410);
  const negaConsenso = async (cartella, reason) => {
    const descritta = cartella ? await cartelle.descrivi(cartella) : null;
    throw conStato(Object.assign(errore('CONSENT_REQUIRED', 'The computer must allow this device to write in this folder.'), { reason, params: descritta ?? {} }), 403);
  };
  /*
   * Punti 8-11 del Mobile: una copia sopravvive alla revoca e a una voce eliminata da strade che il ponte non vede (un'altra conversazione, la finestra, il modello). Si guarda alla fonte a
   *   ogni lettura: la Libreria e le ricerche sono del progetto, e `togliDati` della sessione non basta.
   */
  const copiaAncoraValida = async (dispositivoId, sessionId, copia) => {
    /* M1, «Ordine» del contratto: una cartella bloccata è `FILE_GONE`, non un consenso da chiedere. Non si toglie: sbloccata, la copia torna (COPIE-01) */
    let bloccati;
    try { bloccati = typeof bloccateDi === 'function' ? await bloccateDi(dispositivoId) : []; } catch { throw copiaSparita(); }
    if (copia.cartella && Array.isArray(bloccati) && bloccati.length && bloccataDa(esatto(copia.cartella), { bloccati })) throw copiaSparita();
    if (!copia.cartella || !(await cartelle.consentita(dispositivoId, copia.cartella))) await negaConsenso(copia.cartella, 'consent-required');
    /* N9: si toglie solo ciò che non esiste davvero. Un guasto nel leggere non dice niente della voce: la copia non esce, e torna a guasto finito */
    const nonEsiste = (e) => Boolean(e) && 'erroreAvvio' in e && CODICI_DI_VOCE_ASSENTE.has(e.code);
    const nonSiSa = (e) => !e || ('erroreAvvio' in e && !nonEsiste(e)) || Boolean(e.errore);
    const nonControllabile = () => conStato(errore('OPERATION_FAILED', 'The computer could not check this file now.'), 500);
    const [tipo, id] = String(copia.chiave).split('/');
    const esito = tipo === 'libreria' ? await sessionRegistry.elencaVersioniLibreria?.(sessionId, id) : await sessionRegistry.leggiRicerca?.(sessionId, id);
    if (nonSiSa(esito)) throw nonControllabile();
    let sparita = nonEsiste(esito) || (tipo !== 'libreria' && !esito.ricerca);
    /* M3: l'esportazione porta il rapporto, che vive in una voce sua: eliminata quella, la copia non dura più della voce */
    const rapporto = !sparita && tipo !== 'libreria' ? esito.ricerca.reportLibraryId : null;
    const voceDelRapporto = typeof rapporto === 'string' && rapporto ? await sessionRegistry.elencaVersioniLibreria?.(sessionId, rapporto) : null;
    if (voceDelRapporto && nonSiSa(voceDelRapporto)) throw nonControllabile();
    sparita ||= nonEsiste(voceDelRapporto);
    if (sparita) {
      file.togliDati(sessionId, `${tipo}/${id}`);
      throw copiaSparita();
    }
  };
  const cartellaBloccata = () => conStato(Object.assign(errore('FOLDER_BLOCKED', 'This folder is blocked for this device.'), { reason: 'folder-blocked' }), 409);
  /*
   * Il cancello delle voci del contratto (§7): blocchi, consenso e radice del repository, prima che la voce parta. Torna ciò che serve al filtro della risposta.
   * ⛔ «Ordine» del contratto: il blocco viene prima del consenso. Una cartella bloccata non è mai consentita, e con l'ordine opposto il dispositivo chiederebbe un consenso che non può avere.
   * ⛔ Per Git vale la cartella dove git gira davvero (`cartellaDi`): in Accesso pieno può essere più larga di quella della conversazione (sospetto del Mobile).
   * ⛔ Punto 13: una cartella che non si risolve chiude, se la sessione esiste; una sessione che non c'è la dice la rotta.
   */
  const cancello = async (op, args, dispositivoId, come) => {
    if (VOCI_CHE_FERMANO.has(op)) return {};
    const { sessionId } = args;
    const git = Object.hasOwn(VOCI_GIT, op);
    const scrive = SCRITTURE_DI_SESSIONE.has(op);
    const vera = git ? sessionRegistry?.cartellaDi?.(sessionId) : null;
    const cartella = typeof vera === 'string' && vera ? vera : await cartellaDellaSessione(sessionId);
    const consentita = async (c) => Boolean(c) && (await cartelle.consentita(dispositivoId, c)) === true;
    const chiediConsenso = async () => { if (scrive && sessionRegistry?.esiste?.(sessionId) !== false && !(await consentita(cartella))) await negaConsenso(cartella, 'consent-required'); };
    let bloccati;
    try { bloccati = typeof bloccateDi === 'function' ? await bloccateDi(dispositivoId) : []; } catch { throw cartellaBloccata(); }
    const conBlocchi = Array.isArray(bloccati) && bloccati.length > 0;
    const sotto = (p, lista = bloccati) => conBlocchi && (!cartella || Boolean(bloccataDa(esatto(resolve(cartella, typeof p === 'string' && p !== '' ? p : '.')), { bloccati: lista })));
    /* il percorso vero accanto a quello scritto: un nome corto o una giunzione portano alla stessa cartella, e il confronto dei nomi non la riconosce */
    const vero = creaPercorsoVero();
    /* N2 e D1 del Mobile: il confronto coi nomi non va su disco, e il disco si interroga una volta sola per cartella */
    let indiceDeiBlocchi = null;
    const blocchi = () => { indiceDeiBlocchi ??= indiceDeiNomi([...bloccati, ...bloccati.map((b) => vero(b))]); return indiceDeiBlocchi; };
    const contieneUnBlocco = (assoluto) => [assoluto, vero(assoluto)].some((p) => blocchi().contiene(p));
    const nellArea = (area) => conBlocchi && (Boolean(bloccataDa(esatto(area), { bloccati })) || contieneUnBlocco(area));
    /* revisione 3: `git` su una cartella agisce su tutto ciò che contiene. Le forme sono quelle di `normalizzaPercorso`: fatto di soli spazi lo rifiuta la rotta, e la barra rovescia vale barra */
    const nomeDiGit = (p) => senzaCodaDiWindows((p.trim() === '' ? '.' : p).replaceAll('\\', '/'));
    const tocca = (p) => { const assoluto = resolve(cartella, nomeDiGit(p)); return [assoluto, vero(assoluto)].some((n) => blocchi().sotto(n) || blocchi().contiene(n)); };
    const legato = (p, indice) => { const assoluto = resolve(cartella, nomeDiGit(p)); return [assoluto, vero(assoluto)].some((n) => indice.contiene(n)); };
    const cartellaFerma = conBlocchi && Boolean(cartella) && Boolean(bloccataDa(esatto(cartella), { bloccati }));
    if (op === 'session.research.get') {
      if (cartellaFerma) return { negato: 'folder-blocked' };
      if (await consentita(cartella)) return { contenuto: true };
      const descritta = cartella ? await cartelle.descrivi(cartella) : null;
      return { negato: 'consent-required', negatoParams: tieni(descritta, { cartellaId: D, nome: D, tipo: D }) };
    }
    if (!git) {
      if (cartellaFerma && OPERAZIONI_OFFERTA.includes(op)) throw copiaSparita(); // D-33: per il dispositivo la copia non c'è
      if (cartellaFerma || (VOCI_DI_ANNULLA.includes(op) && cartella && nellArea(cartella))) throw cartellaBloccata();
      await chiediConsenso();
      return {};
    }
    const leggi = async (nome) => (await chiama({ metodo: 'GET', percorso: `/api/v1/sessions/${idSessione(args)}/git/${nome}`, ...come }).catch((e) => {
      if (e?.code === 'NOT_FOUND' && sessionRegistry?.esiste?.(sessionId)) throw conStato(errore('GIT_STORE_UNAVAILABLE', 'Git is not available on this computer.'), 503);
      throw e;
    })).dati;
    const leggiRadice = async () => {
      if (!VOCI_SULLA_RADICE.has(op)) return null;
      const letta = (await leggi('branch'))?.radiceRepo;
      return typeof letta === 'string' && letta ? letta : null;
    };
    /*
     * N11, D1, D2, D4, §7: chi esce da un blocco con una rinomina porta con sé il contenuto, e chi ci entra lo lascia nel confronto. Una riga con uno dei due nomi sotto un blocco vieta tutti e due, in
     *   tutti e due i versi. La lettura è una sola per richiesta, dalla radice e senza tetto: un nome che `.status` e `.changes` non mostrano resta legato all'altro. I confronti sono fra percorsi veri,
     *   sui nomi: niente disco per ogni riga.
     */
    let guastoInLettura = null;
    const nomiDelleRinomine = async () => {
      /* senza `a` il confronto non esiste: lo rifiuta la rotta, col codice di sempre, e dalla rotta non esce niente */
      if (op === 'session.git.changes-diff' && (args.a === undefined || args.a === null)) return [];
      try {
        /* un blocco fuori dal repository non è toccato da nessuna rinomina: 4 processi git in meno a ogni voce coi percorsi. Uno che contiene il repository ha già fermato tutto prima di qui */
        const riguarda = (radiceRepo) => { const vera = vero(radiceRepo); return bloccati.flatMap((b) => [b, vero(b)]).some((b) => isPathInside(vera, b)); };
        const letta = await rinomineDi({ sessionId, cartella, confronto: op === 'session.git.changes-diff' ? { da: args.da, a: args.a } : null, riguarda });
        if (letta?.code === 'NOT_FOUND' && sessionRegistry?.esiste?.(sessionId)) throw conStato(errore('GIT_STORE_UNAVAILABLE', 'Git is not available on this computer.'), 503);
        if (!Array.isArray(letta?.coppie)) throw errore(letta?.code ?? 'GIT_COMMAND_FAILED', String(letta?.erroreAvvio ?? 'Git could not read the renames.'));
        const radiceVera = vero(letta.radiceRepo);
        return letta.coppie.map((c) => [resolve(radiceVera, c.prima), resolve(radiceVera, c.percorso)])
          .filter((nomi) => nomi.some((n) => blocchi().sotto(n))).flat();
      } catch (e) { guastoInLettura = e; return []; }
    };
    /* con dei blocchi la radice e le rinomine servono prima del consenso; un guasto nel leggerle si dice dopo, o nasconderebbe la carta del consenso */
    let radice = null;
    if (conBlocchi) { try { radice = await leggiRadice(); } catch (e) { guastoInLettura = e; } }
    if (cartellaFerma && scrive) throw cartellaBloccata();
    if (VOCI_COI_PERCORSI.has(op)) {
      const percorsi = percorsiDellaVoce(args, op);
      if (conBlocchi && cartella && percorsi.some((p) => tocca(p))) throw cartellaBloccata();
      if (conBlocchi && cartella && percorsi.length) {
        const legati = await nomiDelleRinomine();
        if (legati.length) { const indice = indiceDeiNomi(legati); if (percorsi.some((p) => legato(p, indice))) throw cartellaBloccata(); }
      }
    } else {
      if (scrive && (radice ?? cartella) && nellArea(radice ?? cartella)) throw cartellaBloccata();
      /* D2: da una sottocartella il blocco sta fuori dall'area, e la rinomina porta il contenuto dentro. Una rinomina tutta fuori dalla cartella non entra in queste due voci */
      if (VOCI_DEL_PREPARATO.has(op) && conBlocchi && cartella) {
        const qui = vero(cartella);
        if ((await nomiDelleRinomine()).some((n) => isPathInside(qui, n))) throw cartellaBloccata();
      }
    }
    await chiediConsenso();
    if (guastoInLettura) throw guastoInLettura;
    if (!conBlocchi) radice = await leggiRadice();
    if (radice && !(await consentita(radice))) await negaConsenso(radice, 'repo-consent-required');
    return { bloccato: conBlocchi ? sotto : undefined };
  };
  return {
    elenco() { return [...Object.keys(OPERAZIONI_HTTP).filter((op) => cartelle || !VOCI_COL_CONSENSO.has(op)), ...OPERAZIONI_EVENTI, ...(cartelle ? OPERAZIONI_CONSENSO : []), ...(cartelle && file ? [...OPERAZIONI_FILE, ...OPERAZIONI_OFFERTA] : []), ...(notifiche ? OPERAZIONI_NOTIFICHE : []), ...(luoghiOra() ? OPERAZIONI_LUOGHI : [])]; },

    esegui: conStatoDelRifiuto(async (op, args, contesto) => {
      const origine = `telefono:${contesto?.dispositivo?.id ?? '?'}`;
      let vista = {}; // ciò che il cancello ha deciso, per il filtro della risposta
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
        if (VOCI_DEL_CONTRATTO.has(op)) { idSessione(args); OPERAZIONI_HTTP[op]?.percorso(args); OPERAZIONI_HTTP[op]?.forma?.(args); FORME_DELLE_OFFERTE[op]?.(args); if (VOCI_COI_PERCORSI.has(op)) misuraDeiPercorsi(args, op); vista = await cancello(op, args, dispositivoId, { origine, origineRemota }); }
        else if (SCRITTURE_DI_SESSIONE.has(op)) { idSessione(args); OPERAZIONI_HTTP[op]?.percorso(args); await richiedeConsenso(dispositivoId, args.sessionId); }
        /* `/settings` dal dispositivo: solo una voce della conversazione è una scrittura nella sessione (le voci dell'app no) */
        else if (op === 'app-settings.apply') {
          /* Giro 2, voce 6 (condizione del Mobile, 02/11 notte): una voce a carta sempre (anche se è della conversazione) vuole il PC PRIMA del
             consenso della cartella — il controllo più stretto passa per primo, e il telefono mostra «Conferma sul computer», mai la carta della cartella */
          const perIlPc = voceCheVuoleIlPc(args?.corpo);
          if (perIlPc) throw conStato(Object.assign(errore('PC_CONFIRMATION_REQUIRED', fraseDelPcPerIlDispositivo(perIlPc.chiave)), { reason: 'pc-confirmation-required', params: perIlPc }), 403);
          if (applicaToccaLaConversazione(args?.corpo)) { idSessione(args.corpo); await richiedeConsenso(dispositivoId, args.corpo.sessionId); }
        }
      }
      if (OPERAZIONI_LUOGHI.includes(op)) {
        if (!luoghiOra() || !dispositivoId) throw errore('UNKNOWN_OPERATION', 'This operation is not available from the device.');
        const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
        const lista = op === 'computer-use.places.list';
        const esito = await creaRotteLuoghi({ registro: luoghi })({ method: lista ? 'GET' : 'POST',
          percorso: lista ? PREFISSO_ROTTE_LUOGHI : `${PREFISSO_ROTTE_LUOGHI}/${op === 'computer-use.places.remove' ? 'remove' : 'clear'}`, corpo: lista ? null : a });
        if (esito?.dati === undefined) throw conStato(errore(esito?.errore?.code ?? 'BAD_MESSAGE', esito?.errore?.message ?? 'The remembered places request is not valid.'), esito?.stato ?? 400);
        // il PC vede chi ha tolto che cosa (Mobile): un dispositivo non cambia niente in silenzio. Una notifica persa non annulla la rimozione
        if (!lista && esito.dati.tolti > 0 && notifiche) {
          const istante = new Date().toISOString();
          try {
            await notifiche.scrivi({ id: `computer-use:luoghi:${dispositivoId}:${istante}`, fatto: 'luoghi-ricordati', azione: op === 'computer-use.places.remove' ? 'tolto' : 'svuotati',
              cosa: { tipo: 'dispositivo', id: dispositivoId, nome: contesto?.dispositivo?.nome ?? '' }, dato: { genere: 'testo', valore: op === 'computer-use.places.remove' ? String(a.nome).trim() : String(esito.dati.tolti) },
              istante, stato: { visto: false, risolto: true } });
          } catch { /* il registro delle notifiche non ha scritto: la rimozione resta valida */ }
        }
        return esito.dati;
      }
      if (OPERAZIONI_NOTIFICHE.includes(op)) {
        if (!notifiche) throw errore('UNKNOWN_OPERATION', 'This operation is not available from the device.');
        const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
        const lista = op === 'notifications.list';
        const dopo = a.dopo === undefined || a.dopo === null ? '' : String(a.dopo);
        const esito = await creaRotteNotifiche({ registro: notifiche })({
          method: lista ? 'GET' : 'POST',
          percorso: lista ? '/api/v1/notifications' : `/api/v1/notifications/${op === 'notifications.seen' ? 'seen' : 'seen-all'}`,
          query: lista ? new URLSearchParams(dopo ? { dopo } : {}) : null,
          corpo: lista ? null : a,
        });
        if (esito?.dati !== undefined) return esito.dati;
        throw conStato(errore(esito?.errore?.code ?? 'BAD_MESSAGE', esito?.errore?.message ?? 'The notifications request is not valid.'), esito?.stato ?? 400);
      }
      if (OPERAZIONI_FILE.includes(op)) {
        if (!(cartelle && file && dispositivoId)) throw errore('UNKNOWN_OPERATION', 'This operation is not available from the device.');
        const a = args ?? {};
        if (op === 'file.upload.begin') {
          /* D-5/D-6 (25/10/2026): un'immagine per il modello non tocca cartelle: niente sessione, niente consenso (come la finestra) */
          if (a.immagine === true) {
            return file.inizia({ dispositivoId, nome: a.nome, dimensione: a.dimensione, sha256: a.sha256, riprendi: a.riprendi, immagine: true, sessionId: a.sessionId });
          }
          /* Decisione 47: un file per i dati di TALOS non tocca cartelle: niente consenso qui, il legame con la chat lo controlla `session.send` */
          if (a.datiTalos === true) {
            return file.inizia({ dispositivoId, nome: a.nome, dimensione: a.dimensione, sha256: a.sha256, riprendi: a.riprendi, datiTalos: true, sessionId: a.sessionId });
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
        const copia = await file.copiaDelFile?.({ dispositivoId, sessionId: a.sessionId, fileId: a.fileId });
        if (copia) await copiaAncoraValida(dispositivoId, a.sessionId, copia);
        return file.leggi({ dispositivoId, sessionId: a.sessionId, fileId: a.fileId, versione: a.versione, da: a.da, quanti: a.quanti });
      }
      /* i byte che non sono una risposta JSON passano dallo scambio di file: un'offerta per QUESTO dispositivo, e `file.read` */
      if (OPERAZIONI_OFFERTA.includes(op)) {
        if (!file || !cartelle || !dispositivoId) throw Object.assign(errore('UNKNOWN_OPERATION', 'This operation is not available from the device.'), { reason: 'no-folder-consent' });
        idSessione(args);
        if (op === 'session.library.fetch') {
          const voceId = idVoce(args);
          const esito = await sessionRegistry.scaricaVoceLibreria(args.sessionId, voceId);
          if (!esito || 'erroreAvvio' in esito) throw rifiutoDelRegistro(esito, 'LIBRARY_NOT_FOUND');
          return tieni(await file.offriDati({ sessionId: args.sessionId, dispositivoId, chiave: chiaveVoce(args), nome: esito.nome, bytes: esito.bytes }), OFFERTA);
        }
        FORME_DELLE_OFFERTE[op](args);
        const ricercaId = idRicerca(args);
        const letta = await sessionRegistry.leggiRicerca(args.sessionId, ricercaId);
        if (letta && 'erroreAvvio' in letta) throw rifiutoDelRegistro(letta, 'RESEARCH_NOT_FOUND');
        if (!letta?.ricerca) throw conStato(errore('RESEARCH_NOT_FOUND', 'This research does not exist.'), 404);
        const { costruisciEsportazione } = await import('../research/esportazioni.mjs');
        const esportata = await costruisciEsportazione({ ricerca: letta.ricerca, formato: args.formato, tono: args.tono, lingua: args.lingua });
        return tieni(await file.offriDati({ sessionId: args.sessionId, dispositivoId, chiave: `${chiaveRicerca(args)}/${[args.formato, args.tono ?? '', args.lingua ?? ''].join('/')}`, nome: esportata.nomeFile, bytes: esportata.bytes }), OFFERTA);
      }
      const voce = Object.hasOwn(OPERAZIONI_HTTP, op) ? OPERAZIONI_HTTP[op] : null;
      if (voce) {
        const percorso = voce.percorso(args); // prima la forma: un id storto è BAD_MESSAGE ovunque
        if (VOCI_COL_CONSENSO.has(op) && !(cartelle && dispositivoId)) throw Object.assign(errore('UNKNOWN_OPERATION', 'This operation is not available from the device.'), { reason: 'no-folder-consent' });
        voce.controlla?.(args);
        const corpo = voce.corpo ? voce.corpo(args) : undefined;
        const { dati } = await chiama({ metodo: voce.metodoSeNuovo?.(args) ?? voce.metodo, percorso, corpo, origine, origineRemota }).catch(async (e) => {
          /* B7: la rotta guarda la cartella della conversazione, e in Accesso pieno il cancello qui sopra ne ha guardata una più larga. Il suo rifiuto non dice quale consenso chiedere */
          if (e?.code === 'CONSENT_REQUIRED' && !e.params && cartelle) {
            const descritta = await cartelle.descrivi(await cartellaDellaSessione(args?.sessionId));
            throw Object.assign(e, { reason: e.reason ?? 'consent-required', ...(descritta ? { params: descritta } : {}) });
          }
          /* senza servizio Git le letture del PC cadono sul 404 (lo pinna `http-routes-git`): su una sessione che esiste è lo stesso «non disponibile» delle scritture */
          if (e?.code === 'NOT_FOUND' && Object.hasOwn(VOCI_GIT, op) && sessionRegistry?.esiste?.(args.sessionId)) throw conStato(errore('GIT_STORE_UNAVAILABLE', 'Git is not available on this computer.'), 503);
          throw e;
        });
        if (voce.copie) file?.togliDati?.(args.sessionId, voce.copie(args));
        /* punto 4: `invia` ha trovato il PC cambiato dopo la carta, e non ha inviato niente */
        if (op === 'session.git.push' && dati?.cambiato) throw conStato(Object.assign(errore('GIT_PUSH_CHANGED', 'The branch changed on the computer after the confirmation.'), { reason: 'push-changed', params: dati.cambiato }), 409);
        const filtrati = voce.filtra ? voce.filtra(dati, vista) : dati;
        if (voce.metodo !== 'GET' && VOCI_DEL_CONTRATTO.has(op) && pesoSulFilo(filtrati) > TETTO_RISPOSTA_BYTE) {
          return { ok: filtrati?.ok !== false, ridotta: true, ...tieni(filtrati, { motivo: D, turno: D }), ...(typeof filtrati?.messaggio === 'string' ? { messaggio: testoDentroIByte(filtrati.messaggio) } : {}) }; // N12: §4 promette `messaggio`, tagliato se serve
        }
        /* il dispositivo sa PRIMA di scrivere se una sessione gli è consentita (frame 8 del bozzetto approvato) */
        if (cartelle && dispositivoId && op === 'sessions.list' && Array.isArray(filtrati?.items)) {
          return { ...filtrati, items: await Promise.all(filtrati.items.map(async (riga) => {
            const id = typeof riga?.sessionId === 'string' ? riga.sessionId : (typeof riga?.id === 'string' ? riga.id : null);
            const cartella = id ? await cartellaDellaSessione(id) : null;
            /* R20 (revisione del Blocco 21): id e tipo dal giro in sottofondo, se c'è già passato. `cartella` e `consentita` restano dal vivo: sono il controllo del consenso.
               RIP-2: la nota vale solo per QUESTO percorso vero, o la riga darebbe il consenso di una cartella con l'id di un'altra */
            const nota = cartella ? sessionRegistry?.cartellaDescritta?.(id, cartella) : null;
            const descritta = !cartella ? null : nota !== undefined ? nota : await cartelle.descrivi(cartella);
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
        const mandaSulFilo = contesto.iscrivi(sub, () => disiscrivi?.());
        /* D-44: `codifica` lancia in modo sincrono oltre il tetto. Un evento grande non impedisce di aprire la chat, non lascia ascoltatori attaccati e non arriva a chi emette */
        const manda = (grezzo) => {
          const evento = eventoPerIlTelefono(grezzo); // blocco 26: il registro dello sfondo col nome da mostrare, mai il percorso del PC
          try { return mandaSulFilo(evento); } catch (e) {
            if (e?.code !== 'TOO_LARGE') throw e;
            for (const piccolo of eventiDentroIlTetto(evento)) mandaSulFilo(piccolo)?.catch?.(() => {});
            return undefined;
          }
        };
        let togliEventi;
        try { togliEventi = iscriviConRigiocata({ sessionRegistry, sessionId: id, daSequenza: after, manda: (evento) => { manda(evento)?.catch?.(() => {}); } }); }
        catch (e) { contesto.iscrizioni.delete(sub); throw e; }
        /* R5.13: l'avviso leggero `file.nuovo {sessionId, fileId}` sullo stesso stream (contratto, «Revision 1», Q2) — non salvato, non
           rigiocato: `file.list` resta la fonte di verità. Solo a chi ha le operazioni dei file. */
        const togliFile = cartelle && file && dispositivoId ? file.ascoltaSessione(id, dispositivoId, (evento) => { manda(evento)?.catch?.(() => {}); }) : null;
        /* il battito (vedi `BATTITO_REMOTO`): finisce con l'iscrizione — disiscrivere, la stessa `sub` richiesta di nuovo, la connessione chiusa */
        const battito = ogni(() => {
          let stato = null;
          try { stato = sessionRegistry.statoPerIlBattito?.(id) ?? null; } catch { stato = null; }
          manda(battitoConStato(stato))?.catch?.(() => {});
        }, battitoMs);
        battito?.unref?.();
        disiscrivi = () => { smetti(battito); togliEventi?.(); togliFile?.(); };
        return { sub, after };
      }
      if (op === 'session.unsubscribe') {
        const sub = args?.sub;
        const chiudi = contesto.iscrizioni.get(sub);
        if (typeof chiudi === 'function') { chiudi(); contesto.iscrizioni.delete(sub); }
        return { sub, chiusa: typeof chiudi === 'function' };
      }
      throw errore('UNKNOWN_OPERATION', 'This operation is not available from the device.');
    }),
  };
}
