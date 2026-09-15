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
export async function preparaToolMcpPerSessione({ cartella, cartellaTrust }, deps = {}) {
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
    return { toolMcp: [], chiamaToolMcpFn: null, falliti: [], chiudiTutti: async () => {} };
  }

  const toolMcp = [];
  const instradamento = new Map(); // nomeEsposto -> { client, nomeOriginale }
  const connessioni = []; // { client, chiudi } — per chiudiTutti
  const falliti = [];

  /** L'avvio di UN server: non lancia mai — un fallimento è un esito come un altro, da comporre in ordine più sotto. */
  async function avviaUnServer(server) {
    let client;
    let chiudi;
    try {
      ({ client, chiudi } = await connettiServerMcpFn({ comando: server.comando, argomenti: server.argomenti, nome: `talos-harness-${server.id}` }));
    } catch (errore) {
      // un server che non parte non ferma gli altri, ne' la sessione
      return { server, errore: errore instanceof Error ? errore.message : String(errore) };
    }
    let tuttiITool;
    try {
      tuttiITool = await elencaToolMcpFn({ client });
    } catch (errore) {
      // la connessione resta aperta (chiusa comunque da chiudiTutti), ma zero tool da questo server
      return { server, client, chiudi, errore: `elenco tool fallito: ${errore instanceof Error ? errore.message : String(errore)}` };
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
    if (esito.errore) {
      falliti.push({ serverId: esito.server.id, errore: esito.errore });
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
      if (!voce) throw new Error(`tool MCP "${nomeEsposto}" non è fra quelli connessi in questa sessione`);
      return chiamaToolMcpFnReale({ client: voce.client }, voce.nomeOriginale, argomenti);
    }
    : null;

  const chiudiTutti = async () => {
    for (const { chiudi } of connessioni) {
      try { await chiudi(); } catch { /* un server che non chiude pulito non deve bloccare la chiusura degli altri */ }
    }
  };

  return { toolMcp, chiamaToolMcpFn, falliti, chiudiTutti };
}
