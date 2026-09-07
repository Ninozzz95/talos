import type { TalosDictationEngine, TalosDictationResult, TalosTranscribeOptions } from './talosDictation'
import { TalosDictationError } from './talosDictation'

// In-browser Whisper (transformers.js / ONNX Runtime Web). Everything here is
// reached only through the dynamic import in resolveTalosDictationEngine, and the
// heavy runtime itself is imported lazily below, so neither lands in the entry chunk.

const WHISPER_MODEL_ID = 'Xenova/whisper-base'
const TARGET_SAMPLE_RATE = 16000

type WhisperPipeline = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text?: string }>

let pipelinePromise: Promise<WhisperPipeline> | null = null

// Loaded once and cached; the ~75MB model is fetched on first use and then served
// from the browser cache.
async function loadTranscriber(): Promise<WhisperPipeline> {
    if (!pipelinePromise) {
        pipelinePromise = (async () => {
            const { pipeline } = await import('@huggingface/transformers')
            const transcriber = await pipeline('automatic-speech-recognition', WHISPER_MODEL_ID, { dtype: 'q8' })
            return transcriber as unknown as WhisperPipeline
        })().catch((error) => {
            pipelinePromise = null
            throw error
        })
    }
    return pipelinePromise
}

function resolveAudioContextCtor(): typeof AudioContext | undefined {
    if (typeof window === 'undefined') return undefined
    return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
}

// Whisper wants 16kHz mono float samples; decode the recorded clip and downmix.
async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
    const AudioCtx = resolveAudioContextCtor()
    if (!AudioCtx) {
        throw new TalosDictationError('TALOS_STT_ENGINE_UNAVAILABLE', 'Web Audio is not available in this browser.')
    }

    const arrayBuffer = await blob.arrayBuffer()
    const context = new AudioCtx({ sampleRate: TARGET_SAMPLE_RATE })
    try {
        const audioBuffer = await context.decodeAudioData(arrayBuffer)
        return audioBuffer.getChannelData(0).slice()
    } catch {
        throw new TalosDictationError('TALOS_STT_AUDIO_INVALID', 'TALOS could not decode the recorded audio.')
    } finally {
        await context.close().catch(() => undefined)
    }
}

export function createTalosBrowserWhisperEngine(): TalosDictationEngine {
    return {
        id: 'browser-whisper',
        async isAvailable() {
            return typeof WebAssembly !== 'undefined' && resolveAudioContextCtor() !== undefined
        },
        async transcribe(audio: Blob, options: TalosTranscribeOptions = {}): Promise<TalosDictationResult> {
            const samples = await decodeToMono16k(audio)

            let transcriber: WhisperPipeline
            try {
                transcriber = await loadTranscriber()
            } catch {
                throw new TalosDictationError('TALOS_STT_ENGINE_UNAVAILABLE', 'TALOS could not load the on-device speech model.')
            }

            const output = await transcriber(samples, {
                task: 'transcribe',
                ...(options.language ? { language: options.language } : {}),
                chunk_length_s: 30,
                stride_length_s: 5,
            })

            return { text: typeof output?.text === 'string' ? output.text.trim() : '' }
        },
    }
}
