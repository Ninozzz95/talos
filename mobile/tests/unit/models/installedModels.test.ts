import { describe, expect, it } from 'vitest'
import {
    talosInstalledModelsView,
    talosModelFolder,
    talosModelSize,
    TALOS_INSTALLED_MODEL_SORT_DEFAULT,
} from '@/lib/models/installedModels'
import type { TalosLocalModelFile } from '@/services/localEngine'

/**
 * Owner 2026-08-03, minutes after a download finished: «ho appena scaricato un
 * modello ma non ho idea di dove sia … NON VA BENE». The app knew all along —
 * `talosLocalInstalledModels()` has existed and the research runner already
 * reads it — and it showed nobody.
 */
const ROOT = '/storage/emulated/0/Android/data/ai.talos/files/models/'

function model(name: string, bytes: number, modifiedAt: number): TalosLocalModelFile {
    return { path: `${ROOT}${name}`, name, bytes, modifiedAt }
}

const QWEN = model('Qwen3.5-4B-Q4_K_M.gguf', 2_600_000_000, 1_785_700_000_000)
const PHI = model('Phi-4-mini-instruct.Q4_K_S.gguf', 2_300_000_000, 1_785_500_000_000)
const GEMMA = model('gemma-3-4b-it-Q4_K_M.gguf', 3_100_000_000, 1_785_600_000_000)
const ALL = [PHI, QWEN, GEMMA]

describe('the models already on this phone', () => {
    it('answers «which one did I just download» by default', () => {
        // Newest first, because that is the question asked right after a
        // download — and the only one the old panel could not answer at all.
        expect(TALOS_INSTALLED_MODEL_SORT_DEFAULT).toBe('recent')
        expect(talosInstalledModelsView(ALL).models.map((m) => m.name))
            .toEqual([QWEN.name, GEMMA.name, PHI.name])
    })

    it('orders by name and by size when asked', () => {
        // Alphabetical the way a reader means it, not the way ASCII does:
        // `localeCompare` files `gemma` with the g's instead of after every
        // capital letter. A list that hid lowercase names at the bottom would
        // look broken to everyone except a programmer.
        expect(talosInstalledModelsView(ALL, { sort: 'name' }).models.map((m) => m.name))
            .toEqual([GEMMA.name, PHI.name, QWEN.name])
        // Biggest first: on a phone the interesting end of the size axis is the
        // one that fills the disk.
        expect(talosInstalledModelsView(ALL, { sort: 'size' }).models.map((m) => m.name))
            .toEqual([GEMMA.name, QWEN.name, PHI.name])
    })

    it('puts a file whose date the system refused LAST, never first', () => {
        // `lastModified()` answers 0 instead of throwing. Sorting that as
        // "newest" would put the least-known file at the top of a list whose
        // whole job is to say which one is new.
        const dateless = model('mistero.gguf', 1_000_000_000, 0)
        const order = talosInstalledModelsView([dateless, ...ALL]).models.map((m) => m.name)
        expect(order[order.length - 1]).toBe('mistero.gguf')
    })

    it('searches the NAME, not the path every model shares', () => {
        // Every file lives under .../ai.talos/files/models/, so matching the
        // whole path makes any query of a few letters match everything.
        expect(talosInstalledModelsView(ALL, { query: 'talos' }).models).toHaveLength(0)
        expect(talosInstalledModelsView(ALL, { query: 'qwen' }).models.map((m) => m.name))
            .toEqual([QWEN.name])
        expect(talosInstalledModelsView(ALL, { query: '  Q4_K_M  ' }).models).toHaveLength(2)
    })

    it('keeps the total, so «nessun risultato» never reads as «nessun modello»', () => {
        const view = talosInstalledModelsView(ALL, { query: 'llama' })
        expect(view.models).toHaveLength(0)
        expect(view.total).toBe(3)
    })

    it('does not reorder the caller’s array', () => {
        const original = [...ALL]
        talosInstalledModelsView(ALL, { sort: 'size' })
        expect(ALL).toEqual(original)
    })
})

describe('where a model sits, in the part that differs', () => {
    /**
     * The row printed the whole address in monospace: three wrapped lines per
     * model of which the first fifty characters are the same for all of them.
     * The exact string still exists under ⋮ «Copia il percorso» — which is the
     * only form of it anybody can actually use.
     */
    it('answers with the folder under models/, not the shared prefix', () => {
        expect(talosModelFolder(`${ROOT}imported/prova.gguf`)).toBe('imported')
    })

    it('names the publisher rather than the revision folder under it', () => {
        // The real layout, read off the tablet on 2026-08-03:
        // models/<publisher>/<repo>/<revision>/file.gguf — `safe(repo)` keeps
        // the slash, so the folder directly under `models` is the publisher.
        // The two segments below it are the repo, which repeats the file name,
        // and the revision, which is almost always `main`.
        expect(talosModelFolder(`${ROOT}unsloth/SmolLM2-360M-Instruct-GGUF/main/SmolLM2-360M-Instruct-Q5_K_M.gguf`))
            .toBe('unsloth')
    })

    it('reads a model dropped in a folder of its own the same way', () => {
        expect(talosModelFolder(`${ROOT}local-test/qwen2.5-3b-instruct.gguf`)).toBe('local-test')
    })

    it('says nothing at all for a file lying in the root', () => {
        // Better an absent line than a folder name invented to fill it.
        expect(talosModelFolder(`${ROOT}model.gguf`)).toBe('')
    })

    it('falls back to the parent when the layout is not the one we wrote', () => {
        expect(talosModelFolder('/sdcard/Download/model.gguf')).toBe('Download')
        expect(talosModelFolder('model.gguf')).toBe('')
    })
})

describe('the size of a model, as a person says it', () => {
    it('speaks in gigabytes, with the decimal the locale uses', () => {
        expect(talosModelSize(2_600_000_000, 'it')).toBe('2,6 GB')
        expect(talosModelSize(2_600_000_000, 'en')).toBe('2.6 GB')
    })

    it('drops the decimal once it stops being informative', () => {
        expect(talosModelSize(450_000_000, 'en')).toBe('450 MB')
        expect(talosModelSize(120_000_000_000, 'en')).toBe('120 GB')
    })

    it('says nothing rather than «0 B» for a size it does not have', () => {
        expect(talosModelSize(0, 'it')).toBe('—')
        expect(talosModelSize(Number.NaN, 'it')).toBe('—')
    })
})
