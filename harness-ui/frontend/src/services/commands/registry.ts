/** NAV-02: a command is an existing capability, not a label with a simulated outcome. */
import type { View } from '../../domain/navigation.ts';
import { t } from '../../components/lingua.js';
import { TESTI } from '../../i18n/testi/index.js';
export interface CommandDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly group: 'comandi.group.navigation' | 'comandi.group.session' | 'comandi.group.configuration';
  readonly icon: string;
  readonly keywords: string;
  readonly view?: View;
  readonly shortcut?: string;
  readonly requirement?: 'session' | 'idle-session';
}
export interface CommandContext { readonly sessionId: string | null; readonly running: boolean; }
export interface CommandMatch { readonly command: CommandDefinition; readonly disabledReason: string | null; }

export const COMMANDS: readonly CommandDefinition[] = Object.freeze([
  { id: 'home', label: 'comandi.home.label', description: 'comandi.home.description', group: 'comandi.group.navigation', icon: 'i-grid', keywords: 'inizio workspace start', view: 'home' },
  { id: 'chat', label: 'comandi.chat.label', description: 'comandi.chat.description', group: 'comandi.group.navigation', icon: 'i-list', keywords: 'chat conversation messaggi', view: 'chat' },
  { id: 'review', label: 'comandi.review.label', description: 'comandi.review.description', group: 'comandi.group.navigation', icon: 'i-diff', keywords: 'review diff changes codice', view: 'diff' },
  /*
   * ⛔ 18/09/2026 — `shortcut: 'mod \`'` DICHIARATO, perché il tasto ESISTE E FUNZIONA da sempre:
   *   la gestione sta in `app.js` (Ctrl + `Backquote` → mostra o nascondi il terminale) e la scheda
   *   «Scorciatoie da tastiera» lo elenca (`components/scorciatoie.js`, `{ id: 'terminale', combo:
   *   'mod \`' }`). Solo la TAVOLOZZA non lo annunciava, e questa riga non l'ha mai avuto: è
   *   arrivata così con la PR #27 (unico commit del file, `cdbf51c9`). Il campo è di SOLA
   *   VISUALIZZAZIONE (`features/navigation/command-palette.ts:80` disegna il `<kbd>` quando
   *   c'è): nessun cambio di comportamento, nessun tasto nuovo.
   *   Ricerca 18/09/2026 — «display keyboard shortcuts next to commands» è la pratica corrente
   *   (Linear e Raycast le mostrano a destra, in pill; il project switcher di VS Code è citato
   *   come il contro-esempio: «no persistent hint about available keyboard shortcuts»):
   *   techinterview.org «Build a Command Palette: Cmd+K like Linear and Vercel»; synthetic-skills
   *   «power-user patterns» (suggerimenti in tre superfici: tavolozza, tooltip, pannello dedicato).
   */
  { id: 'terminal', label: 'comandi.terminal.label', description: 'comandi.terminal.description', group: 'comandi.group.navigation', icon: 'i-terminal', keywords: 'terminal shell console', view: 'terminal', shortcut: 'mod `' },
  { id: 'browser', label: 'comandi.browser.label', description: 'comandi.browser.description', group: 'comandi.group.navigation', icon: 'i-globe', keywords: 'web page navigation', view: 'browser' },
  { id: 'dashboard', label: 'comandi.dashboard.label', description: 'comandi.dashboard.description', group: 'comandi.group.navigation', icon: 'i-grid', keywords: 'board dashboard session history cronologia', view: 'dashboard' },
  { id: 'projects', label: 'comandi.projects.label', description: 'comandi.projects.description', group: 'comandi.group.navigation', icon: 'i-folder', keywords: 'projects workspace cartelle', view: 'progetti' },
  { id: 'library', label: 'comandi.library.label', description: 'comandi.library.description', group: 'comandi.group.navigation', icon: 'i-doc', keywords: 'library documents artifacts allegati', view: 'libreria' },
  { id: 'notes', label: 'comandi.notes.label', description: 'comandi.notes.description', group: 'comandi.group.navigation', icon: 'i-edit', keywords: 'notes appunti', view: 'note' },
  { id: 'tasks', label: 'comandi.tasks.label', description: 'comandi.tasks.description', group: 'comandi.group.navigation', icon: 'i-check-sq', keywords: 'tasks todo da fare', view: 'attivita' },
  { id: 'memory', label: 'comandi.memory.label', description: 'comandi.memory.description', group: 'comandi.group.navigation', icon: 'i-brain', keywords: 'memory ricordi knowledge', view: 'memoria' },
  { id: 'research', label: 'comandi.research.label', description: 'comandi.research.description', group: 'comandi.group.navigation', icon: 'i-globe', keywords: 'research deep report sources', view: 'ricerca' },
  { id: 'automations', label: 'comandi.automations.label', description: 'comandi.automations.description', group: 'comandi.group.navigation', icon: 'i-clock', keywords: 'automations schedule programmate', view: 'automations' },
  { id: 'forge', label: 'comandi.forge.label', description: 'comandi.forge.description', group: 'comandi.group.navigation', icon: 'i-bolt', keywords: 'forge tools officina', view: 'officina' },
  { id: 'new', label: 'comandi.new.label', description: 'comandi.new.description', group: 'comandi.group.session', icon: 'i-plus', keywords: 'new session open project nuova cartella', shortcut: 'mod N' },
  { id: 'rename', label: 'comandi.rename.label', description: 'comandi.rename.description', group: 'comandi.group.session', icon: 'i-edit', keywords: 'rename title nome', requirement: 'session' },
  { id: 'resume', label: 'comandi.resume.label', description: 'comandi.resume.description', group: 'comandi.group.session', icon: 'i-play', keywords: 'resume continue continua', requirement: 'idle-session' },
  { id: 'fork', label: 'comandi.fork.label', description: 'comandi.fork.description', group: 'comandi.group.session', icon: 'i-branch', keywords: 'fork branch duplica', requirement: 'idle-session' },
  { id: 'compact', label: 'comandi.compact.label', description: 'comandi.compact.description', group: 'comandi.group.session', icon: 'i-brain', keywords: 'context compact compress contesto token', requirement: 'session' },
  { id: 'tree', label: 'comandi.tree.label', description: 'comandi.tree.description', group: 'comandi.group.session', icon: 'i-branch', keywords: 'tree session albero deleghe', requirement: 'session' },
  { id: 'export', label: 'comandi.export.label', description: 'comandi.export.description', group: 'comandi.group.session', icon: 'i-doc', keywords: 'export download scarica', requirement: 'session' },
  { id: 'share', label: 'comandi.share.label', description: 'comandi.share.description', group: 'comandi.group.session', icon: 'i-doc', keywords: 'share snapshot condividi copia', requirement: 'session' },
  { id: 'model', label: 'comandi.model.label', description: 'comandi.model.description', group: 'comandi.group.configuration', icon: 'i-bolt', keywords: 'model llm locale cloud', shortcut: 'mod ⇧ M' },
  { id: 'models', label: 'comandi.models.label', description: 'comandi.models.description', group: 'comandi.group.configuration', icon: 'i-bolt', keywords: 'models local locale locali download gguf runtime ollama' },
  /* ⛔ 23/09/2026 — decisione owner: il comando porta a Laboratorio modelli → scheda «Provider» (prima
     apriva «Account», e la descrizione prometteva account). La descrizione dice dove si arriva. */
  { id: 'providers', label: 'comandi.providers.label', description: 'comandi.providers.description', group: 'comandi.group.configuration', icon: 'i-shield', keywords: 'provider fornitori api key chiavi credenziali account' },
  { id: 'permissions', label: 'comandi.permissions.label', description: 'comandi.permissions.description', group: 'comandi.group.configuration', icon: 'i-shield', keywords: 'permissions access sicurezza' },
  { id: 'skills', label: 'comandi.skills.label', description: 'comandi.skills.description', group: 'comandi.group.configuration', icon: 'i-bolt', keywords: 'skills mcp plugin gateway capability tools' },
  { id: 'control', label: 'comandi.control.label', description: 'comandi.control.description', group: 'comandi.group.configuration', icon: 'i-settings', keywords: 'doctor diagnostics diagnostica salute agents hooks' },
  { id: 'settings', label: 'comandi.settings.label', description: 'comandi.settings.description', group: 'comandi.group.configuration', icon: 'i-settings', keywords: 'settings preferences appearance aspetto tema', view: 'settings', shortcut: 'mod ,' },
  { id: 'shortcuts', label: 'comandi.shortcuts.label', description: 'comandi.shortcuts.description', group: 'comandi.group.configuration', icon: 'i-list', keywords: 'keyboard shortcuts keybindings tasti', shortcut: 'mod /' },
].map(command => Object.freeze(command)) as CommandDefinition[]);

