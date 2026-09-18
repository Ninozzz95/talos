/** NAV-02: a command is an existing capability, not a label with a simulated outcome. */
import type { View } from '../../domain/navigation.ts';
export interface CommandDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly group: 'Navigazione' | 'Sessione' | 'Configurazione';
  readonly icon: string;
  readonly keywords: string;
  readonly view?: View;
  readonly shortcut?: string;
  readonly requirement?: 'session' | 'idle-session';
}
export interface CommandContext { readonly sessionId: string | null; readonly running: boolean; }
export interface CommandMatch { readonly command: CommandDefinition; readonly disabledReason: string | null; }

export const COMMANDS: readonly CommandDefinition[] = Object.freeze([
  { id: 'home', label: 'Home', description: 'Riprendi il lavoro e apri un progetto.', group: 'Navigazione', icon: 'i-grid', keywords: 'inizio workspace start', view: 'home' },
  { id: 'chat', label: 'Conversazione', description: 'Torna ai messaggi della sessione.', group: 'Navigazione', icon: 'i-list', keywords: 'chat conversation messaggi', view: 'chat' },
  { id: 'review', label: 'Revisione delle modifiche', description: 'Esamina i file e le differenze.', group: 'Navigazione', icon: 'i-diff', keywords: 'review diff changes codice', view: 'diff' },
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
  { id: 'terminal', label: 'Apri terminale', description: 'Usa la shell reale del computer.', group: 'Navigazione', icon: 'i-terminal', keywords: 'terminal shell console', view: 'terminal', shortcut: 'mod `' },
  { id: 'browser', label: 'Apri browser', description: 'Consulta pagine e annotazioni.', group: 'Navigazione', icon: 'i-globe', keywords: 'web page navigation', view: 'browser' },
  { id: 'dashboard', label: 'Tutte le sessioni', description: 'Apri la cronologia e lo stato delle sessioni.', group: 'Navigazione', icon: 'i-grid', keywords: 'board dashboard session history cronologia', view: 'dashboard' },
  { id: 'projects', label: 'Progetti', description: 'Trova i workspace e le sessioni collegate.', group: 'Navigazione', icon: 'i-folder', keywords: 'projects workspace cartelle', view: 'progetti' },
  { id: 'library', label: 'Libreria e documenti', description: 'Consulta file e artefatti del lavoro.', group: 'Navigazione', icon: 'i-doc', keywords: 'library documents artifacts allegati', view: 'libreria' },
  { id: 'notes', label: 'Note', description: 'Leggi e organizza i tuoi appunti.', group: 'Navigazione', icon: 'i-edit', keywords: 'notes appunti', view: 'note' },
  { id: 'tasks', label: 'Attività', description: 'Controlla le attività e i risultati.', group: 'Navigazione', icon: 'i-check-sq', keywords: 'tasks todo da fare', view: 'attivita' },
  { id: 'memory', label: 'Memoria', description: 'Consulta ciò che il workspace conserva.', group: 'Navigazione', icon: 'i-brain', keywords: 'memory ricordi knowledge', view: 'memoria' },
  { id: 'research', label: 'Ricerca approfondita', description: 'Apri ricerche, rapporti e fonti.', group: 'Navigazione', icon: 'i-globe', keywords: 'research deep report sources', view: 'ricerca' },
  { id: 'automations', label: 'Automazioni', description: 'Gestisci pianificazioni e cronologia.', group: 'Navigazione', icon: 'i-clock', keywords: 'automations schedule programmate', view: 'automations' },
  { id: 'forge', label: 'Officina strumenti', description: 'Consulta e gestisci gli strumenti creati.', group: 'Navigazione', icon: 'i-bolt', keywords: 'forge tools officina', view: 'officina' },
  { id: 'new', label: 'Nuova sessione', description: 'Scegli un progetto senza avviare operazioni.', group: 'Sessione', icon: 'i-plus', keywords: 'new session open project nuova cartella', shortcut: 'mod N' },
  { id: 'rename', label: 'Rinomina sessione', description: 'Cambia il titolo della sessione corrente.', group: 'Sessione', icon: 'i-edit', keywords: 'rename title nome', requirement: 'session' },
  { id: 'resume', label: 'Riprendi sessione', description: 'Richiedi un nuovo turno nella sessione corrente.', group: 'Sessione', icon: 'i-play', keywords: 'resume continue continua', requirement: 'idle-session' },
  { id: 'fork', label: 'Duplica come ramo', description: 'Crea un ramo dalla sessione corrente.', group: 'Sessione', icon: 'i-branch', keywords: 'fork branch duplica', requirement: 'idle-session' },
  { id: 'compact', label: 'Gestione del contesto', description: 'Consulta misure, memoria protetta e compattazione.', group: 'Sessione', icon: 'i-brain', keywords: 'context compact compress contesto token', requirement: 'session' },
  { id: 'tree', label: 'Albero della sessione', description: 'Consulta rami e deleghe.', group: 'Sessione', icon: 'i-branch', keywords: 'tree session albero deleghe', requirement: 'session' },
  { id: 'export', label: 'Esporta sessione', description: 'Scegli Markdown o eventi JSON reali.', group: 'Sessione', icon: 'i-doc', keywords: 'export download scarica', requirement: 'session' },
  { id: 'share', label: 'Prepara una copia da condividere', description: 'Scegli il formato della trascrizione reale.', group: 'Sessione', icon: 'i-doc', keywords: 'share snapshot condividi copia', requirement: 'session' },
  { id: 'model', label: 'Scegli un modello', description: 'Cambia il modello per la prossima richiesta.', group: 'Configurazione', icon: 'i-bolt', keywords: 'model llm locale cloud', shortcut: 'mod ⇧ M' },
  { id: 'models', label: 'Modelli locali e download', description: 'Apri il laboratorio dei modelli.', group: 'Configurazione', icon: 'i-bolt', keywords: 'models local locale locali download gguf runtime ollama' },
  { id: 'providers', label: 'Provider e accessi', description: 'Configura account e credenziali.', group: 'Configurazione', icon: 'i-shield', keywords: 'provider api key chiavi account' },
  { id: 'permissions', label: 'Permessi', description: 'Controlla le autorizzazioni senza modificarle automaticamente.', group: 'Configurazione', icon: 'i-shield', keywords: 'permissions access sicurezza' },
  { id: 'skills', label: 'Attrezzi, skill e connettori', description: 'Consulta capacità, MCP ed estensioni.', group: 'Configurazione', icon: 'i-bolt', keywords: 'skills mcp plugin gateway capability tools' },
  { id: 'control', label: 'Doctor', description: 'Leggi la diagnostica del sistema.', group: 'Configurazione', icon: 'i-settings', keywords: 'doctor diagnostics diagnostica salute agents hooks' },
  { id: 'settings', label: 'Impostazioni', description: 'Personalizza il workspace e il comportamento.', group: 'Configurazione', icon: 'i-settings', keywords: 'settings preferences appearance aspetto tema', view: 'settings', shortcut: 'mod ,' },
  { id: 'shortcuts', label: 'Scorciatoie da tastiera', description: 'Consulta i comandi e le combinazioni disponibili.', group: 'Configurazione', icon: 'i-list', keywords: 'keyboard shortcuts keybindings tasti', shortcut: 'mod /' },
].map(command => Object.freeze(command)) as CommandDefinition[]);

export function commandById(id: string): CommandDefinition | undefined { return COMMANDS.find(command => command.id === id); }
export function commandDisabledReason(command: CommandDefinition, context: CommandContext): string | null {
  if (command.requirement && !context.sessionId) return 'Apri prima una sessione.';
  if (command.requirement === 'idle-session' && context.running) return 'Attendi la fine dell’esecuzione.';
  return null;
}
export function normalizeCommandQuery(value: string): string {
  return value.slice(0, 512).normalize('NFKD').replace(/\p{Mark}/gu, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}
/** Every token must match; accent-insensitive aliases work in either UI language. */
export function findCommands(query: string, context: CommandContext, translate: (text: string) => string = text => text): CommandMatch[] {
  const q = normalizeCommandQuery(query), tokens = q.split(' ').filter(Boolean);
  return COMMANDS.map((command, order) => {
    const label = normalizeCommandQuery(translate(command.label));
    const haystack = normalizeCommandQuery(`${command.label} ${label} ${translate(command.description)} ${command.keywords} ${translate(command.group)}`);
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
