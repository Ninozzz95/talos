import { describe, expect, it, vi } from 'vitest'
import { runTalosAgentLoop } from '@/lib/tools/agentLoop'
import type { ChatTurn, TalosToolCall } from '@/stores/chat'

/**
 * ⛔⛔ ART-L-06..08 — il ciclo cattura il corpo dell'artefatto dal blocco ```html (owner 2026-10-23, solo motore locale).
 *
 * `artifact_create({ title, kind })` torna «Ready…» con `attesaBlocco`; la risposta DOPO porta il documento come blocco
 * recintato. Il ciclo lo prende e lo crea con una chiamata VERA all'attrezzo (`deps.execute`), così scheda, permessi e
 * registro restano quelli di sempre, e dal testo che resta il blocco sparisce: al suo posto c'è la scheda.
 */

const apri: TalosToolCall = { id: 'a1', name: 'artifact_create', arguments: '{"title":"Casa Barnes","kind":"html"}' }
const pronto = {
    ok: true,
    content: 'Ready for "Casa Barnes". Now reply with ONLY one fenced block.',
    attesaBlocco: { titolo: 'Casa Barnes', tipo: 'html' as const },
}

describe('ART-L il corpo dell’artefatto dal blocco html', () => {
    it('ART-L-06 il blocco chiuso diventa una chiamata vera con title e html, e sparisce dal testo', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [apri] })
            .mockResolvedValueOnce({ text: 'Ecco il sito.\n\n```html\n<p>Casa Barnes</p>\n```\n\nFammi sapere.' })
        const execute = vi.fn(async (call: TalosToolCall) => ('html' in JSON.parse(call.arguments)
            ? { ok: true, content: 'Created the visual "Casa Barnes".' }
            : pronto))

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'crea il sito' }], { complete, execute })

        expect(execute).toHaveBeenCalledTimes(2)
        const seconda = execute.mock.calls[1]![0] as TalosToolCall
        expect(seconda.name).toBe('artifact_create')
        expect(JSON.parse(seconda.arguments)).toEqual({ title: 'Casa Barnes', html: '<p>Casa Barnes</p>' })
        expect(outcome.text).not.toContain('```html')
        expect(outcome.text).toContain('Fammi sapere.')
        expect(outcome.executed.map((e) => e.ok)).toEqual([true, true])
        // ⛔ Il documento intero non resta negli eseguiti, che finiscono nel checkpoint salvato.
        expect(JSON.stringify(outcome.executed)).not.toContain('<p>Casa Barnes</p>')
    })

    it('ART-L-07 il blocco tagliato dal tetto non crea niente e chiude il turno con onestà', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [apri] })
            .mockResolvedValueOnce({ text: 'Ecco il sito.\n\n```html\n<html><body><div class="hero">', finishReason: 'length' })
        const execute = vi.fn(async () => pronto)

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'crea il sito' }], { complete, execute })

        expect(execute).toHaveBeenCalledTimes(1)
        expect(complete).toHaveBeenCalledTimes(2)
        expect(outcome.chiamataTroncata).toBe(true)
        expect(outcome.text).not.toContain('<div class="hero">')
    })

    it('ART-L-08 senza blocco un sollecito; se ancora niente, nessun artefatto e il fatto si dice', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [apri] })
            .mockResolvedValueOnce({ text: 'Fatto, ecco il sito!' })
            .mockResolvedValueOnce({ text: 'Fatto!' })
        const execute = vi.fn(async () => pronto)

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'crea il sito' }], { complete, execute })

        expect(complete).toHaveBeenCalledTimes(3)
        const sollecito = (complete.mock.calls[2]![0] as ChatTurn[]).at(-1)!
        expect(sollecito.role).toBe('user')
        expect(sollecito.content).toMatch(/```html/)
        expect(execute).toHaveBeenCalledTimes(1)
        expect(outcome.azioneNonEseguita).toBe(true)
    })
})
