import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⛔⛔ DICIOTTO LETTURE PER DICIOTTO VERSIONI DELLO STESSO MODELLO.
 *
 * Owner 2026-08-11: «DeepSeek ci sta un casino di tempo», e poi il chiarimento
 * decisivo — «era quando è stato attivato il tool ricerca modelli da hf». Non
 * era il modello che rispondeva piano.
 *
 * MISURATO quel giorno, su repository veri:
 *
 * | repository                              | versioni GGUF |
 * |-----------------------------------------|---------------|
 * | bartowski/Llama-3.2-3B-Instruct-GGUF    | 18            |
 * | unsloth/Qwen3-4B-GGUF                   | 26            |
 * | unsloth/gemma-3-4b-it-GGUF              | 29            |
 *
 * `local_model_inspect` leggeva l'intestazione di OGNUNA, in fila. Una prima
 * lettura da 1 MiB costa 1.630 ms da rete fissa, e l'intestazione vera di quel
 * Llama pesa **7,48 MiB** ⇒ due richieste per versione, ~153 MB per un
 * repository, uno alla volta, prima che TALOS potesse dire una parola.
 *
 * E diciassette di quelle letture erano la stessa risposta: misurato su IQ3_M,
 * Q4_0 e Q8_0 dello stesso modello, blocchi (28), embedding (3072), teste
 * (24/8), contesto (131072), numero di tensori (255) e **inizio dei pesi**
 * (7.837.984) sono identici. Cambia solo la qualità, che sta nel nome del file.
 */

const bridge = vi.hoisted(() => ({
    measure: vi.fn(async () => ({
        totalRamBytes: 12_000_000_000,
        availableRamBytes: 9_000_000_000,
        lowMemoryThresholdBytes: 300_000_000,
        freeStorageBytes: 200_000_000_000,
        abiSupported: true,
        thermal: 'none' as const,
        memoryBandwidthBytesPerSecond: 60_000_000_000,
        deviceModel: 'OnePlus Pad 3',
        androidSdk: 36,
    })),
    hubTransport: vi.fn(() => (async () => new Response('no', { status: 404 })) as typeof fetch),
    getKey: vi.fn(async () => null),
}))

vi.mock('@/services/deviceCapacity', () => ({ talosMeasureDevice: bridge.measure }))
vi.mock('@/services/hubTransport', () => ({ talosCreateHubTransport: bridge.hubTransport }))
vi.mock('@/services/secureKeyStore', () => ({
    getProviderKey: bridge.getKey,
    setProviderKey: vi.fn(async () => undefined),
    clearProviderKey: vi.fn(async () => undefined),
}))

/** Un'intestazione GGUF con byte veri: un parser nutrito a finzioni non prova niente. */
function ggufBytes(): ArrayBuffer {
    const parts: number[] = []
    const push32 = (value: number) => {
        for (let shift = 0; shift < 32; shift += 8) parts.push((value >>> shift) & 0xff)
    }
    const push64 = (value: number) => { push32(value); push32(0) }
    const pushText = (value: string) => {
        const encoded = new TextEncoder().encode(value)
        push64(encoded.length)
        for (const byte of encoded) parts.push(byte)
    }
    for (const byte of new TextEncoder().encode('GGUF')) parts.push(byte)
    push32(3)
    push64(1)
    push64(7)
    pushText('general.architecture'); push32(8); pushText('llama')
    pushText('general.file_type'); push32(4); push32(15)
    pushText('llama.block_count'); push32(4); push32(28)
    pushText('llama.context_length'); push32(4); push32(131_072)
    pushText('llama.embedding_length'); push32(4); push32(3072)
    pushText('llama.attention.head_count'); push32(4); push32(24)
    pushText('llama.attention.head_count_kv'); push32(4); push32(8)
    pushText('token_embd.weight'); push32(2); push64(3072); push64(128_256); push32(12); push64(0)
    return new Uint8Array(parts).buffer
}

/**
 * Un repository come quelli veri: DUE modelli, tre qualità ciascuno.
 *
 * ⛔ Due e non uno di proposito. Certi pubblicatori tengono più modelli nello
 * stesso posto, e una cura che leggesse una intestazione «per repository»
 * darebbe la forma del 3B all'8B — cioè risponderebbe «ci sta» su un modello
 * che non ci sta.
 */
const FILE = [
    'Llama-3.2-3B-Instruct-IQ3_M.gguf',
    'Llama-3.2-3B-Instruct-Q4_0.gguf',
    'Llama-3.2-3B-Instruct-Q8_0.gguf',
    'Llama-3.2-8B-Instruct-IQ3_M.gguf',
    'Llama-3.2-8B-Instruct-Q4_0.gguf',
    'Llama-3.2-8B-Instruct-Q8_0.gguf',
]
const BYTE: Record<string, number> = {
    'Llama-3.2-3B-Instruct-IQ3_M.gguf': 1_600_000_000,
    'Llama-3.2-3B-Instruct-Q4_0.gguf': 2_000_000_000,
    'Llama-3.2-3B-Instruct-Q8_0.gguf': 3_400_000_000,
    'Llama-3.2-8B-Instruct-IQ3_M.gguf': 3_800_000_000,
    'Llama-3.2-8B-Instruct-Q4_0.gguf': 4_700_000_000,
    'Llama-3.2-8B-Instruct-Q8_0.gguf': 8_500_000_000,
}

