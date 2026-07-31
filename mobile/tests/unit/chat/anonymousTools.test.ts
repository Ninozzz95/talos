import { describe, expect, it } from 'vitest'
import {
    TALOS_TOOLS_HIDDEN_WHEN_ANONYMOUS,
    talosAnonymousAgentTools,
} from '@/lib/chat/anonymousTools'
import { TALOS_AGENT_TOOL_CONTROLS } from '@/lib/tools/toolControlCatalog'

/**
 * Owner 2026-07-31: a temporary chat has to be Chrome's incognito — «nessuno
 * deve sapere chi sono» — while «i tool tipo generazione immagine ricerca web
 * se devono essere chiamati… mantenendo funzionalità intatte».
 *
 * So the line is what a tool can REVEAL, not what it costs. And the reason this
 * exists at all: suppressing the context injection was never enough. A chat
 * that will not volunteer your Library but hands it over the moment the model
 * asks is not anonymous — it just needs one more sentence.
 */
const ALL = TALOS_AGENT_TOOL_CONTROLS.map((tool) => tool.id)
const on = Object.fromEntries(ALL.map((id) => [id, true])) as never

describe('what a temporary chat may call', () => {
    it('hides everything that could say who you are', () => {
        const tools = talosAnonymousAgentTools(on, true) as Record<string, boolean>

        for (const id of ['library_search', 'library_read', 'library_list', 'library_export']) {
            expect(tools[id], `${id} must be hidden`).toBe(false)
        }
        for (const id of ['memory_search', 'notes_list', 'tasks_list']) {
            expect(tools[id], `${id} must be hidden`).toBe(false)
        }
    })

    /** Incognito does not stop the browser working. */
    it('leaves the web and the making of things alone', () => {
        const tools = talosAnonymousAgentTools(on, true) as Record<string, boolean>

        for (const id of ['web_search', 'web_read', 'document_create', 'generate_image']) {
            expect(tools[id], `${id} must keep working`).toBe(true)
        }
    })

    /** The clock is the device's, not the user's: hiding it protects nothing. */
    it('keeps the clock', () => {
        expect((talosAnonymousAgentTools(on, true) as Record<string, boolean>).time_now).toBe(true)
    })

    it('changes nothing at all in an ordinary chat', () => {
        expect(talosAnonymousAgentTools(on, false)).toBe(on)
    })

    /** Anonymity may only ever subtract: a tool the user turned off stays off. */
    it('never switches a tool back on', () => {
        const off = { ...(on as object), web_search: false } as never
        const tools = talosAnonymousAgentTools(off, true) as Record<string, boolean>

        expect(tools.web_search).toBe(false)
    })

    /**
     * The guard that matters in a year: a tool added to the catalogue in a
     * revealing group is hidden without anyone remembering this file exists.
     */
    it('covers every revealing tool in the catalogue, not a list I typed', () => {
        const revealing = TALOS_AGENT_TOOL_CONTROLS
            .filter((tool) => (tool.group === 'library' || tool.group === 'personal') && tool.id !== 'time_now')
            .map((tool) => tool.id)

        expect([...TALOS_TOOLS_HIDDEN_WHEN_ANONYMOUS].sort()).toEqual([...revealing].sort())
    })
})
