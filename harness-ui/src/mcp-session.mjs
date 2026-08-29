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

  for (const server of fidati) {
    let client;
    let chiudi;
    try {
      ({ client, chiudi } = await connettiServerMcpFn({ comando: server.comando, argomenti: server.argomenti, nome: `talos-harness-${server.id}` }));
    } catch (errore) {
      falliti.push({ serverId: server.id, errore: errore instanceof Error ? errore.message : String(errore) });
      continue; // un server che non parte non ferma gli altri, ne' la sessione
    }
    connessioni.push({ client, chiudi });
    let tuttiITool;
    try {
      tuttiITool = await elencaToolMcpFn({ client });
    } catch (errore) {
      falliti.push({ serverId: server.id, errore: `elenco tool fallito: ${errore instanceof Error ? errore.message : String(errore)}` });
      continue; // la connessione resta aperta (chiusa comunque da chiudiTutti), ma zero tool da questo server
    }
    const filtrati = filtraToolMcpFn(tuttiITool, server.allowlist);
    for (const t of filtrati) {
      const nomeEsposto = nomeEspostoMcp(server.id, t.name);
      toolMcp.push({ name: nomeEsposto, description: t.description, inputSchema: t.inputSchema });
      instradamento.set(nomeEsposto, { client, nomeOriginale: t.name });
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
