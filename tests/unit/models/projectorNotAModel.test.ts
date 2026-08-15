import { describe, expect, it, vi } from 'vitest'

/**
 * Un proiettore multimodale NON è un modello con cui si parla.
 *
 * ## Il difetto
 *
 * Owner 2026-08-06: nel selettore compariva **`mmproj-F16.gguf`**, e sceglierlo
 * dava «questo file non può essere aperto come modello GGUF compatibile». Non è
 * un modello: è il proiettore che accompagna un modello visivo, e da solo non
 * genera un token.
 *
 * MISURATO sul Pad, e peggio di come era stato segnalato: su un'app appena
 * avviata veniva scelto **da solo**, perché era il primo della lista dei file.
 * Chi apriva TALOS per la prima volta con quel file sul telefono trovava una
 * chat che non poteva rispondere e nessun indizio sul perché.
 *
 * ## Perché non si filtra il nome
 *
 * `«mmproj»` sarebbe una stringa scritta a mano: lascerebbe passare il prossimo
 * proiettore chiamato altrimenti, e nasconderebbe un modello vero che per caso
 * contenesse quella parola. Si chiede al FILE se dichiara degli strati — un
 * modello di linguaggio ce li ha, un proiettore no — e la lettura costa quanto
 * guardare la copertina, perché `gguf_init_from_file` con `no_alloc` non carica
 * nessun tensore.
 */

const installati = vi.hoisted(() => ({ models: [] as unknown[] }))

vi.mock('@/services/localEngine', () => ({
    talosLocalInstalledModels: vi.fn(async () => ({
        models: installati.models,
        unreadable: [],
    })),
    talosLocalEngineStatus: vi.fn(async () => ({ available: true, backends: 'CPU', loadedPath: null, shape: null })),
    talosLocalEngineOpen: vi.fn(),
    talosLocalEngineOpenWithFallback: vi.fn(),
    talosLocalEngineChatPlan: vi.fn(),
    talosLocalEngineGenerate: vi.fn(),
    talosLocalEngineCancel: vi.fn(),
    TalosLocalEngineOpenError: class extends Error {},
    TalosLocalEngineGenerationError: class extends Error {},
}))
vi.mock('@/services/deviceCapacity', () => ({ talosMeasureDevice: vi.fn(async () => null) }))

function file(name: string, conversational?: boolean) {
    return {
        path: `/models/unsloth/repo/rev/${name}`,
        bytes: 1_000,
        name,
        modifiedAt: 1,
        ...(conversational === undefined ? {} : { conversational }),
    }
}

describe('il catalogo della chat offre solo modelli con cui si parla', () => {
    it('⛔ non offre il proiettore', async () => {
        installati.models = [
            file('Qwen3-1.7B-Q8_0.gguf', true),
            file('mmproj-F16.gguf', false),
        ]
        const { localAdapter } = await import('@/lib/chat/providers/localAdapter')
        const catalogo = await localAdapter.listModels()
        expect(catalogo.models.map((m) => m.displayName)).toEqual(['Qwen3-1.7B-Q8_0'])
    })

    /**
     * ⛔ Nel dubbio si MOSTRA. Un lato nativo più vecchio — un'installazione
     * affiancata è un caso reale — non dichiara niente, e nascondere un modello
     * vero è un danno che chi lo usa non può riparare. Offrirne uno che non
     * parla, invece, lo dice aprendosi.
     */
    it('un file che non dichiara niente resta offerto', async () => {
        installati.models = [file('Qwen3-1.7B-Q8_0.gguf'), file('Llama-3.2-3B.gguf')]
        const { localAdapter } = await import('@/lib/chat/providers/localAdapter')
        const catalogo = await localAdapter.listModels()
        expect(catalogo.models).toHaveLength(2)
    })

    it('e se sono TUTTI proiettori, il catalogo è vuoto invece che sbagliato', async () => {
        installati.models = [file('mmproj-F16.gguf', false)]
        const { localAdapter } = await import('@/lib/chat/providers/localAdapter')
        const catalogo = await localAdapter.listModels()
        expect(catalogo.models).toEqual([])
    })
})
