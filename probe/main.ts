/**
 * Semantic retrieval probe — measurement only, ships as its OWN build.
 *
 * Round 1 (device PJZ110, Android 16, WebGPU on) answered the first question:
 * the current keyword ranker puts the right document first 46% of the time,
 * multilingual-e5-small takes that to 83%, and e5-large is perfect but indexes
 * at 114 chars/s — unshippable. Three arms failed and the corpus was made of
 * 200-character notes, which is not what a Library holds.
 *
 * Round 2 measures what round 1 could not:
 *  - WARM start (round 1's load time was mostly the download),
 *  - the WASM fallback for models the GPU refuses (EmbeddingGemma hit a
 *    workgroup-storage limit on this device),
 *  - the pooling each family actually wants (gte is CLS, Qwen3 is last-token —
 *    round 1 pooled everything with mean, which was unfair to both),
 *  - PAGE-LENGTH documents with chunking + overlap, the real Library shape,
 *  - HYBRID fusion of keyword and semantic ranks, which is what production RAG
 *    ships and which round 1 never measured.
 *
 * Nothing here is imported by the app; the app bundle and its size gate are
 * untouched (the gate demands exactly one entry, so this is a separate build).
 * `potion-multilingual-128M` (static embeddings, ~500x faster on CPU) stays
 * rejected: 512 MB official ONNX export and no supported JS loader today.
 */
import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers'
import { PROBE_DOCS, PROBE_QUERIES } from './corpus'
import { LONG_DOCS, LONG_QUERIES } from './corpusLong'
import { SCALE_FILLERS } from './corpusScale'
import { rankLibraryDocs, type LibraryDoc } from '../src/lib/chat/libraryContext'

env.allowLocalModels = false

// The ONNX runtime WASM is 23 MB. Bundling it made the probe APK too big to
// hand over, so it is fetched from the CDN at the EXACT version transformers.js
// 4.2.0 depends on — a floating version would fail on the phone, where
// debugging costs a round trip. The probe needs the network for models anyway.
const ORT_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/'
env.backends.onnx.wasm.wasmPaths = {
    wasm: `${ORT_CDN}ort-wasm-simd-threaded.asyncify.wasm`,
    mjs: `${ORT_CDN}ort-wasm-simd-threaded.asyncify.mjs`,
}

type Pooling = 'mean' | 'cls' | 'last'

interface Candidate {
    id: string
    label: string
    model: string
    dtype: 'q8' | 'q4' | 'fp16' | 'fp32'
    /** Each family was trained with its own prompt shape and pooling; one
     *  shared recipe would rig the comparison towards whoever matches it. */
    pooling: Pooling
    query: (text: string) => string
    passage: (name: string, text: string) => string
    /** Skip WebGPU when the device is known to refuse the model's shaders. */
    forceWasm?: boolean
}

const plain = (text: string): string => text
const plainPassage = (name: string, text: string): string => `${name}. ${text}`

const CANDIDATES: Candidate[] = [
    {
        id: 'e5s',
        label: 'e5-small q8',
        model: 'Xenova/multilingual-e5-small',
        dtype: 'q8',
        pooling: 'mean',
        query: (text) => `query: ${text}`,
        passage: (name, text) => `passage: ${name}. ${text}`,
    },
    {
        id: 'gte-cls',
        label: 'gte-base q8 (CLS)',
        model: 'onnx-community/gte-multilingual-base',
        dtype: 'q8',
        pooling: 'cls',
        query: plain,
        passage: plainPassage,
    },
    {
        id: 'gemma-cpu',
        label: 'EmbeddingGemma q8 (CPU)',
        model: 'onnx-community/embeddinggemma-300m-ONNX',
        dtype: 'q8',
        pooling: 'mean',
        forceWasm: true,
        query: (text) => `task: search result | query: ${text}`,
        passage: (name, text) => `title: ${name} | text: ${text}`,
    },
    {
        id: 'qwen3',
        label: 'Qwen3-0.6B q8 (last-token)',
        model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
        dtype: 'q8',
        pooling: 'last',
        query: (text) => `Instruct: Given a search query, retrieve relevant documents\nQuery: ${text}`,
        passage: plainPassage,
    },
    {
        id: 'e5l',
        label: 'e5-large q8',
        model: 'Xenova/multilingual-e5-large',
        dtype: 'q8',
        pooling: 'mean',
        query: (text) => `query: ${text}`,
        passage: (name, text) => `passage: ${name}. ${text}`,
    },
]

// Round 2 chunking: 800 characters with 150 of overlap, split at sentence ends
// where possible so a chunk rarely starts mid-clause.
const CHUNK_CHARS = 800
const CHUNK_OVERLAP = 150

