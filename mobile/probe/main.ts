/**
 * Semantic retrieval probe — measurement only, ships as its OWN build.
 *
 * Owner 2026-07-25 gave the go for a test whose whole point is that it runs on
 * the real phone: numbers from a laptop would say nothing about an Android
 * WebView. Nothing here is imported by the app; the app bundle and its size
 * gate are untouched (the gate demands exactly one entry, so this is a separate
 * Vite build written into dist/probe/).
 *
 * Candidates were chosen from a fresh web pass (2026): transformers.js v4 with
 * the rewritten WebGPU runtime, `onnx-community` as the recommended org.
 * `potion-multilingual-128M` (static embeddings, ~500x faster on CPU) was
 * REJECTED for now: the official ONNX export is 512 MB and there is no
 * supported JS loader — worth revisiting if an int8 export with a JS path
 * appears.
 */
import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers'
import { PROBE_DOCS, PROBE_QUERIES } from './corpus'
import { rankLibraryDocs, type LibraryDoc } from '../src/lib/chat/libraryContext'

env.allowLocalModels = false

// The ONNX runtime WASM is 23 MB. Bundling it made the probe APK too big to
// hand over, so it is fetched from the CDN at the EXACT version transformers.js
// 4.2.0 depends on (onnxruntime-web 1.26.0-dev.20260416-b7804b056c) — a
// floating version here would fail on the phone, where debugging costs a
// round trip. The probe needs the network for the models anyway.
const ORT_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/'
env.backends.onnx.wasm.wasmPaths = {
    wasm: `${ORT_CDN}ort-wasm-simd-threaded.asyncify.wasm`,
    mjs: `${ORT_CDN}ort-wasm-simd-threaded.asyncify.mjs`,
}

interface Candidate {
    id: string
    label: string
    model: string
    dtype: 'q8' | 'q4' | 'fp16' | 'fp32'
    /** Each family was TRAINED with its own prompt shape; using one template
     *  for all of them would rig the comparison in favour of whoever matches
     *  it. These follow each model card. */
    query: (text: string) => string
    passage: (name: string, text: string) => string
    note: string
}

const plain: Candidate['query'] = (text) => text
const plainPassage: Candidate['passage'] = (name, text) => `${name}. ${text}`

const CANDIDATES: Candidate[] = [
    {
        id: 'e5s',
        label: 'multilingual-e5-small (118M, q8)',
        model: 'Xenova/multilingual-e5-small',
        dtype: 'q8',
        query: (text) => `query: ${text}`,
        passage: (name, text) => `passage: ${name}. ${text}`,
        note: 'Il pragmatico: piccolo, multilingue, molto usato.',
    },
    {
        id: 'e5l',
        label: 'multilingual-e5-large (560M, q8)',
        model: 'Xenova/multilingual-e5-large',
        dtype: 'q8',
        query: (text) => `query: ${text}`,
        passage: (name, text) => `passage: ${name}. ${text}`,
        note: 'Stessa famiglia ma pesante: serve a vedere quanto si guadagna salendo di taglia.',
    },
    {
        id: 'gte',
        label: 'gte-multilingual-base (305M, q8)',
        model: 'onnx-community/gte-multilingual-base',
        dtype: 'q8',
        query: plain,
        passage: plainPassage,
        note: '70+ lingue. Rischio noto: transformers.js potrebbe rifiutarne la classe.',
    },
    {
        id: 'gemma4',
        label: 'EmbeddingGemma-300M (q4)',
        model: 'onnx-community/embeddinggemma-300m-ONNX',
        dtype: 'q4',
        query: (text) => `task: search result | query: ${text}`,
        passage: (name, text) => `title: ${name} | text: ${text}`,
        note: 'Miglior modello aperto sotto i 500M su MTEB, in versione compressa.',
    },
    {
        id: 'gemma8',
        label: 'EmbeddingGemma-300M (q8)',
        model: 'onnx-community/embeddinggemma-300m-ONNX',
        dtype: 'q8',
        query: (text) => `task: search result | query: ${text}`,
        passage: (name, text) => `title: ${name} | text: ${text}`,
        note: 'Lo stesso modello a precisione piu alta: quanto costa in tempo e quanto rende in qualita.',
    },
    {
        id: 'qwen3',
        label: 'Qwen3-Embedding-0.6B (q4)',
        model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
        dtype: 'q4',
        query: (text) => `Instruct: Given a search query, retrieve relevant documents
Query: ${text}`,
        passage: plainPassage,
        note: 'Il peso massimo della categoria. Owner ha un telefono di fascia alta: si prova.',
    },
    {
        id: 'minilm',
        label: 'all-MiniLM-L6-v2 (22M, q8) — riferimento',
        model: 'Xenova/all-MiniLM-L6-v2',
        dtype: 'q8',
        query: plain,
        passage: plainPassage,
        note: 'Solo inglese: pavimento di velocita, non un candidato serio per l italiano.',
    },
]

