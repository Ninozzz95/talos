import { describe, expect, it, vi } from 'vitest'
import { createTalosVisualArtifactTools } from '@/lib/tools/artifactTools'
import { executeTalosTool, type TalosToolExecutionDeps } from '@/lib/tools/executor'
import { talosToolsForLocalEngine, talosToolsForOpenAi } from '@/lib/tools/registry'

/**
 * ⛔⛔ ART-L — `artifact_create` per i modelli LOCALI (owner 2026-10-23: «Sì, solo per i locali»).
 *
 * Il locale riceve `{ title, kind }`, e l'HTML arriva dopo come blocco ```html nella risposta (`bloccoHtml.ts`). OpenAI,
 * Anthropic e Gemini restano come oggi: `{ title, html }`, per non rompere flussi che funzionano. Forma vista dal Desktop
 * prima di scriverla; in r4 resterà identica. Ledger: `LEDGER-ATTREZZI-LOCALI-NO-CHAT-TEMPLATE-2026-10-23.md`, passo A.
 */

type Schema = { properties?: Record<string, unknown>, required?: string[] }
const parametriDi = (annunci: unknown[]) => (annunci[0] as { function: { parameters: Schema, description: string } }).function

function deps(patch: Partial<TalosToolExecutionDeps> = {}): TalosToolExecutionDeps {
    return {
        permissions: { read: 'allow', write: 'allow', outbound: 'allow' },
        isToolEnabled: () => true,
        requestConsent: vi.fn(async () => true),
        audit: vi.fn(async () => {}),
        context: { sessionId: 's1' },
        ...patch,
    }
}

describe('ART-L artifact_create per il motore locale', () => {
    it('ART-L-01 al motore locale si annuncia { title, kind } senza html, e la descrizione chiede il blocco', () => {
        const [tool] = createTalosVisualArtifactTools({ create: vi.fn() })
        const locale = parametriDi(talosToolsForLocalEngine([tool!]))
        expect(Object.keys(locale.parameters.properties ?? {}).sort()).toEqual(['kind', 'title'])
        expect(locale.parameters.required).toContain('title')
        expect(locale.description).toMatch(/```html/)
    })

    it('ART-L-02 le API restano come oggi: title e html obbligatori', () => {
        const [tool] = createTalosVisualArtifactTools({ create: vi.fn() })
        const api = parametriDi(talosToolsForOpenAi([tool!]))
        expect(api.parameters.required?.sort()).toEqual(['html', 'title'])
        expect(Object.keys(api.parameters.properties ?? {})).not.toContain('kind')
    })

    it('ART-L-03 dal motore locale { title, kind } passa, non crea niente e chiede il blocco', async () => {
        const create = vi.fn(async () => ({ id: 'a1' }))
        const [tool] = createTalosVisualArtifactTools({ create })
        const esito = await executeTalosTool(tool!, '{"title":"Casa Barnes","kind":"html"}', deps({ motoreLocale: true }))
        expect(esito.ok).toBe(true)
        expect(create).not.toHaveBeenCalled()
        expect(esito.content).toMatch(/Ready for "Casa Barnes"/)
        expect(esito.content).toMatch(/```html/)
        expect((esito as { attesaBlocco?: unknown }).attesaBlocco).toEqual({ titolo: 'Casa Barnes', tipo: 'html' })
        // ⛔ ART-L-10 (Pad, vc151): il passo «Ready» non ha creato niente; senza questo la vista diceva «Fatto».
        expect((esito as { senzaEffetto?: boolean }).senzaEffetto).toBe(true)
    })

    it('ART-L-04 da un fornitore API la stessa chiamata senza html è rifiutata come prima', async () => {
        const create = vi.fn(async () => ({ id: 'a1' }))
        const [tool] = createTalosVisualArtifactTools({ create })
        const esito = await executeTalosTool(tool!, '{"title":"Casa Barnes","kind":"html"}', deps())
        expect(esito.ok).toBe(false)
        expect(create).not.toHaveBeenCalled()
    })

    it('ART-L-05 col corpo html la creazione è quella di sempre, da qualunque motore', async () => {
        const create = vi.fn(async () => ({ id: 'a1' }))
        const [tool] = createTalosVisualArtifactTools({ create })
        const esito = await executeTalosTool(tool!, '{"title":"Casa","html":"<p>x</p>"}', deps({ motoreLocale: true }))
        expect(esito.ok).toBe(true)
        expect(create).toHaveBeenCalledWith('Casa', '<p>x</p>')
    })
})
