/**
 * plugin-session.mjs — FASE G del piano `elegant-spinning-dongarra.md`,
 * esecuzione (29/8): il punto che UNISCE `plugin-registry.mjs` (quali
 * plugin sono dichiarati e fidati) in quello che una sessione REALE
 * offre al kernel — `toolPlugin` + `eseguiToolPluginFn`, esattamente
 * la forma che `talosLavora` accetta (vedi
 * `AVM-harness/.../talosHarness.mjs`, commit `b9065891`) — più
 * `hookPlugin`, gli hook dei plugin fidati pronti per fondersi
 * nell'elenco che `hook-registry.mjs` già produce (vedi la doc su
 * `costruisciHookFn` in `session-registry.mjs`).
 *
 * Mirror di `mcp-session.mjs`, con differenze deliberate:
 * - EAGER come MCP (i tool devono essere noti PRIMA della prima
 *   chiamata al modello), ma senza connessione persistente: un tool
 *   di plugin non è un processo che resta vivo, è un comando lanciato
 *   ON-DEMAND ad ogni chiamata (spawn, non connect+call) — più vicino
 *   a come l'attrezzo `shell` del kernel gira un comando, che al
 *   protocollo MCP.
 * - Nome esposto SEMPRE prefissato `plugin__<pluginId>__<toolName>`
 *   (stessa convenzione di `mcp__<serverId>__<toolName>` in
 *   `mcp-session.mjs`) — due plugin indipendenti possono dichiarare
 *   un tool con lo stesso nome, e non sanno l'uno dell'altro.
 * - Solo i plugin FIDATI (`verificaTrustPlugin`, hash sull'INTERO
 *   manifesto — non per componente, vedi `plugin-registry.mjs`)
 *   contribuiscono tool E hook. Un plugin mai fidato, o il cui
 *   manifesto è cambiato da quando è stato fidato, resta interamente
 *   inerte: zero tool offerti, zero hook nella lista tornata.
 * - `hookPlugin` porta id GIÀ QUALIFICATI (`plugin:<pluginId>:<hookId>`)
 *   per non collidere con un hook scritto a mano in
 *   `.harness-ui-hooks.json` o con l'omonimo di un altro plugin, e
 *   NON porta un hash da verificare di nuovo altrove: la fiducia è già
 *   stata accertata QUI (sul plugin intero) — chi fonde questo elenco
 *   (`costruisciHookFn`) tratta ogni voce di `hookPlugin` come
 *   già-fidata, mai una seconda verifica nella cartella di trust degli
 *   hook singoli (namespace di trust diverso, per costruzione: un
 *   hook standalone è fidato per HASH DEL SUO COMANDO, un hook di
 *   plugin per HASH DELL'INTERO MANIFESTO — mischiare i due namespace
 *   sarebbe un bug di sicurezza, non una semplificazione).
 */
import { spawn } from 'node:child_process';

import {
  caricaPlugin as caricaPluginReale,
  verificaTrustPlugin as verificaTrustPluginReale,
} from './plugin-registry.mjs';

const SEPARATORE = '__';
const PREFISSO = `plugin${SEPARATORE}`;
// ⭐ un tool di plugin è un comando singolo, non un giro di test — più di un hook (10s, hook-registry.mjs) ma meno di eseguiProva nel kernel (120s): non è né un controllo rapido né un'intera suite.
const TIMEOUT_MS = 60_000;

/** Pura: costruisce il nome esposto al modello. Un test la esercita senza spawnare nulla. */
export function nomeEspostoPlugin(pluginId, nomeTool) {
  return `${PREFISSO}${pluginId}${SEPARATORE}${nomeTool}`;
}

/** Pura: l'id qualificato di un hook di plugin, per non collidere con hook standalone o di un altro plugin. */
export function hookIdQualificato(pluginId, hookId) {
  return `plugin:${pluginId}:${hookId}`;
}

/**
 * Esegue `comando` come sottoprocesso locale (shell, cwd della
 * sessione), passando gli argomenti della tool-call via una variabile
 * d'ambiente (`TALOS_PLUGIN_TOOL_ARGS`, JSON — stesso principio già
 * in uso in `eseguiHook` per `TALOS_HOOK_EVENT`: mai un templating
 * della stringa comando, che aprirebbe a injection).
 *
 * ⭐ Un codice di uscita non-zero è un ESITO del comando, non un
 * guasto del canale — risolve comunque, con l'output annotato, stesso
 * principio già in uso per `shell`/`prova` nel kernel: il modello lo
 * vede e si adatta. Solo un vero guasto di spawn (comando introvabile,
 * permessi) rigetta la Promise — diventa "plugin tool call failed:
 * ..." nel kernel, la stessa distinzione già presa per
 * `chiamaToolMcpFn`.
 */