export function commandById(id: string): CommandDefinition | undefined { return COMMANDS.find(command => command.id === id); }
export function commandDisabledReason(command: CommandDefinition, context: CommandContext): string | null {
  if (command.requirement && !context.sessionId) return 'comandi.reason.openSessionFirst';
  if (command.requirement === 'idle-session' && context.running) return 'comandi.reason.waitForRun';
  return null;
}
export function normalizeCommandQuery(value: string): string {
  return value.slice(0, 512).normalize('NFKD').replace(/\p{Mark}/gu, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}
/**
 * Every token must match; accent-insensitive aliases work in either UI language.
 * 03/10/2026: label, description and group are dictionary keys (area `comandi`). The search reads the label in BOTH languages,
 *   plus the description and group in the current one, so «attività» and «tasks» find the same command whatever the UI says.
 */
export function findCommands(query: string, context: CommandContext, translate: (text: string) => string = t): CommandMatch[] {
  const q = normalizeCommandQuery(query), tokens = q.split(' ').filter(Boolean);
  return COMMANDS.map((command, order) => {
    const label = normalizeCommandQuery(translate(command.label));
    const dueLingue = `${TESTI.it[command.label] ?? ''} ${TESTI.en[command.label] ?? ''}`;
    const haystack = normalizeCommandQuery(`${dueLingue} ${label} ${translate(command.description)} ${command.keywords} ${translate(command.group)}`);
    const score = !q ? 0 : label === q ? 3 : label.startsWith(q) ? 2 : tokens.every(token => label.includes(token)) ? 1 : 0;
    return { command, order, score, matches: tokens.every(token => haystack.includes(token)) };
  }).filter(item => item.matches).sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ command }) => ({ command, disabledReason: commandDisabledReason(command, context) }));
}
export function nextCommandIndex(length: number, current: number, direction: -1 | 1): number {
  if (!length) return -1;
  if (current < 0 || current >= length) return direction === 1 ? 0 : length - 1;
  return (current + direction + length) % length;
}
