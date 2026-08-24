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

    /**
     * P2-6 — il conteggio parametri è l'ECCEZIONE alla regola sopra: a
     * differenza della qualità, il numero di parametri è ARCHITETTURALE — un
     * Q8 e un IQ3 dello stesso modello hanno esattamente gli stessi
     * parametri, cambiano solo i bit per parametro. Ereditarlo è corretto,
     * non un bug gemello di quello che il test precedente esiste per stanare.
     */
    it('⭐ il conteggio parametri SI eredita: è la forma, non la qualità', async () => {
        const store = await repoAperto()
        await store.talosExamineRepo()

        const conteggi = store.talosLocalModels.repo!.sets.map((set) => {
            const esame = set.examination
            return esame.state === 'read' ? esame.parameterCount : null
        })
        // Tutte e tre le qualità del 3B hanno gli stessi parametri (e le tre
        // dell'8B pure), quindi al massimo due valori distinti in tutto —
        // uno per modello, mai uno per file come per `quantisation`.
        expect(new Set(conteggi).size).toBeLessThanOrEqual(2)
        expect(conteggi.every((c) => c !== null)).toBe(true)
    })

    /**
     * ⛔ AL CONTRARIO del conteggio parametri: l'istogramma tipo-tensore e la
     * versione di quantizzazione SONO la qualità, esattamente come
     * `quantisation` — riportare quelli letti dal capofila per una versione
     * ereditata sarebbe la stessa bugia che il test sopra vieta per
     * `quantisation`, solo in un campo diverso.
     */
    it('⛔ istogramma e versione di quantizzazione NON si ereditano: null sulle versioni ereditate', async () => {
        const store = await repoAperto()
        await store.talosExamineRepo()

        const sets = store.talosLocalModels.repo!.sets
        // I due capofila sono le versioni più leggere di ciascun modello —
        // stesso ordine già affermato dal primo test di questo describe.
        const capofila = sets.filter((set) => set.label.includes('IQ3_M'))
        const ereditate = sets.filter((set) => !set.label.includes('IQ3_M'))
        expect(capofila).toHaveLength(2)
        expect(ereditate).toHaveLength(4)

        for (const set of capofila) {
            const esame = set.examination
            if (esame.state !== 'read') throw new Error(`${set.label} non letto`)
            expect(esame.tensorTypeHistogram, set.label).not.toBeNull()
            expect(esame.quantizationVersion, set.label).not.toBeUndefined()
        }
        for (const set of ereditate) {
            const esame = set.examination
            if (esame.state !== 'read') throw new Error(`${set.label} non letto`)
            expect(esame.tensorTypeHistogram, set.label).toBeNull()
            expect(esame.quantizationVersion, set.label).toBeNull()
        }
    })
})

