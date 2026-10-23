import { describe, expect, it } from 'vitest'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import { leggiModelliDelPc } from '@/lib/remoto/modelliDelPc'

/**
 * ⛔ R-M4c, Q1 (owner 20/10/2026 «Quelli del PC», dossier `.claude/ricerche/2026-10-20-remoto-modello-e-cartella-10x4.md`): quando il
 * telefono usa una sessione del PC, il selettore mostra i modelli che il PC sa usare — come Hermes (`slash_commands_model.py:454-492`,
 * solo fornitori con credenziali) e come il selettore del PC (`app.js:7872-7905`): fornitori, poi i modelli di ognuno.
 * Forme di r4 `2297237fd` (`operazioni.mjs` `provider.models`, `local-models.list`; `models.list` per OpenRouter).
 */
type Risposte = Record<string, unknown | ((percorso: string) => unknown)>
function ponte(risposte: Risposte) {
    const chieste: string[] = []
    const p = {
        richiesta: async ({ metodo, percorso }: { metodo: string, percorso: string }) => {
            chieste.push(`${metodo} ${percorso}`)
            const r = risposte[percorso]
            if (r === undefined) return { stato: 403, corpo: JSON.stringify({ ok: false, error: { code: 'NOT_AVAILABLE_REMOTELY', message: 'x' } }) }
            if (r instanceof Error) return { stato: 400, corpo: JSON.stringify({ ok: false, error: { code: (r as Error & { code?: string }).code ?? 'X', message: r.message } }) }
            return { stato: 200, corpo: JSON.stringify({ ok: true, data: r }) }
        },
    } as unknown as TalosR4ClientePonte
    return { p, chieste }
}
const fornitore = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: id.toUpperCase(), requiresKey: true, keyConfigured: false, ...extra })
const errore = (code: string) => Object.assign(new Error(code), { code })