function chunk(text: string): string[] {
    if (text.length <= CHUNK_CHARS) return [text]
    const chunks: string[] = []
    let start = 0
    while (start < text.length) {
        let end = Math.min(text.length, start + CHUNK_CHARS)
        if (end < text.length) {
            const stop = text.lastIndexOf('. ', end)
            if (stop > start + CHUNK_CHARS / 2) end = stop + 1
        }
        chunks.push(text.slice(start, end).trim())
        if (end >= text.length) break
        start = Math.max(0, end - CHUNK_OVERLAP)
    }
    return chunks
}

// SF of my own round-2 run: after a failed ONNX session the page state is
// poisoned and every later arm inherits the previous error — three arms were
// reported as failures without ever running. Each arm now gets a PRISTINE page
// and results survive the reload in sessionStorage.
const STORE_KEY = 'talos.probe.round3'
const NL = String.fromCharCode(10)

function loadResults(): Record<string, unknown>[] {
    try {
        const raw = sessionStorage.getItem(STORE_KEY)
        return raw ? JSON.parse(raw) as Record<string, unknown>[] : []
    } catch {
        return []
    }
}

function saveResults(): void {
    try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify(results))
    } catch {
        // A full session store must not lose the run; the table still shows it.
    }
}

const results: Record<string, unknown>[] = loadResults()
const log = document.querySelector<HTMLPreElement>('#log')!
const table = document.querySelector<HTMLTableSectionElement>('#rows')!

function say(line: string): void {
    log.textContent += `${line}\n`
    log.scrollTop = log.scrollHeight
}

function dot(a: Float32Array, b: Float32Array): number {
    let sum = 0
    for (let index = 0; index < a.length; index += 1) sum += a[index]! * b[index]!
    return sum
}

function normalise(values: ArrayLike<number>, offset: number, length: number): Float32Array {
    const out = new Float32Array(length)
    let norm = 0
    for (let index = 0; index < length; index += 1) {
        const value = values[offset + index] as number
        out[index] = value
        norm += value * value
    }
    norm = Math.sqrt(norm) || 1
    for (let index = 0; index < length; index += 1) out[index] = out[index]! / norm
    return out
}

/** Mean and CLS are pipeline options; last-token pooling has to be done here. */
async function embed(extractor: FeatureExtractionPipeline, text: string, pooling: Pooling): Promise<Float32Array> {
    if (pooling === 'last') {
        const output = await extractor(text, { pooling: 'none', normalize: false })
        const dims = output.dims as number[]
        const width = dims.at(-1)!
        const tokens = dims.at(-2)!
        return normalise(output.data as unknown as ArrayLike<number>, (tokens - 1) * width, width)
    }
    const output = await extractor(text, { pooling, normalize: true })
    const width = (output.dims as number[]).at(-1)!
    return normalise(output.data as unknown as ArrayLike<number>, 0, width)
}

interface Ranked { id: string; score: number }

function rankByVector(vector: Float32Array, index: Array<{ id: string; vector: Float32Array }>): Ranked[] {
    // Document score = its best chunk. Averaging would let 2.000 characters of
    // unrelated text bury the one paragraph that answers the question.
    const best = new Map<string, number>()
    for (const entry of index) {
        const score = dot(vector, entry.vector)
        if (score > (best.get(entry.id) ?? -Infinity)) best.set(entry.id, score)
    }
    return [...best.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score)
}

function toLibrary(docs: ReadonlyArray<{ id: string; name: string; text: string }>): LibraryDoc[] {
    return docs.map((doc) => ({
        id: doc.id,
        displayName: doc.name,
        origin: 'uploaded',
        originSessionId: null,
        originSessionTitle: null,
        createdAt: '2026-07-25T00:00:00.000Z',
        text: doc.text,
    }))
}

function keywordRank(docs: LibraryDoc[], query: string): Ranked[] {
    return rankLibraryDocs(docs, query).map((row) => ({ id: row.doc.id, score: row.score }))
}

/**
 * Weighted reciprocal rank fusion. Round 2 showed equal weights HURT: fusing a
 * near-random keyword ranking into a strong semantic one dropped recall@1 from
 * 1.00 to 0.78. So the weight is swept instead of assumed.
 */
function fuse(semantic: Ranked[], keyword: Ranked[], weight: number, k = 60): Ranked[] {
    const scores = new Map<string, number>()
    const add = (list: Ranked[], factor: number): void => {
        list.forEach((entry, position) => {
            scores.set(entry.id, (scores.get(entry.id) ?? 0) + factor / (k + position + 1))
        })
    }
    add(semantic, weight)
    add(keyword, 1)
    return [...scores.entries()].map(([id, score]) => ({ id, score })).sort((x, y) => y.score - x.score)
}