export async function eseguiComandoPlugin({ comando, argomenti, cartella }, deps = {}) {
  const spawnFn = deps.spawnFn ?? spawn;
  return new Promise((risolvi, rifiuta) => {
    let p;
    try {
      p = spawnFn(comando, {
        cwd: cartella,
        shell: true,
        windowsHide: true,
        env: { ...process.env, TALOS_PLUGIN_TOOL_ARGS: JSON.stringify(argomenti ?? {}) },
      });
    } catch (errore) {
      rifiuta(errore instanceof Error ? errore : new Error(String(errore)));
      return;
    }
    let fuori = '';
    let errori = '';
    p.stdout?.on('data', (d) => { fuori += d; });
    p.stderr?.on('data', (d) => { errori += d; });
    const timer = setTimeout(() => { p.kill(); }, TIMEOUT_MS);
    p.on('close', (codice) => {
      clearTimeout(timer);
      const testoFuori = fuori.trim();
      const testoErrori = errori.trim();
      if (codice === 0) {
        risolvi(testoFuori || '(nessun output)');
      } else {
        risolvi([`comando terminato con codice ${codice}`, testoErrori, testoFuori].filter(Boolean).join('\n'));
      }
    });
    p.on('error', (errore) => {
      clearTimeout(timer);
      rifiuta(errore instanceof Error ? errore : new Error(String(errore)));
    });
  });
}

/**
 * Carica i plugin del workspace, li filtra a quelli FIDATI, e torna
 * `{toolPlugin, eseguiToolPluginFn, hookPlugin, falliti}` pronto per
 * `talosLavora`/`costruisciHookFn`.
 *
 * `falliti`: `{pluginId, errore}[]` — mai usata oggi (un plugin fidato
 * non ha un passo di "connessione" che possa fallire, a differenza di
 * MCP) ma tornata per SIMMETRIA con `preparaToolMcpPerSessione` e per
 * non chiudere la porta a un fallimento futuro (es. un `parametri`
 * malformato scoperto solo qui) — un array vuoto oggi è un fatto
 * onesto, non un placeholder.
 */
export async function preparaToolPluginPerSessione({ cartella, cartellaTrust }, deps = {}) {
  const caricaPluginFn = deps.caricaPluginFn ?? caricaPluginReale;
  const verificaTrustPluginFn = deps.verificaTrustPluginFn ?? verificaTrustPluginReale;
  const eseguiComandoPluginFn = deps.eseguiComandoPluginFn ?? eseguiComandoPlugin;

  let plugin = [];
  try {
    ({ plugin } = await caricaPluginFn({ cartella }));
  } catch {
    // ⭐ stesso principio di hook/MCP: un manifesto malformato non blocca la sessione, degrada a "nessun plugin".
    return { toolPlugin: [], eseguiToolPluginFn: null, hookPlugin: [], falliti: [] };
  }

  const toolPlugin = [];
  const hookPlugin = [];
  const instradamento = new Map(); // nomeEsposto -> { comando }
  const falliti = [];

  for (const p of plugin) {
    let fidato = false;
    try {
      fidato = await verificaTrustPluginFn({ cartellaTrust, pluginId: p.id, hash: p.hash });
    } catch {
      fidato = false; // un registro di trust che non si legge non autorizza in silenzio
    }
    if (!fidato) continue; // un plugin non fidato è come se non esistesse — zero tool, zero hook

    for (const t of p.tools) {
      const nomeEsposto = nomeEspostoPlugin(p.id, t.nome);
      toolPlugin.push({ nome: nomeEsposto, descrizione: t.descrizione, parametri: t.parametri });
      instradamento.set(nomeEsposto, { comando: t.comando });
    }
    for (const h of p.hooks) {
      hookPlugin.push({ id: hookIdQualificato(p.id, h.id), eventi: h.eventi, comando: h.comando });
    }
  }

  const eseguiToolPluginFn = toolPlugin.length > 0
    ? async (nomeEsposto, argomenti) => {
      const voce = instradamento.get(nomeEsposto);
      if (!voce) throw new Error(`tool di plugin "${nomeEsposto}" non è fra quelli offerti in questa sessione`);
      return eseguiComandoPluginFn({ comando: voce.comando, argomenti, cartella });
    }
    : null;

  return { toolPlugin, eseguiToolPluginFn, hookPlugin, falliti };
}
