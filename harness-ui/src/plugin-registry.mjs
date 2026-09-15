/**
 * plugin-registry.mjs — FASE G del piano `elegant-spinning-dongarra.md`
 * (29/8): un plugin dichiara hook e/o tool locali in UN manifesto,
 * dentro il workspace — `.harness-ui-plugins/<nome>/plugin.json`,
 * stessa convenzione di hook/MCP/skill.
 *
 * ⛔⛔⛔ Ricerca fatta PRIMA di scrivere (vedi il piano madre, FASE G):
 * un approccio marketplace-centrico (verificato empiricamente altrove)
 * è una scelta deliberatamente NON seguita qui, per coerenza con
 * hook/MCP/skill (tutte per-workspace, mai un registro esterno). Un
 * altro approccio noto fa una scansione statica pre-attivazione, ma la
 * sua stessa documentazione di sicurezza ammette che uno scanner di
 * pattern non costituisce un vero confine — è un avviso, non un
 * blocco. Questo file segue la stessa distinzione: `scansionaPatternSospetti`
 * produce AVVISI, mai un blocco automatico — il confine vero resta il
 * trust hash-vincolato, identico a hook-registry.mjs/mcp-registry.mjs.
 *
 * ⛔⛔ Hash su TUTTO il manifesto, non per componente (a differenza dei
 * server MCP, dove ogni server ha il proprio trust): un plugin è
 * un'unità, cambiare una riga di `plugin.json` invalida l'intero
 * plugin, mai un aggiornamento parziale sotto un trust vecchio.
 */
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';

import { EVENTI_VALIDI } from './hook-registry.mjs';

export class PluginRegistryError extends Error {
  constructor(message, code = 'PLUGIN_INVALID') {
    super(message);
    this.name = 'PluginRegistryError';
    this.code = code;
  }
}

const NOME_CARTELLA_PLUGIN = '.harness-ui-plugins';
const NOME_FILE_MANIFESTO = 'plugin.json';

/**
 * ⭐ Pura, nessun blocco — un array di stringhe-avviso, vuoto se nulla
 * sembra sospetto. Pattern letterali OVVI, non un tentativo di
 * copertura esaustiva (stesso principio anti-denylist del resto del
 * progetto: questo NON sostituisce il trust, lo accompagna). Un
 * comando che non matcha nessun pattern non è "sicuro" — è solo
 * "niente di ovvio trovato", distinzione dichiarata a chi legge gli
 * avvisi, non solo a chi legge questo commento.
 */
export function scansionaPatternSospetti(comando) {
  const testo = String(comando ?? '');
  const avvisi = [];
  if (/\brm\s+-rf\s+\/(?:\s|$)/.test(testo) || /\bdel\s+\/[sq]\b/i.test(testo)) {
    avvisi.push('cancellazione ricorsiva di una radice del filesystem');
  }
  if (/curl\s[^|]*\|\s*(sh|bash)\b/.test(testo) || /wget\s[^|]*\|\s*(sh|bash)\b/.test(testo)) {
    avvisi.push('scarica ed esegue uno script remoto in un solo passo (curl/wget | sh)');
  }
  if (/\b[A-Z_]*(API_KEY|SECRET|TOKEN|PASSWORD)\b/.test(testo) && /\b(curl|wget|nc\s|ncat)\b/.test(testo)) {
    avvisi.push('legge una credenziale e la manda in rete nello stesso comando');
  }
  if (/\bnc\s+-[a-z]*e\b|\/dev\/tcp\//.test(testo)) {
    avvisi.push('pattern di reverse shell (nc -e / /dev/tcp)');
  }
  return avvisi;
}

/**
 * Legge `<cartella>/.harness-ui-plugins/*\/plugin.json`. Un progetto
 * senza plugin dichiarati è uno stato valido — mai un errore, torna
 * `{plugin: []}`. Un singolo plugin malformato FERMA l'intero
 * caricamento, stesso principio di caricaSkill.
 */