describe('⛔ Model Lab Blocco 2 — la cache KV forzata raggiunge OGNI verdetto, capofila e ereditato', () => {
    /**
     * `talosSetLocalKvCacheType()` tocca due punti diversi dentro lo store:
     * la lettura del capofila (`talosExamineSet`, chiamata da
     * `talosExamineRepo` una volta per modello) e l'eredità (`talosEredita`,
     * per ogni versione che non tocca la rete). Un test che guardasse solo
     * il capofila non proverebbe niente sul secondo punto — la stessa
     * svista che il describe sopra esiste per stanare sui campi ereditati
     * (P2-6): qui la riga che morde è la versione ereditata, non la prima.
     *
     * `gguf.ts` mette sempre `kvBytesPerElement: 2` (f16) quando legge un
     * header vero — nessun campo GGUF dichiara il tipo della cache KV, è
     * una scelta a tempo di inferenza, non del file. Quindi 'auto' su
     * questo fixture equivale sempre a f16, ed è per questo che il
     * rapporto atteso forzando q8_0 è esattamente 17/32 (= (34/32) / 2),
     * mai "un po' meno".
     */
    it('forzare q8_0 restringe la cache KV di tutte le sei versioni rispetto ad auto, capofila E ereditate', async () => {
        const auto = await repoAperto()
        await auto.talosExamineRepo()
        const baseline = auto.talosLocalModels.repo!.sets.map((set) => {
            const esame = set.examination
            if (esame.state !== 'read') throw new Error(`${set.label} non letto`)
            return esame.fit.kvCacheBytes
        })

        vi.resetModules()
        letture = []
        const forzato = await repoAperto()
        forzato.talosSetLocalKvCacheType('q8_0')
        await forzato.talosExamineRepo()
        const conQ8 = forzato.talosLocalModels.repo!.sets.map((set) => {
            const esame = set.examination
            if (esame.state !== 'read') throw new Error(`${set.label} non letto`)
            return esame.fit.kvCacheBytes
        })

        expect(conQ8).toHaveLength(6)
        for (let i = 0; i < baseline.length; i += 1) {
            expect(conQ8[i], `set #${i}`).toBeCloseTo(baseline[i]! * (17 / 32), 0)
        }
    })

    it("'auto' non cambia niente rispetto a non aver mai chiamato il selettore", async () => {
        const mai = await repoAperto()
        await mai.talosExamineRepo()
        const senzaTocco = mai.talosLocalModels.repo!.sets.map((set) => {
            const esame = set.examination
            return esame.state === 'read' ? esame.fit.kvCacheBytes : null
        })

        vi.resetModules()
        letture = []
        const esplicito = await repoAperto()
        esplicito.talosSetLocalKvCacheType('auto')
        await esplicito.talosExamineRepo()
        const conAuto = esplicito.talosLocalModels.repo!.sets.map((set) => {
            const esame = set.examination
            return esame.state === 'read' ? esame.fit.kvCacheBytes : null
        })

        expect(conAuto).toEqual(senzaTocco)
    })

    /**
     * Il caso che conta per il controllo GLOBALE del Blocco 2 (slider di
     * contesto + selettore cache KV in cima alla pagina di dettaglio, non il
     * bottone di controproposta per riga): cambiare il selettore DOPO che le
     * varianti sono già state esaminate deve ricalcolare tutto sul posto,
     * MAI rileggere la rete. `talosExamineSet` non ha una scorciatoia per
     * "questo file l'ho già letto" — richiama sempre `readHead` — quindi
     * senza `talosRicalcolaEsaminati` questo stesso identico test
     * conterebbe altre due letture (una per modello) invece di zero.
     */
    it('cambiare il tipo DOPO aver esaminato ricalcola sul posto, senza una sola lettura in più', async () => {
        const store = await repoAperto()
        await store.talosExamineRepo()
        const primaDelCambio = [...letture]
        const baseline = store.talosLocalModels.repo!.sets.map((set) => {
            const esame = set.examination
            if (esame.state !== 'read') throw new Error(`${set.label} non letto`)
            return esame.fit.kvCacheBytes
        })

        store.talosSetLocalKvCacheType('q8_0')

        // ⛔ La riga che morde: zero richieste nuove. Se qualcuno rimpiazzasse
        // `talosRicalcolaEsaminati` con una nuova `talosExamineRepo()` "per
        // semplicità", `letture` crescerebbe di due e questo fallirebbe.
        expect(letture).toEqual(primaDelCambio)

        const dopoIlCambio = store.talosLocalModels.repo!.sets.map((set) => {
            const esame = set.examination
            if (esame.state !== 'read') throw new Error(`${set.label} non letto`)
            return esame.fit.kvCacheBytes
        })
        expect(dopoIlCambio).toHaveLength(6)
        for (let i = 0; i < baseline.length; i += 1) {
            expect(dopoIlCambio[i], `set #${i}`).toBeCloseTo(baseline[i]! * (17 / 32), 0)
        }

        // AL CONTRARIO: tornare ad 'auto' ricalcola di nuovo, sempre senza
        // rete, e riporta esattamente il valore di partenza.
        store.talosSetLocalKvCacheType('auto')
        expect(letture).toEqual(primaDelCambio)
        const tornatoAuto = store.talosLocalModels.repo!.sets.map((set) => {
            const esame = set.examination
            if (esame.state !== 'read') throw new Error(`${set.label} non letto`)
            return esame.fit.kvCacheBytes
        })
        expect(tornatoAuto).toEqual(baseline)
    })

    /** Lo stesso, sul percorso del contesto — `talosSetLocalContext` promette "without re-reading" da prima del Blocco 2: qui diventa vero anche in pratica. */
    it('cambiare il CONTESTO dopo aver esaminato ricalcola sul posto, senza una lettura in più', async () => {
        const store = await repoAperto()
        await store.talosExamineRepo()
        const primaDelCambio = [...letture]
        const baseline = store.talosLocalModels.repo!.sets.map((set) => {
            const esame = set.examination
            if (esame.state !== 'read') throw new Error(`${set.label} non letto`)
            return esame.fit.kvCacheBytes
        })

        // TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS (localContextPolicy.ts) e' 4096:
        // il quadruplo, non un numero a caso, per un rapporto atteso pulito.
        store.talosSetLocalContext(16_384)

        expect(letture).toEqual(primaDelCambio)
        const dopoIlCambio = store.talosLocalModels.repo!.sets.map((set) => {
            const esame = set.examination
            if (esame.state !== 'read') throw new Error(`${set.label} non letto`)
            return esame.fit.kvCacheBytes
        })
        // La cache KV scala linearmente col contesto (fit.ts: e' un fattore
        // moltiplicativo diretto): al quadruplo del contesto di partenza
        // corrisponde il quadruplo della cache, capofila E ereditate.
        for (let i = 0; i < baseline.length; i += 1) {
            expect(dopoIlCambio[i], `set #${i}`).toBeCloseTo(baseline[i]! * 4, 0)
        }
    })
})

