/**
 * mcp-session.mjs — FASE E del piano `elegant-spinning-dongarra.md`,
 * terza fetta (29/8): il punto che UNISCE `mcp-registry.mjs` (quali
 * server sono dichiarati e fidati) e `mcp-client.mjs` (il protocollo)
 * in quello che una sessione REALE offre al kernel — `toolMcp` +
 * `chiamaToolMcpFn`, esattamente la forma che `talosLavora` accetta
 * (vedi `AVM-harness/.../talosHarness.mjs`, commit `a902af7`).
 *
 * ⛔ A differenza degli hook (`costruisciHookFn`, letto per intero
 * prima di scrivere questo file): un hook si legge PIGRAMENTE, alla
 * prima tool-call, perché serve solo quando un evento capita. I tool
 * MCP invece devono essere NOTI PRIMA della prima chiamata al modello
 * (finiscono nello schema `tools` della richiesta) — questo file
 * connette tutti i server fidati EAGERMENTE, una volta, prima che
 * `talosLavora` parta.
 *
 * ⛔⛔⛔ Piu' server possono esporre un tool con lo STESSO nome (`read_file`
 * su due server diversi non e' un caso raro — sono processi
 * indipendenti, non sanno l'uno dell'altro). Il nome esposto al
 * modello e' quindi SEMPRE prefissato `mcp__<serverId>__<toolName>`
 * (stessa convenzione dell'ecosistema MCP, non inventata qui) — un
 * dispatcher interno lo demux nel client/nome originali giusti,
 * mai un'ambiguita' silenziosa fra due server.
 *
 * Un server che non parte (comando sbagliato, dipendenza mancante)
 * non impedisce MAI alla sessione di avviarsi — stesso principio
 * "mai un blocco silenzioso, degrada" gia' in uso per gli hook: viene
 * saltato, e il suo fallimento e' registrato per chi chiama (mai
 * inghiottito senza traccia).
 */
import {
  caricaServerMcp as caricaServerMcpReale,
  serverMcpFidati as serverMcpFidatiReale,
} from './mcp-registry.mjs';
import { schemaIngressoAttrezzo } from './tool-schema-normalize.mjs';
import {
  chiamaToolMcp as chiamaToolMcpReale,
  connettiServerMcp as connettiServerMcpReale,
  elencaToolMcp as elencaToolMcpReale,
  filtraToolMcp as filtraToolMcpReale,
} from './mcp-client.mjs';

const SEPARATORE = '__';
const PREFISSO = `mcp${SEPARATORE}`;

/** Pura: costruisce il nome esposto al modello. Un test la esercita senza connettere nulla. */
export function nomeEspostoMcp(serverId, nomeTool) {
  return `${PREFISSO}${serverId}${SEPARATORE}${nomeTool}`;
}

/** Tetto della partenza in parallelo: oltre, si aprirebbero troppi processi figli in un colpo all'avvio di una sessione. */
export const CONCORRENZA_AVVIO_MCP_MASSIMA = 8;

/*
 * ⭐ 14/09 (F07 della review) — la scoperta dei tool era SERIALE: N server fidati costavano la SOMMA dei loro avvii,
 *   e ogni avvio è un processo figlio che fa handshake, cioè attesa, non calcolo. Misurato su quattro server d'eco:
 *   mediana **121 ms** in fila contro **46 ms** a quattro per volta.
 * ⛔ Resta SPENTA di serie (`1` = il comportamento di prima, byte per byte): un server MCP di terzi può avere un
 *   avvio pesante, e far partire più processi insieme sulla macchina di qualcun altro non è una scelta che prendo io.
 *   Chi la vuole la accende con `TALOS_MCP_STARTUP_CONCURRENCY`.
 * ⛔ Qualunque valore storto — vuoto, «due», 0, -3, 2.5 — torna **1**, mai un errore: una variabile d'ambiente scritta
 *   male non deve impedire a una sessione di partire.
 */
export function concorrenzaAvvioMcp(env = process.env) {
  const grezzo = env?.TALOS_MCP_STARTUP_CONCURRENCY;
  if (typeof grezzo !== 'string' && typeof grezzo !== 'number') return 1;
  const numero = Number(String(grezzo).trim());
  if (!Number.isInteger(numero) || numero < 1) return 1;
  return Math.min(numero, CONCORRENZA_AVVIO_MCP_MASSIMA);
}

/**
 * Connette OGNI server fidato del workspace, scopre e filtra i suoi
 * tool con la sua allowlist (mai "tutto ciò che offre" — la stessa
 * garanzia che `filtraToolMcp` già dà, applicata qui a ogni server
 * dichiarato), e torna `{toolMcp, chiamaToolMcpFn, falliti, chiudiTutti}`
 * pronto per `talosLavora`.
 *
 * `falliti`: `{serverId, errore}[]` — i server che NON sono partiti,
 * mai inghiottiti in silenzio (chi chiama decide se avvisare l'owner).
 * `chiudiTutti()`: chiude OGNI connessione aperta — va chiamato quando
 * la sessione finisce, altrimenti il processo figlio del server resta
 * vivo (stesso rischio già noto per ogni sottoprocesso spawnato).
 */