let letture: string[] = []

function transport(): typeof globalThis.fetch {
    return (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/tree/')) {
            return json(FILE.map((path) => ({ type: 'file', path })))
        }
        if (url.includes('/paths-info/')) {
            return json(FILE.map((path) => ({ path, lfs: { oid: 'a'.repeat(64), size: BYTE[path]! } })))
        }
        if (url.includes('/resolve/')) {
            // ⭐ È QUI che si conta: una richiesta di intestazione per file.
            letture.push(decodeURIComponent(url.split('/resolve/')[1] ?? '').split('/').pop() ?? '?')
            return new Response(null, {
                status: 302,
                headers: { location: 'https://us.aws.cdn.hf.co/xet/abc?Expires=9999999999' },
            })
        }
        if (url.includes('us.aws.cdn.hf.co')) return new Response(ggufBytes())
        return new Response('no route', { status: 404 })
    }) as typeof globalThis.fetch
}

function json(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    })
}

async function repoAperto() {
    const store = await import('@/stores/localModels')
    store.talosInitLocalModels(transport())
    await store.talosRefreshDeviceCapacity()
    await store.talosOpenModelRepo('bartowski/Llama-3.2-GGUF')
    return store
}

beforeEach(() => {
    vi.resetModules()
    letture = []
    bridge.measure.mockClear()
})

describe('⛔ una lettura per MODELLO, non per versione', () => {
    it('sei versioni di due modelli costano DUE letture, non sei', async () => {
        const store = await repoAperto()
        await store.talosExamineRepo()

        // ⛔ È questa la riga che morde: rimettendo il ciclo che leggeva ogni
        // set, qui ne arrivano sei e il test diventa rosso.
        expect(letture).toHaveLength(2)
        // E i due capofila sono uno per modello — la più piccola di ciascuno,
        // perché i set arrivano ordinati dal più leggero.
        expect(letture.some((f) => f.includes('3B'))).toBe(true)
        expect(letture.some((f) => f.includes('8B'))).toBe(true)
    })

    it('⭐ e TUTTE e sei restano esaminate: si risparmia la rete, non la risposta', async () => {
        const store = await repoAperto()
        await store.talosExamineRepo()

        const sets = store.talosLocalModels.repo!.sets
        expect(sets).toHaveLength(6)
        for (const set of sets) {
            expect(set.examination.state, set.label).toBe('read')
        }
    })

    it('⛔ il verdetto NON si copia: si ricalcola con la dimensione di QUESTA versione', async () => {
        /*
         * Copiarlo direbbe che un Q8 da 8,5 GB entra in memoria come un IQ3 da
         * 1,6 — la bugia esatta che questo tool esiste per non dire. Il peso
         * dei pesi si ricava per differenza dalla dimensione del file, ed è
         * esatto perché l'inizio dei pesi coincide byte per byte fra le
         * qualità (misurato: 7.837.984 su tutte e tre).
         */
        const store = await repoAperto()
        await store.talosExamineRepo()

        const sets = store.talosLocalModels.repo!.sets
        const velocita = sets.map((set) => {
            const esame = set.examination
            return esame.state === 'read' ? esame.fit.tokensPerSecond : null
        })
        /*
         * ⛔ Si guarda la VELOCITÀ, non `requiredBytes`: quello è la memoria
         * OLTRE i pesi — cache, calcolo, motore — e per costruzione è identica
         * fra due qualità dello stesso modello. Cercarla lì era mio, e il test
         * me l'ha detto: «expected 872415232 to be greater than 872415232».
         * I byte dei pesi si vedono dove pesano davvero, cioè in quanti ne
         * deve leggere il chip a ogni token.
         *
         * Ordinati dal più leggero: più pesi, meno token al secondo.
         */
        for (let i = 1; i < velocita.length; i += 1) {
            const prima = velocita[i - 1]
            const dopo = velocita[i]
            if (prima === null || dopo === null) continue
            expect(dopo, `${sets[i]!.label} contro ${sets[i - 1]!.label}`).toBeLessThan(prima)
        }
        // ⛔ E la clausola che impedisce al caso sopra di passare a vuoto: se
        // le velocità fossero tutte `null` il ciclo non proverebbe niente.
        expect(velocita.filter((v) => v !== null).length).toBeGreaterThanOrEqual(4)
    })

    it('e la qualità resta quella del FILE, non quella del capofila', async () => {
        const store = await repoAperto()
        await store.talosExamineRepo()

        const quality = store.talosLocalModels.repo!.sets.map((set) => {
            const esame = set.examination
            return esame.state === 'read' ? esame.quantisation : null
        })
        // ⛔ Se l'ereditarietà riportasse la qualità letta, sarebbero tutte
        // uguali — e la persona sceglierebbe fra sei righe identiche.
        expect(new Set(quality).size).toBeGreaterThan(1)
    })
})