describe('⛔ Model Lab Blocco 4 — il ledger di provenienza raggiunge OGNI verdetto, capofila e ereditato', () => {
    /**
     * `examination.ledger` e' un campo NUOVO (Blocco 4): senza questo blocco
     * di prove, un domani qualcuno potrebbe toccare talosExamineSet o
     * talosEredita e dimenticare la meta' "ledger" della coppia
     * fit/ledger — esattamente lo stesso rischio gia' preso per
     * kvCacheTypeOverride, sullo stesso file, la stessa notte.
     */
    it('ogni set "read" porta un ledger di otto righe, capofila E ereditate', async () => {
        const store = await repoAperto()
        await store.talosExamineRepo()

        const sets = store.talosLocalModels.repo!.sets
        expect(sets).toHaveLength(6)
        for (const set of sets) {
            const esame = set.examination
            if (esame.state !== 'read') throw new Error(`${set.label} non letto`)
            expect(esame.ledger, set.label).toHaveLength(8)
            expect(esame.ledger.map((row) => row.label)).toEqual([
                'weights', 'kvCache', 'compute', 'runtime', 'safetyMargin',
                'totalRuntime', 'availableRam', 'margin',
            ])
        }
    })

    /**
     * ⛔ Il controllo che conta: due strutture calcolate dallo stesso input
     * (talosModelFit e talosResourceLedger, chiamate una accanto all'altra
     * in talosExamineSet/talosEredita) non devono MAI raccontare due storie
     * diverse sullo stesso numero.
     */
    it('la riga kvCache del ledger coincide ESATTAMENTE con fit.kvCacheBytes, su ogni riga', async () => {
        const store = await repoAperto()
        await store.talosExamineRepo()

        for (const set of store.talosLocalModels.repo!.sets) {
            const esame = set.examination
            if (esame.state !== 'read') throw new Error(`${set.label} non letto`)
            const kvCache = esame.ledger.find((row) => row.label === 'kvCache')
            expect(kvCache?.bytes, set.label).toBe(esame.fit.kvCacheBytes)
        }
    })

    it('forzare q8_0 etichetta la riga kvCache del ledger "predicted", capofila E ereditate', async () => {
        const store = await repoAperto()
        store.talosSetLocalKvCacheType('q8_0')
        await store.talosExamineRepo()

        for (const set of store.talosLocalModels.repo!.sets) {
            const esame = set.examination
            if (esame.state !== 'read') throw new Error(`${set.label} non letto`)
            const kvCache = esame.ledger.find((row) => row.label === 'kvCache')
            expect(kvCache?.provenance, set.label).toBe('predicted')
        }
    })

    /**
     * Il ledger e' la meta' del Blocco 4 che manca al test precedente:
     * quello provava che `talosRicalcolaEsaminati` ricalcola `fit` senza
     * rilettura, capofila e ereditati. Questo prova che ricalcola ANCHE
     * `ledger` — un campo diverso, nella stessa funzione, aggiunto nella
     * stessa notte: uno scritto e l'altro dimenticato e' esattamente il
     * tipo di svista che questo file esiste per stanare.
     */
    it('cambiare il tipo KV dopo l\'esame ricalcola anche il ledger, capofila e ereditati, senza rilettura', async () => {
        const store = await repoAperto()
        await store.talosExamineRepo()
        const primaDelCambio = [...letture]
        const baseline = store.talosLocalModels.repo!.sets.map((set) => {
            const esame = set.examination
            if (esame.state !== 'read') throw new Error(`${set.label} non letto`)
            return esame.ledger.find((row) => row.label === 'kvCache')?.bytes
        })

        store.talosSetLocalKvCacheType('q8_0')

        // ⛔ Zero letture nuove: lo stesso principio gia' provato per `fit`,
        // qui applicato al campo `ledger`.
        expect(letture).toEqual(primaDelCambio)

        const sets = store.talosLocalModels.repo!.sets
        for (let i = 0; i < sets.length; i += 1) {
            const esame = sets[i]!.examination
            if (esame.state !== 'read') throw new Error(`${sets[i]!.label} non letto`)
            const kvCache = esame.ledger.find((row) => row.label === 'kvCache')
            expect(kvCache?.bytes, `set #${i}`).toBeCloseTo(baseline[i]! * (17 / 32), 0)
            expect(kvCache?.provenance, `set #${i}`).toBe('predicted')
            // La somma delle righe resta coerente con fit anche dopo il
            // ricalcolo: stessa garanzia di resourceLedger.test.ts (Blocco
            // 1), qui esercitata sul percorso di ricalcolo, non solo sulla
            // prima lettura.
            expect(kvCache?.bytes, `set #${i}`).toBe(esame.fit.kvCacheBytes)
        }
    })
})