const FUSION_WEIGHTS = [1, 2, 3, 5] as const

function accuracy(rankings: Array<{ ranked: Ranked[]; relevant: string }>) {
    let hit1 = 0
    let hit3 = 0
    let mrr = 0
    for (const { ranked, relevant } of rankings) {
        const position = ranked.findIndex((entry) => entry.id === relevant)
        if (position === 0) hit1 += 1
        if (position >= 0 && position < 3) hit3 += 1
        if (position >= 0) mrr += 1 / (position + 1)
    }
    const total = rankings.length || 1
    return {
        recall_1: Number((hit1 / total).toFixed(2)),
        recall_3: Number((hit3 / total).toFixed(2)),
        mrr: Number((mrr / total).toFixed(3)),
    }
}

function addRow(cells: string[]): HTMLTableRowElement {
    const row = document.createElement('tr')
    row.innerHTML = cells.map((cell) => `<td>${cell}</td>`).join('')
    table.append(row)
    return row
}

// Round 3: the same 18 long-document questions, but the right answer now has
// to beat 92 neighbours instead of 7 — the question that decides whether this
// survives a real Library.
const SCALE_DOCS = [...LONG_DOCS, ...PROBE_DOCS, ...SCALE_FILLERS]

const CORPORA = [
    { name: 'corti', docs: PROBE_DOCS, queries: PROBE_QUERIES },
    { name: 'lunghi', docs: LONG_DOCS, queries: LONG_QUERIES },
    { name: 'scala', docs: SCALE_DOCS, queries: LONG_QUERIES },
] as const

// ---- Baseline over BOTH corpora -------------------------------------------
function baseline(): void {
    for (const corpus of CORPORA) {
        const library = toLibrary(corpus.docs)
        const start = performance.now()
        const scores = accuracy(corpus.queries.map((probe) => ({
            ranked: keywordRank(library, probe.query),
            relevant: probe.relevant,
        })))
        const ms = (performance.now() - start) / corpus.queries.length
        results.push({
            candidato: `PAROLE CHIAVE (oggi) — documenti ${corpus.name}`,
            query_p50_ms: Number(ms.toFixed(2)),
            ...scores,
        })
        addRow([`<b>Parole chiave (oggi) — ${corpus.name}</b>`, '0 MB', '—', '—', `${ms.toFixed(2)} ms`,
            `${(scores.recall_1 * 100).toFixed(0)}%`, `${(scores.recall_3 * 100).toFixed(0)}%`, '—'])
        say(`Riferimento ${corpus.name}: 1° colpo ${(scores.recall_1 * 100).toFixed(0)}%, primi 3 ${(scores.recall_3 * 100).toFixed(0)}%`)
    }
}

