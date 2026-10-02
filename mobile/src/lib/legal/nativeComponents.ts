/**
 * I componenti NATIVI e i modelli spediti dentro l'APK, con la loro licenza —
 * quelli che né AboutLibraries (Gradle) né license-checker (npm) vedono.
 *
 * Fonti (01/10/2026): `android/app/src/main/jniLibs/PROVENIENZA.md` (adb e
 * librerie da Termux), `PROVENIENZA-PAROLA.md` + README di openWakeWord
 * (letto il 01/10: codice Apache-2.0, modelli addestrati CC BY-NC-SA 4.0),
 * `docs/upstream-provenance.md` (llama.cpp), versioni lette dai binari di
 * `assets/talos-node-lib` (pacchetti Termux).
 *
 * ⛔ Il software Qualcomm NON è qui: ha la sua sezione e le sue condizioni
 * (`npuTerms.ts`, PKLA 2.1 b).
 */
export interface TalosNativeComponent {
    name: string
    version: string | null
    license: string
    source: string
    note?: string
}

export const TALOS_NATIVE_COMPONENTS: readonly TalosNativeComponent[] = Object.freeze([
    { name: 'llama.cpp / ggml', version: 'b11312', license: 'MIT', source: 'https://github.com/ggml-org/llama.cpp' },
    { name: 'Node.js', version: '24.18.0', license: 'MIT', source: 'https://nodejs.org', note: 'Pacchetto Termux; include V8 (BSD-3-Clause), libuv (MIT) e le altre parti elencate nella sua licenza.' },
    { name: 'OpenSSL', version: '3.6.3', license: 'Apache-2.0', source: 'https://www.openssl.org' },
    { name: 'ICU', version: '78.3', license: 'Unicode-3.0', source: 'https://icu.unicode.org' },
    { name: 'SQLite', version: '3.53.4', license: 'Public domain', source: 'https://sqlite.org' },
    { name: 'c-ares', version: '1.34.8', license: 'MIT', source: 'https://c-ares.org' },
    { name: 'zlib', version: '1.3.2', license: 'Zlib', source: 'https://zlib.net' },
    { name: 'Android Debug Bridge (android-tools)', version: '35.0.2', license: 'Apache-2.0', source: 'https://android.googlesource.com/platform/packages/modules/adb' },
    { name: 'Abseil', version: '20260526.0', license: 'Apache-2.0', source: 'https://abseil.io' },
    { name: 'Protocol Buffers', version: '35.1', license: 'BSD-3-Clause', source: 'https://github.com/protocolbuffers/protobuf' },
    { name: 'Brotli', version: '1.2.0', license: 'MIT', source: 'https://github.com/google/brotli' },
    { name: 'LZ4', version: '1.10.0', license: 'BSD-2-Clause', source: 'https://github.com/lz4/lz4' },
    { name: 'Zstandard', version: '1.5.7', license: 'BSD-3-Clause', source: 'https://github.com/facebook/zstd' },
    { name: 'LLVM libc++ / OpenMP', version: null, license: 'Apache-2.0 WITH LLVM-exception', source: 'https://llvm.org' },
    { name: 'ONNX Runtime', version: null, license: 'MIT', source: 'https://github.com/microsoft/onnxruntime' },
    { name: 'SentencePiece', version: null, license: 'Apache-2.0', source: 'https://github.com/google/sentencepiece' },
    { name: 'openWakeWord — melspectrogram ed embedding', version: '0.5.1', license: 'Apache-2.0 (da confermare)', source: 'https://github.com/dscripka/openWakeWord', note: 'Derivati da google/speech_embedding (Apache-2.0); il README di openWakeWord indica però CC BY-NC-SA 4.0 per tutti i modelli addestrati inclusi.' },
    { name: 'Classificatore della parola «TALOS»', version: null, license: 'Apache-2.0', source: 'https://github.com/livekit/livekit-wakeword', note: 'Addestrato da noi con livekit-wakeword (Apache-2.0).' },
])