export async function preparaToolMcpPerSessione({ cartella, cartellaTrust, onElicitazione }, deps = {}) {
  const serverMcpFidatiFn = deps.serverMcpFidatiFn ?? serverMcpFidatiReale;
  const connettiServerMcpFn = deps.connettiServerMcpFn ?? connettiServerMcpReale;
  const elencaToolMcpFn = deps.elencaToolMcpFn ?? elencaToolMcpReale;
  const filtraToolMcpFn = deps.filtraToolMcpFn ?? filtraToolMcpReale;
  const chiamaToolMcpFnReale = deps.chiamaToolMcpFn ?? chiamaToolMcpReale;

  let fidati = [];
  try {
    ({ fidati } = await serverMcpFidatiFn({ cartella, cartellaTrust }));
  } catch {
    // ⭐ stesso principio degli hook: un registro che non si legge non blocca la sessione, degrada a "nessun server".
    return { toolMcp: [], chiamaToolMcpFn: null, falliti: [], esiti: [], chiudiTutti: async () => {} };
  }

  const toolMcp = [];
  const instradamento = new Map(); // nomeEsposto -> { client, nomeOriginale }
  const connessioni = []; // { client, chiudi } — per chiudiTutti
  const falliti = [];
  /*
   * Owner 17/10/2026 («Avviso in chat + stato in Estensioni»): l'esito di OGNI server fidato, in ordine, con l'impronta della sua
   * dichiarazione (`hash`) — il registro lo scrive negli eventi della sessione, la chat dice i server che non partono, la scheda
   * Estensioni mostra l'ultimo esito accanto al server (e lo ignora se la dichiarazione è cambiata dopo).
   */
  const esitiDeiServer = [];
  /* Revisione D (bugfixer, 17/10/2026): il motivo lo scrive un server di TERZI (il dettaglio del suo errore) e l'evento si riscrive nel
     giornale a ogni giro: misurato, 50.000 caratteri diventavano una nota e una riga da 50.000. Si tiene corto, coi valori. */
  /* per CARATTERI, non per unità UTF-16: un taglio a metà di un'emoji lasciava una mezza coppia, «�» a schermo (riverifica D) */
  const corto = (testo, massimo) => { const t = String(testo ?? ''); const c = Array.from(t); return c.length > massimo ? `${c.slice(0, massimo - 1).join('')}…` : t; };
  const valoriCorti = (params) => Object.fromEntries(Object.entries(params ?? {}).map(([k, v]) => [k, typeof v === 'string' ? corto(v, 300) : v]));

  /** L'avvio di UN server: non lancia mai — un fallimento è un esito come un altro, da comporre in ordine più sotto. */
  async function avviaUnServer(server) {
    let client;
    let chiudi;
    try {
      /* ⛔ 02/10/2026 — elicitation: la richiesta porta il server che chiede (la persona deve sapere CHI chiede, spec MCP). */
      ({ client, chiudi } = await connettiServerMcpFn({ comando: server.comando, argomenti: server.argomenti, nome: `talos-harness-${server.id}` },
        typeof onElicitazione === 'function' ? { onElicitazione: (parametri) => onElicitazione({ server: server.id, parametri }) } : {}));
    } catch (errore) {
      // un server che non parte non ferma gli altri, ne' la sessione
      /* la chiave del dizionario e i valori, se l'errore li porta (`server.program.notOnPath`): chi mostra i falliti lo dice nelle due lingue */
      return { server, errore: errore instanceof Error ? errore.message : String(errore),
        ...(typeof errore?.chiave === 'string' ? { erroreChiave: errore.chiave, erroreParams: errore.params ?? {} } : {}) };
    }
    let tuttiITool;
    try {
      tuttiITool = await elencaToolMcpFn({ client });
    } catch (errore) {
      // la connessione resta aperta (chiusa comunque da chiudiTutti), ma zero tool da questo server
      const dettaglio = errore instanceof Error ? errore.message : String(errore);
      return { server, client, chiudi, errore: `listing the tools failed: ${dettaglio}`, erroreChiave: 'server.mcp.toolListFailed', erroreParams: { detail: dettaglio } };
    }
    return { server, client, chiudi, tool: filtraToolMcpFn(tuttiITool, server.allowlist) };
  }

  /*
   * ⛔ L'ORDINE del risultato non dipende da chi finisce prima: gli esiti si depositano nella casella del loro server e
   *   si compongono dopo, in fila. Senza, `toolMcp` cambierebbe ordine a ogni avvio a seconda di quale processo figlio
   *   è stato più svelto — e con due server che espongono lo stesso attrezzo cambierebbe anche quale vince a schermo.
   */
  const concorrenza = Math.max(1, Math.min(deps.concorrenza ?? concorrenzaAvvioMcp(deps.env), CONCORRENZA_AVVIO_MCP_MASSIMA));
  const esiti = new Array(fidati.length).fill(null);
  let prossimo = 0;
  async function unLavoratore() {
    while (prossimo < fidati.length) {
      const indice = prossimo;
      prossimo += 1;
      esiti[indice] = await avviaUnServer(fidati[indice]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concorrenza, fidati.length) }, () => unLavoratore()));

  for (const esito of esiti) {
    if (!esito) continue;
    if (esito.chiudi) connessioni.push({ client: esito.client, chiudi: esito.chiudi });
    esitiDeiServer.push(esito.errore
      ? { serverId: esito.server.id, hash: esito.server.hash ?? null, esito: 'non-partito', motivo: corto(esito.errore, 500),
        ...(esito.erroreChiave ? { motivoChiave: esito.erroreChiave, motivoParams: valoriCorti(esito.erroreParams) } : {}) }
      : { serverId: esito.server.id, hash: esito.server.hash ?? null, esito: 'collegato' });
    if (esito.errore) {
      falliti.push({ serverId: esito.server.id, errore: esito.errore,
        ...(esito.erroreChiave ? { erroreChiave: esito.erroreChiave, erroreParams: esito.erroreParams } : {}) });
      continue;
    }
    for (const t of esito.tool) {
      const nomeEsposto = nomeEspostoMcp(esito.server.id, t.name);
      /*
       * ⛔ Stessa cura degli attrezzi Forge, e qui serve ancora di più: questo
       * schema arriva da un server MCP di TERZI, che non abbiamo scritto noi e
       * non possiamo correggere. Passarlo intatto a un motore che ne costruisce
       * una grammatica fa fallire l'intera richiesta — non solo quell'attrezzo.
       */
      toolMcp.push({ name: nomeEsposto, description: t.description, inputSchema: schemaIngressoAttrezzo(t.inputSchema) });
      instradamento.set(nomeEsposto, { client: esito.client, nomeOriginale: t.name });
    }
  }

  const chiamaToolMcpFn = toolMcp.length > 0
    ? async (nomeEsposto, argomenti) => {
      const voce = instradamento.get(nomeEsposto);
      if (!voce) throw new Error(`MCP tool "${nomeEsposto}" is not among those connected in this session`);
      return chiamaToolMcpFnReale({ client: voce.client }, voce.nomeOriginale, argomenti);
    }
    : null;

  const chiudiTutti = async () => {
    for (const { chiudi } of connessioni) {
      try { await chiudi(); } catch { /* un server che non chiude pulito non deve bloccare la chiusura degli altri */ }
    }
  };

  return { toolMcp, chiamaToolMcpFn, falliti, esiti: esitiDeiServer, chiudiTutti };
}