// ---- One candidate ---------------------------------------------------------
async function runCandidate(candidate: Candidate): Promise<void> {
    const row = addRow([candidate.label, 'scarico…', '', '', '', '', '', ''])
    say(`\n=== ${candidate.label} ===`)
    const wantsGpu = Boolean((navigator as { gpu?: unknown }).gpu) && !candidate.forceWasm
    let downloaded = 0

    async function build(device: 'webgpu' | 'wasm'): Promise<FeatureExtractionPipeline> {
        return pipeline('feature-extraction', candidate.model, {
            dtype: candidate.dtype,
            device,
            progress_callback: (progress: Record<string, unknown>) => {
                if (progress.status === 'progress' && typeof progress.loaded === 'number') {
                    downloaded = Math.max(downloaded, (progress.total as number) ?? 0)
                    row.cells[1]!.textContent = `scarico… ${((progress.loaded as number) / 1e6).toFixed(0)} MB`
                }
            },
        })
    }

    let backend: 'webgpu' | 'wasm' = wantsGpu ? 'webgpu' : 'wasm'
    let extractor: FeatureExtractionPipeline
    const coldStart = performance.now()
    try {
        extractor = await build(backend)
        // A model can load on WebGPU and only fail at the first inference — that
        // is exactly how EmbeddingGemma failed in round 1 — so prove it runs.
        await embed(extractor, 'prova', candidate.pooling)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (backend === 'wasm') {
            results.push({ candidato: candidate.label, errore: message })
            row.innerHTML = `<td>${candidate.label}</td><td colspan="7" class="bad">FALLITO — ${message}</td>`
            say(`FALLITO: ${message}`)
            return
        }
        say(`GPU rifiutata (${message.slice(0, 90)}…) → riprovo su CPU`)
        backend = 'wasm'
        try {
            extractor = await build('wasm')
            await embed(extractor, 'prova', candidate.pooling)
        } catch (fallbackError) {
            const detail = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
            results.push({ candidato: candidate.label, errore: detail, nota: 'fallito anche su CPU' })
            row.innerHTML = `<td>${candidate.label}</td><td colspan="7" class="bad">FALLITO anche su CPU — ${detail}</td>`
            say(`FALLITO anche su CPU: ${detail}`)
            return
        }
    }
    const coldMs = performance.now() - coldStart

    // Warm start: the weights are in the browser cache now, so this is what the
    // user pays on EVERY launch after the first — round 1 never isolated it.
    let warmMs = Number.NaN
    try {
        await extractor.dispose()
        const warmStart = performance.now()
        extractor = await build(backend)
        await embed(extractor, 'prova', candidate.pooling)
        warmMs = performance.now() - warmStart
    } catch {
        // Keep going with what we have; the warm number stays unknown.
    }

    const record: Record<string, unknown> = {
        candidato: candidate.label,
        modello: candidate.model,
        precisione: candidate.dtype,
        pooling: candidate.pooling,
        backend,
        download_mb: Number((downloaded / 1e6).toFixed(1)),
        avvio_freddo_ms: Math.round(coldMs),
        avvio_caldo_ms: Number.isFinite(warmMs) ? Math.round(warmMs) : null,
    }

    for (const corpus of CORPORA) {
        const library = toLibrary(corpus.docs)
        const index: Array<{ id: string; vector: Float32Array }> = []
        let chars = 0
        let pieces = 0
        const indexStart = performance.now()
        for (const doc of corpus.docs) {
            for (const piece of chunk(doc.text)) {
                index.push({
                    id: doc.id,
                    vector: await embed(extractor, candidate.passage(doc.name, piece), candidate.pooling),
                })
                chars += piece.length
                pieces += 1
            }
        }
        const indexMs = performance.now() - indexStart

        const latencies: number[] = []
        const semantic: Array<{ ranked: Ranked[]; relevant: string }> = []
        const hybrids = new Map<number, Array<{ ranked: Ranked[]; relevant: string }>>()
        for (const weight of FUSION_WEIGHTS) hybrids.set(weight, [])
        for (const probe of corpus.queries) {
            const queryStart = performance.now()
            const vector = await embed(extractor, candidate.query(probe.query), candidate.pooling)
            const ranked = rankByVector(vector, index)
            latencies.push(performance.now() - queryStart)
            semantic.push({ ranked, relevant: probe.relevant })
            const words = keywordRank(library, probe.query)
            for (const weight of FUSION_WEIGHTS) {
                hybrids.get(weight)!.push({ ranked: fuse(ranked, words, weight), relevant: probe.relevant })
            }
        }
        latencies.sort((a, b) => a - b)
        const semanticScores = accuracy(semantic)
        const fusionSweep: Record<string, unknown> = {}
        for (const weight of FUSION_WEIGHTS) fusionSweep[`peso_${weight}`] = accuracy(hybrids.get(weight)!)
        const hybridScores = accuracy(hybrids.get(3)!)
        Object.assign(record, {
            [`${corpus.name}_pezzi`]: pieces,
            [`${corpus.name}_indicizzazione_ms`]: Math.round(indexMs),
            [`${corpus.name}_caratteri_al_secondo`]: Math.round(chars / (indexMs / 1000)),
            [`${corpus.name}_query_p50_ms`]: Math.round(latencies[Math.floor(latencies.length / 2)]!),
            [`${corpus.name}_semantico`]: semanticScores,
            [`${corpus.name}_ibrido_3a1`]: hybridScores,
            [`${corpus.name}_fusione`]: fusionSweep,
        })
        say(`${corpus.name}: ${pieces} pezzi in ${(indexMs / 1000).toFixed(1)}s — semantico ${(semanticScores.recall_1 * 100).toFixed(0)}% / ibrido ${(hybridScores.recall_1 * 100).toFixed(0)}% al 1° colpo`)
    }

    const heap = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize
    record.heap_mb = heap ? Number((heap / 1e6).toFixed(0)) : null
    results.push(record)

    const short = record.corti_semantico as { recall_1: number }
    const long = record.lunghi_semantico as { recall_1: number }
    const scale = record.scala_semantico as { recall_1: number }
    row.innerHTML = [
        `${candidate.label}<br><span style="color:#7f9aa1">${backend}</span>`,
        `${record.download_mb} MB`,
        `${(coldMs / 1000).toFixed(1)}s / ${record.avvio_caldo_ms !== null ? `${((record.avvio_caldo_ms as number) / 1000).toFixed(1)}s` : '—'}`,
        `${((record.scala_indicizzazione_ms as number) / 1000).toFixed(1)}s`,
        `${record.scala_query_p50_ms} ms`,
        `${(short.recall_1 * 100).toFixed(0)}%`,
        `${(long.recall_1 * 100).toFixed(0)}%`,
        `${(scale.recall_1 * 100).toFixed(0)}%`,
    ].map((cell) => `<td>${cell}</td>`).join('')
}

