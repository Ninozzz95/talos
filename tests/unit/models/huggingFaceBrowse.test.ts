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
    sha: 'c'.repeat(40),
    downloads: 4907682,
    downloadsAllTime: 19407682,
    likes: 606,
    pipeline_tag: 'text-generation',
    tags: ['gguf', 'license:apache-2.0'],
    cardData: { license: 'apache-2.0' },
    // I numeri veri, come li restituisce il Hub con `expand[]=gguf`.
    gguf: {
        total: 8953803264,
        totalFileSize: 5400000000,
        context_length: 262144,
        architecture: 'qwen35',
        chat_template: 'present',
    },
    siblings: [
        { rfilename: 'Ornith-1.0-9B-Q4_0.gguf' },
        { rfilename: 'Ornith-1.0-9B-Q4_K_M.gguf' },
    ],
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
        expect(m!.hasChatTemplate).toBe(true)
        expect(m!.licence).toBe('apache-2.0')
        expect(m!.downloads).toBe(4907682)
        expect(m!.downloadsAllTime).toBe(19407682)
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

describe('i numeri veri invece della stima', () => {
    it('chiede gguf, sibling e revisione in una sola richiesta browse', async () => {
        /**
         * MISURATO contro l'API il 2026-08-04. Senza, una riga porta solo nome
         * e download, e per sapere quanto pesa serviva una richiesta per
         * repository: venti righe, venti richieste, e il limitatore che gli
         * anonimi condividono per operatore.
         */
        const { client: c, visti } = client({ '/api/models?': { body: [RIGA] } })
        await c.searchModels('')
        expect(visti[0]).toContain('expand%5B%5D=gguf')
        expect(visti[0]).toContain('expand%5B%5D=siblings')
        expect(visti[0]).toContain('expand%5B%5D=sha')
        expect(visti[0]).toContain('expand%5B%5D=cardData')
        expect(visti[0]).toContain('expand%5B%5D=downloadsAllTime')
    })

    it('separa i byte repository dalla variante mobile stimata', async () => {
        const { client: c } = client({ '/api/models?': { body: [RIGA] } })
        const [m] = await c.searchModels('')
        expect(m!.gguf?.parameters).toBe(8953803264)
        expect(m!.gguf?.repositoryFileBytes).toBe(5400000000)
        expect(m!.gguf?.contextLength).toBe(262144)
        expect(m!.revision).toBe('c'.repeat(40))
        expect(m!.siblings.map((row) => row.path)).toEqual([
            'Ornith-1.0-9B-Q4_0.gguf',
            'Ornith-1.0-9B-Q4_K_M.gguf',
        ])
        expect(m!.browseVariant).toMatchObject({
            quantisation: 'Q4_K_M',
            source: 'parameter-estimate',
            estimated: true,
        })
        expect(m!.browseVariant?.fileBytes).not.toBe(5400000000)
    })

    it('un `total` a zero NON diventa «un modello da zero parametri»', () => {
        // Significa che il Hub non è riuscito a leggere il file. Trattarlo come
        // un numero direbbe a chiunque che ci sta comodo.
        return (async () => {
            const { client: c } = client({ '/api/models?': { body: [{ ...RIGA, gguf: { total: 0, totalFileSize: 0 } }] } })
            const [m] = await c.searchModels('')
            expect(m!.gguf).toBeNull()
        })()
    })

    it('normalizza sibling malformati senza farli entrare nel contratto', async () => {
        const { client: c } = client({
            '/api/models?': {
                body: [{
                    ...RIGA,
                    siblings: [
                        null,
                        { rfilename: '' },
                        { rfilename: 'model-Q4_K_M.gguf', size: -1, lfs: { oid: 42 } },
                    ],
                }],
            },
        })

        const [m] = await c.searchModels('')
        expect(m!.siblings).toEqual([
            { path: 'model-Q4_K_M.gguf', sizeBytes: null, sha256: null },
        ])
        expect(m!.browseVariant?.source).toBe('parameter-estimate')
    })

    it('non tratta un nome di ramo come revisione immutabile', async () => {
        const { client: c } = client({
            '/api/models?': { body: [{ ...RIGA, sha: 'main' }] },
        })

        const [m] = await c.searchModels('')

        expect(m!.revision).toBeNull()
    })
})