/**
 * R5.8 (contratto del controllo remoto §6, decisione owner del 17/10: «test e riconnessione di un MCP», dal PC e dal telefono) — UN
 * server, adesso: lo stesso avvio di `preparaToolMcpPerSessione` ristretto a lui (stessi motivi d'errore, stessa impronta), poi lo
 * si chiude. Le connessioni vivono un giro alla volta: «riconnetti» è questo — la prova dice se il server ora parte, e il prossimo
 * giro lo usa. Un server NON fidato non si prova: avviarlo eseguirebbe codice di terzi, e la fiducia si dà solo dal PC.
 * Torna `{ trovato, fidato, esito? , attrezzi?, ms? }`; non lancia.
 */
export async function provaUnServerMcp({ cartella, cartellaTrust, serverId }, deps = {}) {
  const serverMcpFidatiFn = deps.serverMcpFidatiFn ?? serverMcpFidatiReale;
  const caricaServerMcpFn = deps.caricaServerMcpFn ?? caricaServerMcpReale;
  const clock = deps.clock ?? (() => Date.now());
  let dichiarati = [];
  try { ({ server: dichiarati } = await caricaServerMcpFn({ cartella })); } catch { return { trovato: false, fidato: false }; }
  if (!Array.isArray(dichiarati) || !dichiarati.some((s) => s.id === serverId)) return { trovato: false, fidato: false };
  let fidati = [];
  try { ({ fidati } = await serverMcpFidatiFn({ cartella, cartellaTrust })); } catch { fidati = []; }
  const lui = fidati.find((s) => s.id === serverId);
  if (!lui) return { trovato: true, fidato: false };
  const inizio = clock();
  const preparato = await preparaToolMcpPerSessione({ cartella, cartellaTrust }, { ...deps, serverMcpFidatiFn: async () => ({ fidati: [lui] }) });
  try { await preparato.chiudiTutti(); } catch { /* chiudere male non cambia l'esito della prova */ }
  return { trovato: true, fidato: true, esito: preparato.esiti[0] ?? null, attrezzi: preparato.toolMcp.length, ms: Math.max(0, clock() - inizio) };
}
