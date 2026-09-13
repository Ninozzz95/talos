/**
 * mcp-registry.mjs — FASE E del piano `elegant-spinning-dongarra.md`,
 * seconda fetta (29/8): dove vive la configurazione dei server MCP
 * per-workspace, e il trust che decide se un server dichiarato può
 * davvero connettersi. `hook-registry.mjs` letto per intero come
 * precedente diretto prima di scrivere questo file — stesso design,
 * per lo stesso motivo: un comando esterno arbitrario (qui: un intero
 * server a lunga vita, con i SUOI tool, non solo un controllo rapido)
 * non deve MAI partire senza un consenso esplicito dell'owner, e quel
 * consenso resta legato al CONTENUTO della dichiarazione (hash), non
 * al nome.
 *
 * ⛔⛔ Due cartelle DIVERSE, stesso motivo di hook-registry.mjs:
 * - `.harness-ui-mcp.json` vive DENTRO il workspace (come hooks.json,
 *   AGENTS.md) — "quali server MCP servono questo progetto" è una
 *   proprietà del progetto, non della macchina.
 * - il trust vive FUORI, accanto a server.mjs (stesso pattern di
 *   `.automations/` e del trust degli hook).
 *
 * ⛔⛔⛔ L'`allowlist` per server è OBBLIGATORIA nello schema, non
 * opzionale — a differenza di `filtraToolMcp` in mcp-client.mjs (che
 * accetta qualunque array, anche vuoto, perché non è compito suo
 * imporre una policy). Qui SÌ: un server dichiarato senza allowlist è
 * un file MALFORMATO, rifiutato prima ancora di poter connettersi —
 * "mai un tool MCP remoto esposto senza filtro" (piano madre, §2.2)
 * è applicato al punto più a monte
 * possibile, non lasciato alla disciplina di chi integra dopo.
 *
 * Il PROTOCOLLO (connettersi, elencare, chiamare) resta interamente
 * in mcp-client.mjs — questo file non lo importa e non lo usa: solo
 * configurazione e trust, stesso confine "qui solo X, mai Y" già
 * documentato nella testa di mcp-client.mjs stesso.
 */
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';

export class McpRegistryError extends Error {
  constructor(message, code = 'MCP_CONFIG_INVALID') {
    super(message);
    this.name = 'McpRegistryError';
    this.code = code;
  }
}

const NOME_FILE_MCP = '.harness-ui-mcp.json';

/**
 * Legge `<cartella>/.harness-ui-mcp.json`. Un progetto senza server
 * dichiarati è uno stato valido — mai un errore, torna `{ server: [] }`.
 * Uno schema malformato invece È un errore dichiarato (mai un server
 * fantasma silenziosamente ignorato, stesso principio di caricaHooks).
 */
export async function caricaServerMcp({ cartella }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const percorso = join(cartella, NOME_FILE_MCP);
  let testo;
  try {
    testo = await readFileFn(percorso, 'utf8');
  } catch (errore) {
    if (errore?.code === 'ENOENT') return { server: [] };
    throw new McpRegistryError(`Impossibile leggere ${NOME_FILE_MCP}: ${errore.message}`, 'MCP_CONFIG_READ_FAILED');
  }
  let dati;
  try {
    dati = JSON.parse(testo);
  } catch {
    throw new McpRegistryError(`${NOME_FILE_MCP} non è un JSON valido`, 'MCP_CONFIG_MALFORMED');
  }
  if (!dati || !Array.isArray(dati.server)) {
    throw new McpRegistryError(`${NOME_FILE_MCP} deve avere un campo "server" (array)`, 'MCP_CONFIG_MALFORMED');
  }
  const server = dati.server.map((voce, indice) => {
    if (typeof voce?.id !== 'string' || voce.id.length === 0) {
      throw new McpRegistryError(`server[${indice}] manca di "id" (stringa non vuota)`, 'MCP_CONFIG_MALFORMED');
    }
    if (typeof voce.comando !== 'string' || voce.comando.length === 0) {
      throw new McpRegistryError(`server[${indice}] ("${voce.id}") manca di "comando" (stringa non vuota)`, 'MCP_CONFIG_MALFORMED');
    }
    if (voce.argomenti !== undefined && (!Array.isArray(voce.argomenti) || !voce.argomenti.every((a) => typeof a === 'string'))) {
      throw new McpRegistryError(`server[${indice}] ("${voce.id}") ha "argomenti" non valido — atteso un array di stringhe`, 'MCP_CONFIG_MALFORMED');
    }
    if (!Array.isArray(voce.allowlist) || voce.allowlist.length === 0 || !voce.allowlist.every((n) => typeof n === 'string' && n.length > 0)) {
      throw new McpRegistryError(`server[${indice}] ("${voce.id}") manca di "allowlist" (array non vuoto di nomi tool) — un server MCP non si dichiara senza dire quali tool sono ammessi`, 'MCP_CONFIG_MALFORMED');
    }
    const argomenti = voce.argomenti ?? [];
    const hash = createHash('sha256').update(JSON.stringify({ comando: voce.comando, argomenti, allowlist: voce.allowlist })).digest('hex');
    return { id: voce.id, comando: voce.comando, argomenti, allowlist: voce.allowlist, hash };
  });
  return { server };
}

