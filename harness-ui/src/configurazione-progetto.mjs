/*
 * ⭐⭐⭐ PO-26, parte 2 (24/09/2026) — DOVE si legge la configurazione che la PERSONA scrive nel progetto.
 *
 * Decisione owner del 24/09/2026 sera (memoria `po-26-una-cartella-dati-sola-fuori-dal-workspace`): la configurazione
 * nuova (hook, server MCP, plugin, skill) sta sotto UNA cartella, `.talos/`; i nomi vecchi nella radice del progetto
 * (`.harness-ui-hooks.json`, `.harness-ui-mcp.json`, `.harness-ui-plugins/`, `.harness-ui-skills/`) si LEGGONO ANCORA e
 * non si spostano mai: sono file della persona e possono stare nel suo git.
 *
 * ⛔ Perché si leggono entrambi e non «il nuovo, se c'è»: Claude Code ha smesso di leggere i server MCP in
 *   `~/.claude.json` (v2.0.8) e chi li aveva lì se li è visti sparire senza un avviso; le posizioni «quasi giuste»
 *   vengono ignorate in silenzio (anthropics/claude-code #15797, #32398; letti il 24/09/2026). Qui una voce della
 *   posizione vecchia resta attiva finché una voce con lo STESSO id non la sostituisce in `.talos/`.
 * ⛔ L'ordine è la precedenza: `.talos/` prima, il nome vecchio dopo. Chi legge le due posizioni tiene la prima voce
 *   per ogni id; chi cerca UN pacchetto (la riverifica di un plugin al momento dell'uso) prende la prima cartella che
 *   esiste. Le due regole danno sempre la stessa risposta.
 * Ricerca: `.claude/RICERCA-PO26-NOMI-E-CONFIGURAZIONE-2026-09-24.md`.
 */

/** La cartella della configurazione del progetto. */
export const CARTELLA_CONFIGURAZIONE = '.talos';

/** Le posizioni, relative al progetto, in ordine di precedenza. */
export const POSIZIONI_CONFIGURAZIONE = Object.freeze({
  hooks: Object.freeze(['.talos/hooks.json', '.harness-ui-hooks.json']),
  mcp: Object.freeze(['.talos/mcp.json', '.harness-ui-mcp.json']),
  plugin: Object.freeze(['.talos/plugins', '.harness-ui-plugins']),
  skills: Object.freeze(['.talos/skills', '.harness-ui-skills']),
});

/**
 * Tiene la PRIMA voce per ogni id, nell'ordine in cui arrivano. PURA.
 * @template T
 * @param {T[]} voci
 * @param {(voce: T) => string} idDi
 */
export function primaPerId(voci, idDi) {
  const viste = new Set();
  const tenute = [];
  for (const voce of voci) {
    const id = idDi(voce);
    if (viste.has(id)) continue;
    viste.add(id);
    tenute.push(voce);
  }
  return tenute;
}
