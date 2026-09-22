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
import {
  caricaPlugin as caricaPluginReale,
  verificaTrustPlugin as verificaTrustPluginReale,
} from './plugin-registry.mjs';
import { createProcessPolicy, parseProcessCommand } from './process-policy.mjs';

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
  const [executable, ...args] = parseProcessCommand(comando);
  const envKeys = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TALOS_PLUGIN_TOOL_ARGS'];
  const allowedExecutables = deps.allowedExecutables ?? ['node', 'node.exe', 'echo', 'echo.exe'];
  const policy = createProcessPolicy({
    allowedExecutables,
    capabilities: { plugin: cartella },
    envAllowlist: envKeys,
    spawnFn: deps.spawnFn,
  });
  const result = await policy.runApprovedProcess({
    executable,
    args,
    cwd: cartella,
    capability: 'plugin',
    timeoutMs: TIMEOUT_MS,
    envKeys,
    env: { TALOS_PLUGIN_TOOL_ARGS: JSON.stringify(argomenti ?? {}) },
    captureLimitBytes: 64 * 1024,
  });
  const testoFuori = result.stdout.trim();
  const testoErrori = result.stderr.trim();
  if (result.code === 0) return testoFuori || '(nessun output)';
  return [`comando terminato con codice ${result.code}`, testoErrori, testoFuori].filter(Boolean).join('\n');
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
  /*
   * ⛔⛔ A-4 (17/09/2026) — `falliti` MORIVA QUI. Questa funzione dichiara di tornare `falliti` e
   *   tornava sempre `[]`, perché scartava quello che `caricaPlugin` le dava. Dal secondo giro
   *   `caricaPlugin` raccoglie i guasti PER PLUGIN (un collegamento, troppi file, un comando che
   *   esce dalla cartella): buttarli qui significa che un pacchetto guasto sparisce dalla sessione
   *   senza che niente dica perché — cioè il difetto che quei `falliti` esistono per chiudere.
   * ⛔ Il commento storico qui sotto («mai usata oggi») non vale più: adesso è piena.
   */
  let falliti = [];
  try {
    ({ plugin, falliti = [] } = await caricaPluginFn({ cartella }));
  } catch {
    // ⭐ stesso principio di hook/MCP: un manifesto malformato non blocca la sessione, degrada a "nessun plugin".
    return { toolPlugin: [], eseguiToolPluginFn: null, hookPlugin: [], falliti: [] };
  }

  const toolPlugin = [];
  const hookPlugin = [];
  const instradamento = new Map(); // nomeEsposto -> { comando }

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
      /*
       * ⛔⛔⛔ A-3 (17/09/2026): nella mappa ci va l'id VERO, non lo si ricava dal nome esposto.
       *   Chi deve riverificare la fiducia prima di eseguire (`agent-service.mjs`) tagliava il
       *   nome su `__` e ricostruiva l'id: due verità sulla stessa cosa, che il terzo controllo ha
       *   fatto divergere in due modi (un id `a__b` faceva controllare `a`; un id `_sano` non si
       *   riconosceva affatto). Qui l'id lo abbiamo in mano: si porta, non si indovina.
       */
      instradamento.set(nomeEsposto, { comando: t.comando, pluginId: p.id });
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

  /*
   * ⛔ A-3: `pluginIdDiTool` è la sola strada per sapere DI CHI è un attrezzo. Chi riverifica la
   *   fiducia prima di eseguirlo (`agent-service.mjs`) la usa al posto di tagliare il nome
   *   esposto: se l'attrezzo non è in questa mappa, non è di questa sessione e non si esegue.
   */
  return { toolPlugin, eseguiToolPluginFn, hookPlugin, falliti, pluginIdDiTool: (n) => instradamento.get(n)?.pluginId ?? null };
}