function percorsoTrust(cartellaTrust, serverId) {
  // ⛔ serverId arriva da un file scritto dall'owner (.harness-ui-mcp.json),
  // ma è comunque un input esterno: mai costruire un percorso da una
  // stringa non validata come nome file — stesso principio già in uso
  // in hook-registry.mjs/workspace-files.mjs.
  if (typeof serverId !== 'string' || serverId.length === 0 || /[\\/]|\.\./.test(serverId)) {
    throw new McpRegistryError('serverId non valido — un nome, non un percorso', 'MCP_SERVER_ID_INVALID');
  }
  return join(cartellaTrust, `${serverId}.json`);
}

/**
 * Un server è fidato SOLO se il registro persistito porta lo STESSO
 * hash della dichiarazione attuale (comando+argomenti+allowlist) — un
 * server il cui contenuto è cambiato torna automaticamente "non
 * fidato", senza bisogno di un'azione esplicita di sfiducia: il trust
 * è legato al CONTENUTO, non al nome. Stesso comportamento di
 * verificaTrust in hook-registry.mjs.
 */
export async function verificaTrustMcp({ cartellaTrust, serverId, hash }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  let testo;
  try {
    testo = await readFileFn(percorsoTrust(cartellaTrust, serverId), 'utf8');
  } catch {
    return false; // mai fidato per default: assente = non fidato, non un errore
  }
  try {
    const dati = JSON.parse(testo);
    return dati?.hash === hash;
  } catch {
    return false;
  }
}

/**
 * Registra il trust — chiamata SOLO da un'azione owner esplicita (la
 * rotta HTTP dedicata, mai automatica dal ciclo dell'agente o
 * dall'avvio di una sessione).
 */
export async function fidaServerMcp({ cartellaTrust, serverId, hash }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  await mkdirFn(cartellaTrust, { recursive: true });
  await writeFileFn(percorsoTrust(cartellaTrust, serverId), JSON.stringify({ hash, fidatoIl: new Date().toISOString() }), 'utf8');
  return { fidato: true };
}

/**
 * Il punto d'ingresso per chi avvia una sessione (session-registry.mjs):
 * carica i server dichiarati, tiene SOLO quelli fidati (stesso
 * fail-closed di hook-registry.mjs — un server non fidato semplicemente
 * non compare, mai un errore che blocca l'avvio della sessione: la
 * sessione parte comunque, solo senza quel server), e torna l'elenco
 * pronto per essere connesso da mcp-client.mjs.
 */
export async function serverMcpFidati({ cartella, cartellaTrust }, deps = {}) {
  const { server } = await caricaServerMcp({ cartella }, deps);
  const fidati = [];
  for (const s of server) {
    const fidato = await verificaTrustMcp({ cartellaTrust, serverId: s.id, hash: s.hash }, deps);
    if (fidato) fidati.push(s);
  }
  return { fidati, nonFidati: server.filter((s) => !fidati.includes(s)) };
}