const results: Record<string, unknown>[] = []
const root = document.querySelector<HTMLDivElement>('#app')!
const log = document.querySelector<HTMLPreElement>('#log')!
const table = document.querySelector<HTMLTableSectionElement>('#rows')!

function say(line: string): void {
    log.textContent += `${line}\n`
    log.scrollTop = log.scrollHeight
}

function fmt(value: number, digits = 0): string {
    return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

/** Cosine on already-normalised vectors is a dot product. */
function dot(a: Float32Array, b: Float32Array): number {
    let sum = 0
    for (let index = 0; index < a.length; index += 1) sum += a[index]! * b[index]!
    return sum
}

function normalise(vector: Float32Array): Float32Array {
    let norm = 0
    for (const value of vector) norm += value * value
    norm = Math.sqrt(norm) || 1
    const out = new Float32Array(vector.length)
    for (let index = 0; index < vector.length; index += 1) out[index] = vector[index]! / norm
    return out
}

// ---- Baseline: EXACTLY what the app does today ----------------------------
function baselineScores(): { recall1: number; recall3: number; mrr: number; ms: number } {
    const docs: LibraryDoc[] = PROBE_DOCS.map((doc) => ({
        id: doc.id,
        displayName: doc.name,
        origin: 'uploaded',
        originSessionId: null,
        originSessionTitle: null,
        createdAt: '2026-07-25T00:00:00.000Z',
        text: doc.text,
    }))
    const start = performance.now()
    let hit1 = 0
    let hit3 = 0
    let mrr = 0
    for (const probe of PROBE_QUERIES) {
        const ranked = rankLibraryDocs(docs, probe.query)
        const position = ranked.findIndex((row) => row.doc.id === probe.relevant)
        if (position === 0) hit1 += 1
        if (position >= 0 && position < 3) hit3 += 1
        if (position >= 0) mrr += 1 / (position + 1)
    }
    const ms = performance.now() - start
    const total = PROBE_QUERIES.length
    return { recall1: hit1 / total, recall3: hit3 / total, mrr: mrr / total, ms }
}

// ---- One semantic candidate ------------------------------------------------
async function runCandidate(candidate: Candidate): Promise<void> {
    const row = document.createElement('tr')
    row.innerHTML = `<td>${candidate.label}</td><td colspan="7">scarico…</td>`
    table.append(row)
    say(`\n=== ${candidate.label} ===`)

    let downloaded = 0
    const started = performance.now()
    try {
        const extractor: FeatureExtractionPipeline = await pipeline('feature-extraction', candidate.model, {
            dtype: candidate.dtype,
            device: (navigator as { gpu?: unknown }).gpu ? 'webgpu' : 'wasm',
            progress_callback: (progress: Record<string, unknown>) => {
                if (progress.status === 'progress' && typeof progress.loaded === 'number') {
                    downloaded = Math.max(downloaded, progress.total as number ?? 0)
                    row.cells[1]!.textContent = `scarico… ${fmt((progress.loaded as number) / 1e6, 1)} MB`
                }
            },
        })
        const loadMs = performance.now() - started
        say(`caricato in ${fmt(loadMs)} ms — peso scaricato ~${fmt(downloaded / 1e6, 1)} MB`)

        // Index the corpus.
        const indexStart = performance.now()
        const vectors: Float32Array[] = []
        let chars = 0
        for (const doc of PROBE_DOCS) {
            const output = await extractor(candidate.passage(doc.name, doc.text), { pooling: 'mean', normalize: true })
            vectors.push(normalise(Float32Array.from(output.data as Float32Array)))
            chars += doc.text.length
        }
        const indexMs = performance.now() - indexStart

        // Query.
        const latencies: number[] = []
        let hit1 = 0
        let hit3 = 0
        let mrr = 0
        for (const probe of PROBE_QUERIES) {
            const queryStart = performance.now()
            const output = await extractor(candidate.query(probe.query), { pooling: 'mean', normalize: true })
            const vector = normalise(Float32Array.from(output.data as Float32Array))
            const ranked = PROBE_DOCS
                .map((doc, index) => ({ id: doc.id, score: dot(vector, vectors[index]!) }))
                .sort((a, b) => b.score - a.score)
            latencies.push(performance.now() - queryStart)
            const position = ranked.findIndex((entry) => entry.id === probe.relevant)
            if (position === 0) hit1 += 1
            if (position >= 0 && position < 3) hit3 += 1
            if (position >= 0) mrr += 1 / (position + 1)
        }
        latencies.sort((a, b) => a - b)
        const total = PROBE_QUERIES.length
        const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? Number.NaN

        const record = {
            candidato: candidate.label,
            modello: candidate.model,
            precisione: candidate.dtype,
            backend: (navigator as { gpu?: unknown }).gpu ? 'webgpu' : 'wasm',
            download_mb: Number(fmt(downloaded / 1e6, 1)),
            caricamento_ms: Math.round(loadMs),
            indicizzazione_ms: Math.round(indexMs),
            caratteri_al_secondo: Math.round(chars / (indexMs / 1000)),
            query_p50_ms: Math.round(latencies[Math.floor(latencies.length / 2)]!),
            query_p90_ms: Math.round(latencies[Math.floor(latencies.length * 0.9)]!),
            recall_1: Number((hit1 / total).toFixed(2)),
            recall_3: Number((hit3 / total).toFixed(2)),
            mrr: Number((mrr / total).toFixed(3)),
            heap_mb: Number.isFinite(memory) ? Number((memory / 1e6).toFixed(0)) : null,
        }
        results.push(record)
        row.innerHTML = `<td>${candidate.label}</td>
            <td>${record.download_mb} MB</td>
            <td>${record.caricamento_ms} ms</td>
            <td>${record.indicizzazione_ms} ms</td>
            <td>${record.query_p50_ms} ms</td>
            <td>${(record.recall_1 * 100).toFixed(0)}%</td>
            <td>${(record.recall_3 * 100).toFixed(0)}%</td>
            <td>${record.heap_mb ?? '—'}</td>`
        say(`indicizzati 24 documenti in ${fmt(indexMs)} ms (${record.caratteri_al_secondo} car/s)`)
        say(`query p50 ${record.query_p50_ms} ms — trovato al primo colpo ${(record.recall_1 * 100).toFixed(0)}%, nei primi 3 ${(record.recall_3 * 100).toFixed(0)}%`)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        results.push({ candidato: candidate.label, modello: candidate.model, errore: message })
        row.innerHTML = `<td>${candidate.label}</td><td colspan="7" class="bad">FALLITO — ${message}</td>`
        say(`FALLITO: ${message}`)
    }
}

async function runAll(): Promise<void> {
    root.querySelector('button')?.setAttribute('disabled', 'true')
    const base = baselineScores()
    results.push({
        candidato: 'RICERCA ATTUALE (parole chiave)',
        download_mb: 0,
        query_p50_ms: Number((base.ms / PROBE_QUERIES.length).toFixed(2)),
        recall_1: Number(base.recall1.toFixed(2)),
        recall_3: Number(base.recall3.toFixed(2)),
        mrr: Number(base.mrr.toFixed(3)),
    })
    const row = document.createElement('tr')
    row.innerHTML = `<td><b>Ricerca attuale (parole chiave)</b></td><td>0 MB</td><td>0 ms</td><td>0 ms</td>
        <td>${fmt(base.ms / PROBE_QUERIES.length, 2)} ms</td>
        <td>${(base.recall1 * 100).toFixed(0)}%</td>
        <td>${(base.recall3 * 100).toFixed(0)}%</td><td>—</td>`
    table.append(row)
    say(`Riferimento — ricerca attuale: primo colpo ${(base.recall1 * 100).toFixed(0)}%, nei primi 3 ${(base.recall3 * 100).toFixed(0)}%`)
    say(`WebGPU: ${(navigator as { gpu?: unknown }).gpu ? 'DISPONIBILE' : 'non disponibile (si usa WASM)'}`)
    say(`Agente: ${navigator.userAgent}`)

    for (const candidate of CANDIDATES) await runCandidate(candidate)

    say('\n=== FINE. Tocca "Copia risultati" e incollali in chat. ===')
    root.querySelector('button')?.removeAttribute('disabled')
}

// One button per candidate: a 600 MB download that dies on a lift ride must
// not force the whole battery of tests to start over.
const picker = document.querySelector<HTMLDivElement>('#picker')!
for (const candidate of CANDIDATES) {
    const button = document.createElement('button')
    button.className = 'ghost small'
    button.textContent = candidate.label.replace(/ \(.*$/, '')
    button.title = candidate.note
    button.addEventListener('click', () => {
        button.setAttribute('disabled', 'true')
        void runCandidate(candidate).finally(() => button.removeAttribute('disabled'))
    })
    picker.append(button)
}

document.querySelector('#run')!.addEventListener('click', () => { void runAll() })
document.querySelector('#copy')!.addEventListener('click', async () => {
    const payload = JSON.stringify({
        dispositivo: navigator.userAgent,
        webgpu: Boolean((navigator as { gpu?: unknown }).gpu),
        misure: results,
    }, null, 2)
    try {
        await navigator.clipboard.writeText(payload)
        say('\nRisultati copiati negli appunti.')
    } catch {
        log.textContent += `\n${payload}\n`
    }
})
