/**
 * I componenti NATIVI e i modelli spediti dentro l'APK, con la loro licenza —
 * quelli che né AboutLibraries (Gradle) né license-checker (npm) vedono.
 *
 * Fonti (01/10/2026): `android/app/src/main/jniLibs/PROVENIENZA.md` (adb e
 * librerie da Termux), `PROVENIENZA-PAROLA.md` + README di openWakeWord
 * (letto il 01/10: codice Apache-2.0, modelli addestrati CC BY-NC-SA 4.0),
 * `docs/upstream-provenance.md` (llama.cpp), versioni lette dai binari di
 * Node e delle sue librerie (pacchetti Termux), che dal 14/10/2026 stanno in
 * `android/app/src/main/jniLibs/arm64-v8a/libtalos*.so` col solo RUNPATH e i
 * nomi ritoccati (`jniLibs/PROVENIENZA-NODE.md`).
 *
 * ⛔ Il software Qualcomm NON è qui: ha la sua sezione e le sue condizioni
 * (`npuTerms.ts`, PKLA 2.1 b).
 */
export interface TalosNativeComponent {
    name: string
    version: string | null
    license: string
    source: string
    /**
     * N1 (25/10/2026): la nota a schermo è una CHIAVE del catalogo (`legal.nativeNotes.*`), in inglese e in italiano. Prima era
     * una frase solo italiana scritta qui.
     */
    noteKey?: string
    /**
     * N1-bis (25/10/2026): un nome o un'etichetta di licenza che non è un nome proprio si mostra da una CHIAVE del catalogo
     * (`legal.nativeNames.*`, `legal.licenseLabels.*`), in inglese e in italiano. `name` e `license` restano i dati: `name` è
     * anche la chiave di `scripts/licenze-native/fonti.json` e del testo generato.
     */
    nameKey?: string
    licenseKey?: string
}

export const TALOS_NATIVE_COMPONENTS: readonly TalosNativeComponent[] = Object.freeze([
    { name: 'llama.cpp / ggml', version: 'b11312', license: 'MIT', source: 'https://github.com/ggml-org/llama.cpp' },
    { name: 'Node.js', version: '24.18.0', license: 'MIT', source: 'https://nodejs.org', noteKey: 'legal.nativeNotes.node' },
    { name: 'OpenSSL', version: '3.6.3', license: 'Apache-2.0', source: 'https://www.openssl.org' },
    { name: 'ICU', version: '78.3', license: 'Unicode-3.0', source: 'https://icu.unicode.org' },
    { name: 'SQLite', version: '3.53.4', license: 'Public domain', licenseKey: 'legal.licenseLabels.publicDomain', source: 'https://sqlite.org' },
    { name: 'c-ares', version: '1.34.8', license: 'MIT', source: 'https://c-ares.org' },
    { name: 'zlib', version: '1.3.2', license: 'Zlib', source: 'https://zlib.net' },
    { name: 'Android Debug Bridge (android-tools)', version: '35.0.2', license: 'Apache-2.0', source: 'https://android.googlesource.com/platform/packages/modules/adb' },
    { name: 'Abseil', version: '20260526.0', license: 'Apache-2.0', source: 'https://abseil.io' },
    { name: 'Protocol Buffers', version: '35.1', license: 'BSD-3-Clause', source: 'https://github.com/protocolbuffers/protobuf' },
    { name: 'Brotli', version: '1.2.0', license: 'MIT', source: 'https://github.com/google/brotli' },
    { name: 'LZ4', version: '1.10.0', license: 'BSD-2-Clause', source: 'https://github.com/lz4/lz4' },
    { name: 'Zstandard', version: '1.5.7', license: 'BSD-3-Clause', source: 'https://github.com/facebook/zstd' },
    // N1-ter: `libtaloscxx.so` porta due firme di clang (21.0.0 e 19.0.0): nessuna delle due è LA versione, quindi la si dice
    // nella nota e `version` resta vuota.
    { name: 'LLVM libc++ / OpenMP', version: null, license: 'Apache-2.0 WITH LLVM-exception', source: 'https://llvm.org', noteKey: 'legal.nativeNotes.llvm' },
    // N1-ter: quello della parola di attivazione (`android/app/build.gradle`, onnxruntime-android); la copia dentro sherpa ha la sua nota.
    { name: 'ONNX Runtime', version: '1.29.0', license: 'MIT', source: 'https://github.com/microsoft/onnxruntime' },
    // N1-bis: senza versione dichiarata upstream si mostra il commit fissato in `fonti.json`, corto (7 caratteri).
    // N1-ter: lettore scritto da noi (`TalosSentencePieceModel.kt`); del progetto si usano solo i numeri dei campi.
    { name: 'SentencePiece', version: 'bcd4d8c', license: 'Apache-2.0', source: 'https://github.com/google/sentencepiece', noteKey: 'legal.nativeNotes.sentencePiece' },
    // N12 — riconoscimento vocale locale. Fonti e impronte: `android/app/src/main/jniLibs/PROVENIENZA-ASR.md` (13/10/2026).
    { name: 'sherpa-onnx', version: '1.13.8', license: 'Apache-2.0', source: 'https://github.com/k2-fsa/sherpa-onnx', noteKey: 'legal.nativeNotes.sherpa' },
    { name: 'Silero VAD', version: '066409f', license: 'MIT', source: 'https://github.com/snakers4/silero-vad', noteKey: 'legal.nativeNotes.silero' },
    { name: 'NVIDIA Parakeet TDT 0.6B v3', version: null, license: 'CC-BY-4.0', source: 'https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3', noteKey: 'legal.nativeNotes.parakeet' },
    { name: 'openWakeWord — melspectrogram ed embedding', nameKey: 'legal.nativeNames.openWakeWord', version: '0.5.1', license: 'Apache-2.0', licenseKey: 'legal.licenseLabels.apache2ToConfirm', source: 'https://github.com/dscripka/openWakeWord', noteKey: 'legal.nativeNotes.openWakeWord' },
    // Controllo remoto (20/10/2026): fonti e impronte in `android/app/src/main/jniLibs/PROVENIENZA-IROH.md`.
    // F (24/10/2026): questa voce copre anche `android/app/src/main/java/computer/iroh/IrohAndroid.kt`, copiata invariata da
    // iroh-ffi v1.1.0 (`5e45109`, `kotlin/android/…/IrohAndroid.kt`): stesso progetto, stessa licenza (MIT OR Apache-2.0,
    // © 2025 N0, INC.), stessa fonte. Per questo la dicitura a schermo resta quella (nessuna parola nuova da tradurre).
    { name: 'iroh (iroh-ffi)', version: '1.1.0', license: 'MIT OR Apache-2.0', source: 'https://github.com/n0-computer/iroh-ffi', noteKey: 'legal.nativeNotes.iroh' },
    { name: 'Classificatore della parola «TALOS»', nameKey: 'legal.nativeNames.talosWakeWord', version: 'cdb82b8', license: 'Apache-2.0', source: 'https://github.com/livekit/livekit-wakeword', noteKey: 'legal.nativeNotes.talosWakeWord' },
])
