# Provenienza del riconoscimento vocale locale (N12)

> ⛔ **Questi file non li abbiamo scritti noi e non stanno nella repo.** Li mette nella build il compito
> `preparaAsrLocale` (`app/build.gradle`), scaricandoli dalla fonte ufficiale e verificando peso e impronta di ognuno.
> Se un file cambia sotto i piedi, la build si ferma.

Motore: **sherpa-onnx** `v1.13.8` (k2-fsa, Apache-2.0), tag `11afbd009a7f8c08f4bcf2fc1b265d0df4670fbf`, rilascio del 10/09/2026.
Fatti misurati il 13/10/2026 dall'API di GitHub (campo `digest` degli allegati) e ricalcolati sui file scaricati.

## Perché la variante col runtime dentro

La libreria JNI «normale» (`sherpa-onnx-v1.13.8-android.tar.bz2`) si aggancia a `libonnxruntime.so` **1.28.2** con simboli
versionati (`VERS_1.28.2`). L'app porta già `libonnxruntime.so` **1.29.0** (Maven, per la parola di attivazione): stesso nome,
versione diversa, non condivisibili — verificato leggendo i binari il 13/10/2026. La variante ufficiale
`android-static-link-onnxruntime` ha il runtime dentro la sua unica libreria e non tocca quello della parola di attivazione.
Costo: 24.169.352 byte in più fra le librerie native. Decisione dell'owner del 13/10/2026.

## Archivio

Archivio: `https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-v1.13.8-android-static-link-onnxruntime.tar.bz2`

| archivio | byte | sha256 |
|---|---|---|
| `sherpa-onnx-v1.13.8-android-static-link-onnxruntime.tar.bz2` | 35101751 | `7583ca385ae7d981e65468455c2ea2c9f2da383921dccfc5658d0dc19d309e6f` |

## Libreria nativa (dall'archivio, una sola architettura)

| libreria | byte | sha256 |
|---|---|---|
| `jniLibs/arm64-v8a/libsherpa-onnx-jni.so` | 24169352 | `b4a53d915c19cb6d09b1cdc9a8084be54419b647aab9097ffdfb46f30c3c4dd8` |

## Interfaccia Kotlin ufficiale (copiata invariata, compilata con noi)

Base Kotlin: `https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/v1.13.8/sherpa-onnx/kotlin-api/`

| sorgente | byte | sha256 |
|---|---|---|
| `kotlin/FeatureConfig.kt` | 301 | `829c7adc4db1324f21b9a9cbf5bf10eacf759714fe50956f48317c1ffef044f6` |
| `kotlin/HomophoneReplacerConfig.kt` | 170 | `fe926b6413f4d87e67c41feb21b8363923a67cbd3a5eb687b76390a5f1f7db60` |
| `kotlin/QnnConfig.kt` | 156 | `86c963f27677f690eb0d6639735052eba5e60d9f81ccd4c1df0aa831fd680d6f` |
| `kotlin/OfflineStream.kt` | 1080 | `5c90b7c060cdd0a2222cc935b54f69465a4a7544de29240bafe4d3a8d86dbb6e` |
| `kotlin/OfflineRecognizer.kt` | 56380 | `85054fa9722913bce96c94c5c7eaaa7fd99606b79fbfbeac6cfb60040eae2164` |
| `kotlin/Vad.kt` | 4112 | `dc3fe3b63cea2becd4780a9cc8ef2aaee552eed9533d4c0f178db1172a53662c` |
| `kotlin/WaveReader.kt` | 1416 | `1b4abcf6c7afdb6e8cc4cd4a71098eec4b45c473b470c71671fd20b641aee8e7` |
| `kotlin/VersionInfo.kt` | 627 | `8a9ada883d8cb802b4e70cc6770af20f4b7d85935a16b0b71974d22d55d0c90a` |

## Modello delle pause (VAD), dentro l'APK

Base VAD: `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/`

| modello | byte | sha256 |
|---|---|---|
| `asr/silero_vad.onnx` | 643854 | `9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6` |

Silero VAD: licenza MIT.

## Il modello del riconoscimento NON è qui

Parakeet TDT 0.6B v3 int8 (CC-BY-4.0, NVIDIA), circa 670 MB, si scarica al primo uso dal telefono. I suoi quattro file,
con revisione, pesi e impronte, sono fissati in `mobile/src/lib/voice/modelloParakeet.ts`.