export async function caricaPlugin({ cartella }, deps = {}) {
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const cartellaPlugin = join(cartella, NOME_CARTELLA_PLUGIN);
  let voci;
  try {
    voci = await readdirFn(cartellaPlugin, { withFileTypes: true });
  } catch (errore) {
    if (errore?.code === 'ENOENT') return { plugin: [] };
    throw new PluginRegistryError(`Impossibile leggere ${NOME_CARTELLA_PLUGIN}: ${errore.message}`, 'PLUGIN_READ_FAILED');
  }
  const plugin = [];
  for (const voce of voci) {
    if (!voce.isDirectory()) continue;
    const pluginId = voce.name;
    const percorso = join(cartellaPlugin, pluginId, NOME_FILE_MANIFESTO);
    let testo;
    try {
      testo = await readFileFn(percorso, 'utf8');
    } catch (errore) {
      if (errore?.code === 'ENOENT') continue; // una sottocartella senza plugin.json non è un plugin
      throw new PluginRegistryError(`Impossibile leggere ${pluginId}/${NOME_FILE_MANIFESTO}: ${errore.message}`, 'PLUGIN_READ_FAILED');
    }
    let dati;
    try {
      dati = JSON.parse(testo);
    } catch {
      throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO} non è un JSON valido`, 'PLUGIN_MALFORMED');
    }
    if (typeof dati?.nome !== 'string' || dati.nome.length === 0) {
      throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO} manca di "nome" (stringa non vuota)`, 'PLUGIN_MALFORMED');
    }
    if (typeof dati?.descrizione !== 'string' || dati.descrizione.length === 0) {
      throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO} manca di "descrizione" (stringa non vuota)`, 'PLUGIN_MALFORMED');
    }
    const hooks = dati.hooks ?? [];
    if (!Array.isArray(hooks)) {
      throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO} ha "hooks" non valido — atteso un array (anche vuoto)`, 'PLUGIN_MALFORMED');
    }
    hooks.forEach((h, indice) => {
      if (typeof h?.id !== 'string' || h.id.length === 0) {
        throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO}: hooks[${indice}] manca di "id"`, 'PLUGIN_MALFORMED');
      }
      if (!Array.isArray(h.eventi) || h.eventi.length === 0 || !h.eventi.every((e) => EVENTI_VALIDI.has(e))) {
        throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO}: hooks[${indice}] ("${h.id}") ha "eventi" non valido — atteso un array non vuoto fra ${[...EVENTI_VALIDI].join('/')}`, 'PLUGIN_MALFORMED');
      }
      if (typeof h.comando !== 'string' || h.comando.length === 0) {
        throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO}: hooks[${indice}] ("${h.id}") manca di "comando"`, 'PLUGIN_MALFORMED');
      }
    });
    const tools = dati.tools ?? [];
    if (!Array.isArray(tools)) {
      throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO} ha "tools" non valido — atteso un array (anche vuoto)`, 'PLUGIN_MALFORMED');
    }
    tools.forEach((t, indice) => {
      if (typeof t?.nome !== 'string' || t.nome.length === 0) {
        throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO}: tools[${indice}] manca di "nome"`, 'PLUGIN_MALFORMED');
      }
      if (typeof t.descrizione !== 'string' || t.descrizione.length === 0) {
        throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO}: tools[${indice}] ("${t.nome}") manca di "descrizione"`, 'PLUGIN_MALFORMED');
      }
      if (typeof t.comando !== 'string' || t.comando.length === 0) {
        throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO}: tools[${indice}] ("${t.nome}") manca di "comando"`, 'PLUGIN_MALFORMED');
      }
    });
    // ⭐ hash sul CONTENUTO TESTUALE del manifesto per intero — un carattere cambiato invalida il trust, nessuna eccezione.
    const hash = createHash('sha256').update(testo).digest('hex');
    plugin.push({ id: pluginId, nome: dati.nome, descrizione: dati.descrizione, hooks, tools, hash });
  }
  plugin.sort((a, b) => a.id.localeCompare(b.id));
  return { plugin };
}

function percorsoTrust(cartellaTrust, pluginId) {
  if (typeof pluginId !== 'string' || pluginId.length === 0 || /[\\/]|\.\./.test(pluginId)) {
    throw new PluginRegistryError('pluginId non valido — un nome, non un percorso', 'PLUGIN_ID_INVALID');
  }
  return join(cartellaTrust, `${pluginId}.json`);
}

/** Stesso comportamento esatto di verificaTrustMcp/verificaTrust — assente = non fidato, mai un errore. */
export async function verificaTrustPlugin({ cartellaTrust, pluginId, hash }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  let testo;
  try {
    testo = await readFileFn(percorsoTrust(cartellaTrust, pluginId), 'utf8');
  } catch {
    return false;
  }
  try {
    const dati = JSON.parse(testo);
    return dati?.hash === hash;
  } catch {
    return false;
  }
}

/** Stesso comportamento esatto di fidaServerMcp/fidaHook — chiamata SOLO da un'azione owner esplicita. */
export async function fidaPlugin({ cartellaTrust, pluginId, hash }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  await mkdirFn(cartellaTrust, { recursive: true });
  await writeFileFn(percorsoTrust(cartellaTrust, pluginId), JSON.stringify({ hash, fidatoIl: new Date().toISOString() }), 'utf8');
  return { fidato: true };
}
