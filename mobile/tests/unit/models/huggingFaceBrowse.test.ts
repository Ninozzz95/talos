import { describe, expect, it, vi } from 'vitest'
import { talosCreateHuggingFaceClient } from '@/lib/models/huggingFace'

/**
 * Owner 2026-08-04: «voglio una lista già caricata con un loading, con i filtri,
 * poi quando entri nel modello voglio la descrizione».
 *
 * Prima la scoperta partiva da un campo vuoto da riempire. Il Hub però una lista
 * ce l'ha già: MISURATO contro l'API vera, omettendo `search` risponde con i
 * modelli GGUF ordinati per download.
 */
function client(risposte: Record<string, { ok?: boolean, body: unknown }>) {
    const visti: string[] = []
    const fetch = vi.fn(async (url: string) => {
        visti.push(url)
        const chiave = Object.keys(risposte).find((k) => url.includes(k)) ?? ''
        const r = risposte[chiave] ?? { body: [] }
        return {
            ok: r.ok ?? true,
            status: r.ok === false ? 404 : 200,
            json: async () => r.body,
            text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
        } as unknown as Response
    })
    return { client: talosCreateHuggingFaceClient({ fetch: fetch as never }), visti }
}

const RIGA = {
    id: 'deepreinforce-ai/Ornith-1.0-9B-GGUF',
    downloads: 4907682,
    likes: 606,
    pipeline_tag: 'text-generation',
    tags: ['gguf', 'license:apache-2.0'],
}

describe('sfogliare invece di cercare', () => {
    it('senza testo NON manda `search`: chiede la lista, non la stringa vuota', async () => {
        const { client: c, visti } = client({ '/api/models?': { body: [RIGA] } })
        await c.searchModels('')
        expect(visti[0]).not.toContain('search=')
        expect(visti[0]).toContain('filter=gguf')
        expect(visti[0]).toContain('sort=downloads')
    })

    it('con del testo torna a cercare, come prima', async () => {
        const { client: c, visti } = client({ '/api/models?': { body: [RIGA] } })
        await c.searchModels('  qwen  ')
        // E lo manda potato: uno spazio in coda è un carattere che nessuno voleva.
        expect(visti[0]).toContain('search=qwen')
    })

    it('porta a casa compito e etichette, che sono i filtri', async () => {
        const { client: c } = client({ '/api/models?': { body: [RIGA] } })
        const [m] = await c.searchModels('')
        expect(m!.task).toBe('text-generation')
        expect(m!.tags).toContain('license:apache-2.0')
    })
})

describe('la scheda del modello', () => {
    it('mette insieme i metadati e il README, che stanno in due posti', async () => {
        // `/api/models` porta `cardData` ma NON il testo: il README si scarica
        // dal ramo. Misurato 2026-08-04.
        const { client: c } = client({
            '/api/models/': { body: { author: 'qwen', cardData: { license: 'apache-2.0' }, lastModified: '2026-07-01' } },
            'README.md': { body: '# Ornith\nModello da 9 miliardi.' },
        })
        const scheda = await c.describeModel('qwen/x')
        expect(scheda.author).toBe('qwen')
        expect(scheda.license).toBe('apache-2.0')
        expect(scheda.readme).toContain('9 miliardi')
    })

    it('un README che manca non è un guasto', async () => {
        // Certi repo non ne hanno: la scheda esiste lo stesso.
        const { client: c } = client({
            '/api/models/': { body: { author: 'tizio' } },
            'README.md': { ok: false, body: '' },
        })
        const scheda = await c.describeModel('tizio/x')
        expect(scheda.readme).toBe('')
        expect(scheda.author).toBe('tizio')
    })
})