function renderStored(): void {
    for (const record of results) {
        if (typeof record.errore === 'string') {
            addRow([`${record.candidato}`, `<span class="bad">FALLITO — ${record.errore}</span>`, '', '', '', '', '', ''])
            continue
        }
        const short = record.corti_semantico as { recall_1: number } | undefined
        const long = record.lunghi_semantico as { recall_1: number } | undefined
        const scale = record.scala_semantico as { recall_1: number } | undefined
        addRow([
            `${record.candidato}${record.backend ? `<br><span style="color:#7f9aa1">${record.backend}</span>` : ''}`,
            record.download_mb !== undefined ? `${record.download_mb} MB` : '—',
            record.avvio_caldo_ms ? `${((record.avvio_freddo_ms as number) / 1000).toFixed(1)}s / ${((record.avvio_caldo_ms as number) / 1000).toFixed(1)}s` : '—',
            record.scala_indicizzazione_ms ? `${((record.scala_indicizzazione_ms as number) / 1000).toFixed(1)}s` : '—',
            record.scala_query_p50_ms ? `${record.scala_query_p50_ms} ms` : `${record.query_p50_ms ?? '—'} ms`,
            short ? `${(short.recall_1 * 100).toFixed(0)}%` : `${((record.recall_1 as number ?? 0) * 100).toFixed(0)}%`,
            long ? `${(long.recall_1 * 100).toFixed(0)}%` : '—',
            scale ? `${(scale.recall_1 * 100).toFixed(0)}%` : '—',
        ])
    }
}

function goToArm(id: string, chain: boolean): void {
    window.location.search = `?arm=${id}${chain ? '&chain=1' : ''}`
}

async function driveFromUrl(): Promise<void> {
    const params = new URLSearchParams(window.location.search)
    const armId = params.get('arm')
    const chain = params.get('chain') === '1'
    if (!armId) return
    if (armId === 'base') {
        baseline()
        saveResults()
        if (chain && CANDIDATES[0]) goToArm(CANDIDATES[0].id, true)
        return
    }
    const index = CANDIDATES.findIndex((candidate) => candidate.id === armId)
    if (index < 0) return
    say(`Pagina pulita per ${CANDIDATES[index]!.label} — nessuno stato ereditato dal candidato precedente.`)
    await runCandidate(CANDIDATES[index]!)
    saveResults()
    const next = CANDIDATES[index + 1]
    if (chain && next) {
        say(`${NL}Ricarico la pagina per ${next.label}…`)
        window.setTimeout(() => goToArm(next.id, true), 1200)
        return
    }
    say(NL + '=== FINE. Tocca "Copia risultati" e incolla in chat. ===')
}

const picker = document.querySelector<HTMLDivElement>('#picker')!
for (const candidate of CANDIDATES) {
    const button = document.createElement('button')
    button.className = 'ghost small'
    button.textContent = candidate.label
    button.addEventListener('click', () => { goToArm(candidate.id, false) })
    picker.append(button)
}

document.querySelector('#run')!.addEventListener('click', () => { goToArm('base', true) })
document.querySelector('#base')!.addEventListener('click', () => { baseline(); saveResults() })
document.querySelector('#reset')!.addEventListener('click', () => {
    sessionStorage.removeItem(STORE_KEY)
    window.location.search = ''
})
document.querySelector('#copy')!.addEventListener('click', async () => {
    const payload = JSON.stringify({
        round: 3,
        dispositivo: navigator.userAgent,
        webgpu: Boolean((navigator as { gpu?: unknown }).gpu),
        chunk: { caratteri: CHUNK_CHARS, sovrapposizione: CHUNK_OVERLAP },
        documenti: { corti: PROBE_DOCS.length, lunghi: LONG_DOCS.length, scala: SCALE_DOCS.length },
        misure: results,
    }, null, 1)
    try {
        await navigator.clipboard.writeText(payload)
        say(NL + 'Risultati copiati negli appunti.')
    } catch {
        log.textContent += NL + payload + NL
    }
})

renderStored()
void driveFromUrl()
