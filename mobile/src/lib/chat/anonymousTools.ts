import { TALOS_AGENT_TOOL_CONTROLS } from '@/lib/tools/toolControlCatalog'
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
const REVEALING_GROUPS: ReadonlySet<string> = new Set(['library', 'personal'])
const KEPT_ANYWAY: ReadonlySet<string> = new Set(['time_now'])

/** The tool ids a temporary chat must not be offered. */
export const TALOS_TOOLS_HIDDEN_WHEN_ANONYMOUS: readonly string[] = Object.freeze(
    TALOS_AGENT_TOOL_CONTROLS
        .filter((tool) => REVEALING_GROUPS.has(tool.group) && !KEPT_ANYWAY.has(tool.id))
        .map((tool) => tool.id),
)

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
