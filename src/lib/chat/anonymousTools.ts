import type { TalosAgentToolEnabled } from '@/lib/tools/toolControls'

/**
 * Which tools a temporary chat may call.
 *
 * Owner 2026-07-31, defining the mode precisely: «deve essere praticamente come
 * la modalità incognito di Chrome, nessuno deve sapere chi sono… i tool tipo
 * generazione immagine ricerca web e altro se devono essere chiamati, dobbiamo
 * anonimizzare tutto quello che può farci riconoscere, mantenendo funzionalità
 * intatte».
 *
 * That is the right definition, and it is not "turn the tools off". Incognito
 * does not make the browser stop working — it makes it stop knowing who you
 * are. So the line is drawn by what a tool can REVEAL, not by what it costs:
 *
 *   library  — your documents. Reading them tells the model what you keep.
 *   personal — your notes, your tasks, what TALOS remembers about you.
 *   web      — the open internet. It knows nothing about you. KEPT.
 *   create   — making a document or an image. Reveals nothing. KEPT.
 *
 * `time_now` sits in the personal group and is deliberately kept: it reports
 * the device's clock, not the user. Blocking it would break "what time is it"
 * to protect nothing — incognito hides your history, not your watch.
 *
 * Suppressing the CONTEXT injection was never enough on its own. A chat that
 * refuses to volunteer your Library but hands it over the moment the model asks
 * is not anonymous; it just requires one more sentence. This closes the asking.
 */
/**
 * ⛔ Le due REGOLE restano qui anche se l'elenco è scritto: sono ciò che il
 * cancello usa per ricalcolarlo dal catalogo. Senza, la lista sarebbe un fatto
 * senza una ragione — e fra un anno nessuno saprebbe più perché `time_now` è
 * dentro `personal` ma non nasconde niente.
 */
export const TALOS_GRUPPI_CHE_RIVELANO: ReadonlySet<string> = new Set(['library', 'personal'])
export const TALOS_TENUTI_COMUNQUE: ReadonlySet<string> = new Set(['time_now'])

/**
 * The tool ids a temporary chat must not be offered.
 *
 * ⛔⛔ SCRITTO, e non derivato dal catalogo — ed è l'unico posto del progetto
 * dove si fa, con una ragione MISURATA.
 *
 * Derivarlo qui costava **8,8 KB** (pre-minify) al grafo d'avvio: questo modulo
 * è l'unico arco che tirava dentro `toolControlCatalog`, e il controller è
 * l'unico che importa questo modulo. Cioè ogni persona che apre TALOS pagava il
 * catalogo intero delle impostazioni per una funzione che nella chat normale
 * **rende i suoi argomenti immutati** (`if (!anonymous) return tools`).
 *
 * ⛔ E una lista scritta a mano è esattamente ciò che questo progetto vieta,
 * perché invecchia in silenzio. Quindi non è sola: `anonymousTools.test.ts` la
 * **ricalcola dal catalogo** e pretende che coincida, voce per voce. È lo stesso
 * patto delle impronte dei contratti — un valore fissato vale solo se un
 * cancello lo rifà. Aggiungere un tool a `library` o `personal` fa diventare
 * rosso quel test, e la riga si aggiorna lì.
 */
export const TALOS_TOOLS_HIDDEN_WHEN_ANONYMOUS: readonly string[] = Object.freeze([
    'library_list', 'library_search', 'library_read', 'library_file_origin',
    'notes_list', 'tasks_list', 'memory_search',
    'research_list', 'research_start', 'research_read', 'research_rename',
    'research_pause', 'research_resume', 'research_cancel', 'research_delete',
    'memory_write', 'memory_update', 'memory_delete',
    'notes_create', 'notes_update', 'notes_delete',
    'tasks_create', 'tasks_complete', 'tasks_update', 'tasks_delete',
    'library_export', 'library_rename', 'library_delete',
    'library_context_policy_update',
    'calendar_read', 'calendar_write',
])

/**
 * The tool switches as a temporary chat sees them.
 *
 * Returns the settings unchanged for an ordinary chat, so this cannot alter
 * behaviour anywhere it is not meant to. For a temporary one it turns the
 * revealing tools OFF — never on: a tool the user disabled stays disabled, so
 * anonymity can only ever subtract.
 */
export function talosAnonymousAgentTools(
    tools: Readonly<TalosAgentToolEnabled>,
    anonymous: boolean,
): Readonly<TalosAgentToolEnabled> {
    if (!anonymous) return tools
    const next = { ...tools } as Record<string, boolean>
    for (const id of TALOS_TOOLS_HIDDEN_WHEN_ANONYMOUS) next[id] = false
    return Object.freeze(next) as Readonly<TalosAgentToolEnabled>
}