describe('i modelli del PC per il selettore del telefono', () => {
    it('MDP-01 solo i fornitori che il PC sa usare (chiave collegata, o nessuna chiave chiesta); mai «esterno»; id = modello di r4', async () => {
        const { p, chieste } = ponte({
            '/api/v1/providers': { items: [fornitore('anthropic', { keyConfigured: true }), fornitore('openai'), fornitore('lmstudio', { requiresKey: false }), fornitore('esterno', { requiresKey: false }),
                // un fornitore che non dice se ha la chiave NON è usabile (fail-closed)
                { id: 'gemini', label: 'Gemini', requiresKey: true }] },
            '/api/v1/providers/anthropic/models': { provider: 'anthropic', modelli: [{ id: 'anthropic:claude-x', nome: 'Claude X', provider: 'anthropic' }] },
            '/api/v1/providers/lmstudio/models': { provider: 'lmstudio', modelli: [{ id: 'lmstudio:finto', name: 'Finto', provider: 'lmstudio' }] },
        })
        const { profili } = await leggiModelliDelPc(p)
        expect(profili.map((x) => [x.id, x.model, x.display_name, x.provider])).toEqual([
            ['pc:anthropic:claude-x', 'anthropic:claude-x', 'Claude X', 'anthropic'],
            ['pc:lmstudio:finto', 'lmstudio:finto', 'Finto', 'lmstudio'],
        ])
        expect(chieste).not.toContain('GET /api/v1/providers/openai/models')
        expect(chieste).not.toContain('GET /api/v1/providers/gemini/models')
        expect(chieste.some((c) => c.includes('/providers/esterno'))).toBe(false)
    })

    it('MDP-02 OpenRouter dal catalogo del PC (models.list) solo se il PC ha la sua chiave; gli id restano «vendor/modello»', async () => {
        const catalogo = { modelli: [{ id: 'z-ai/glm-4.7', nome: 'GLM 4.7', provider: 'z-ai' }] }
        const senza = ponte({ '/api/v1/providers': { items: [fornitore('openrouter')] }, '/api/v1/models': catalogo })
        expect((await leggiModelliDelPc(senza.p)).profili).toEqual([])
        expect(senza.chieste).not.toContain('GET /api/v1/models')
        const con = ponte({ '/api/v1/providers': { items: [fornitore('openrouter', { keyConfigured: true })] }, '/api/v1/models': catalogo })
        const { profili } = await leggiModelliDelPc(con.p)
        expect(profili.map((x) => [x.id, x.model, x.provider])).toEqual([['pc:z-ai/glm-4.7', 'z-ai/glm-4.7', 'openrouter']])
        expect(con.chieste).not.toContain('GET /api/v1/providers/openrouter/models')
    })

    it('MDP-03 il piano ChatGPT del PC e i modelli locali del PC; un piano non collegato (errore) non è un guasto', async () => {
        const { p } = ponte({
            '/api/v1/providers': { items: [] },
            '/api/v1/providers/chatgpt/models': { provider: 'chatgpt', modelli: [{ id: 'chatgpt:gpt-5', nome: 'GPT-5', provider: 'chatgpt' }] },
            '/api/v1/local-models': { items: [{ id: 'gemma', nome: 'Gemma', modello: 'local:gemma' }] },
        })
        // ⛔ i modelli locali del PC NON sono «local»: nel selettore «local» si legge «Sul dispositivo» (il telefono). Gruppo «computer».
        expect((await leggiModelliDelPc(p)).profili.map((x) => [x.id, x.provider])).toEqual([['pc:chatgpt:gpt-5', 'chatgpt'], ['pc:local:gemma', 'computer']])
        const { p: q } = ponte({ '/api/v1/providers': { items: [] }, '/api/v1/providers/chatgpt/models': errore('CHATGPT_NON_COLLEGATO') })
        const esito = await leggiModelliDelPc(q)
        expect(esito.profili).toEqual([])
    })

    it('MDP-04 i livelli di ragionamento dal catalogo del PC («none» è il nostro «off»); un fornitore che non risponde non ferma gli altri', async () => {
        const { p } = ponte({
            '/api/v1/providers': { items: [fornitore('anthropic', { keyConfigured: true }), fornitore('lmstudio', { requiresKey: false })] },
            '/api/v1/providers/anthropic/models': { provider: 'anthropic', modelli: [{ id: 'anthropic:c', nome: 'C', reasoning: { supportedEfforts: ['none', 'low', 'high'] } }, { nome: 'senza id' }] },
            '/api/v1/providers/lmstudio/models': errore('RUNTIME_UNREACHABLE'),
        })
        const { profili } = await leggiModelliDelPc(p)
        expect(profili).toHaveLength(1)
        expect(profili[0].effort_levels).toEqual(['off', 'low', 'high'])
        expect(profili[0].supports_thinking).toBe(true)
    })

    it('MDP-05 nessun modello usabile sul PC ⇒ lo si dice (il selettore non resta muto); l\'elenco dei fornitori illeggibile ⇒ idem', async () => {
        const vuoto = ponte({ '/api/v1/providers': { items: [fornitore('openai')] } })
        expect((await leggiModelliDelPc(vuoto.p)).problemi).toHaveLength(1)
        const rotto = ponte({ '/api/v1/providers': errore('DISCONNECTED') })
        const esito = await leggiModelliDelPc(rotto.p)
        expect(esito.profili).toEqual([])
        expect(esito.problemi).toHaveLength(1)
    })

    /**
     * ⛔ D-RM5-1 (dal Pad, 21/10/2026, 4178 a 0f9efae69): LM Studio c'era (nessuna chiave chiesta) ma `providers/lmstudio/models` dava
     * 500; il selettore diceva «Sul computer non c'è un fornitore collegato», falso. Un fornitore usabile che non si legge, o l'elenco
     * stesso illeggibile, è «non riesco a leggere i modelli del computer»; «nessun fornitore» resta solo quando non ce n'è nessuno.
     */
    it('MDP-06 fornitori ci sono ma i modelli non si leggono ⇒ la frase lo dice, non «nessun fornitore»', async () => {
        const frasi = { nessunFornitore: 'NESSUNO', modelliIlleggibili: 'ILLEGGIBILI' }
        const guasto = ponte({
            '/api/v1/providers': { items: [fornitore('lmstudio', { requiresKey: false })] },
            '/api/v1/providers/lmstudio/models': errore('INTERNAL_ERROR'),
        })
        expect((await leggiModelliDelPc(guasto.p, frasi)).problemi).toEqual([{ message: 'ILLEGGIBILI' }])
        const rotto = ponte({ '/api/v1/providers': errore('DISCONNECTED') })
        expect((await leggiModelliDelPc(rotto.p, frasi)).problemi).toEqual([{ message: 'ILLEGGIBILI' }])
        const vuoto = ponte({ '/api/v1/providers': { items: [fornitore('openai')] } })
        expect((await leggiModelliDelPc(vuoto.p, frasi)).problemi).toEqual([{ message: 'NESSUNO' }])
    })
})
