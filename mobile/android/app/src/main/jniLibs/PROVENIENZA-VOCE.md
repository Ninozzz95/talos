# Provenienza del motore della PAROLA DI ATTIVAZIONE

> ⛔⛔ **ANCHE QUESTI NON LI ABBIAMO SCRITTI NOI**, e stanno dentro un APK
> firmato da Antonino Rizzo. A differenza del ponte `adb` (compito **#47**) qui
> non c'è nessun debito da riscattare: sherpa-onnx è software libero
> (Apache-2.0) e la sua presenza è una scelta, non una scorciatoia.
>
> Vale però la stessa disciplina: **niente binari nella repo**, tutto scaricato
> e verificato a OGNI compilazione. Se domani k2-fsa ripubblica un pacchetto
> diverso con lo stesso nome, la build si ferma qui — non se ne accorge nessuno
> sei mesi dopo.

## Perché esiste

Owner 2026-08-11, e con una ragione precisa: «su ColorOS cinese non c'è un modo
per mappare i gesti per l'assistente». Su quella ROM la barra di TALOS **non ha
nessuna porta** che si possa assegnare a un gesto — quindi o si chiama con la
voce, o non si chiama.

Android una porta sua ce l'avrebbe (`createAlwaysOnHotwordDetector`), ma vuole un
modello di parola **già registrato nel DSP**, e gli unici registrati sono quelli
di Google. Per una parola nostra non è raggiungibile. ⇒ Il riconoscitore della
parola ce lo portiamo noi.

## ⛔ Il conto vero, misurato e non stimato

La documentazione di sherpa-onnx dichiara «~15 MB + ~3.7 MB». **È vecchia.**
Scaricati e pesati l'11 agosto 2026:

| variante | file su arm64-v8a | peso |
|---|---|---|
| `android-static-link-onnxruntime` | **1**: `libsherpa-onnx-jni.so` | **23,6 MB** |
| `android` (normale) | 2: `libonnxruntime.so` + `libsherpa-onnx-jni.so` | 26,5 MB |

⇒ Si spedisce la variante **statica**: un file invece di due, e 3 MB in meno.
Col modello int8 (5,50 MB) il totale aggiunto all'APK è **~29 MB**.

## I due pacchetti

| pacchetto | fonte | impronta SHA-256 |
| --- | --- | --- |
| motore | [sherpa-onnx-v1.13.5-android-static-link-onnxruntime.tar.bz2](https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.5/sherpa-onnx-v1.13.5-android-static-link-onnxruntime.tar.bz2) | `e74386d7f273d180c67b1a6ec5d864d828721caac504ef851c30083d0196fe74` |
| modello | [sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2](https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2) | `f170013b4716e41b62b9bfd809687c207cef798ef9bc6534d524e17af9b6561a` |

## Cosa entra nell'APK, e con che impronta

⛔ Del modello si prende **solo la qualità int8**: il pacchetto contiene anche i
pesi a piena precisione, che pesano il triplo e per una parola sola non servono.
E si lasciano fuori i `test_wavs`.

| file nell'APK | dentro il pacchetto | impronta SHA-256 |
| --- | --- | --- |
| `libsherpa-onnx-jni.so` | motore | `b772dd05e1f62733d5faceb7b2e2c896d1d18c9c84fee7dccddc63dd4dda6405` |
| `kws/encoder.int8.onnx` | modello | `1e721676515bcd42a186979733981213c66c80db680e1cc582dfedf3be76e678` |
| `kws/decoder.int8.onnx` | modello | `e40ff43297abe815e8898494c17e71bba2152d9d40fa3eb803f75d0f7533329a` |
| `kws/joiner.int8.onnx` | modello | `eae9da0c7e1e6c6a3f4cc42d167899c388f6c6701b94cb96320e4f55df79624c` |
| `kws/tokens.txt` | modello | `fd2ded4050a55d2b1578870ba8697d02371980217806b7558bd0a5cc60f3ba53` |
| `kws/bpe.model` | modello | `c8a2a0129c4ab8e463164c142f82d25649661b122c8cd0b7aab5c9e80b90ad24` |

### I nomi veri dentro il pacchetto

I file del modello hanno nomi che raccontano l'addestramento
(`encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx`). Nell'APK entrano coi nomi
corti qui sopra: chi legge il codice non deve sapere a che epoca è stato salvato
un peso.

| nome nell'APK | nome dentro il pacchetto |
| --- | --- |
| `kws/encoder.int8.onnx` | `encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx` |
| `kws/decoder.int8.onnx` | `decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx` |
| `kws/joiner.int8.onnx` | `joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx` |

## Le fonti Kotlin

⛔ **Neanche queste stanno nella repo.** Sono l'interfaccia Kotlin verso il
`.so`, si scaricano e si verificano come tutto il resto, e finiscono in una
cartella generata. La repo resta nostra.

⛔ E stanno in `sherpa-onnx/kotlin-api/`, non nell'esempio Android: là dentro
sono **collegamenti simbolici**, e scaricarli da lì dà un file di 70 byte con
scritto un percorso. Costa un giro capirlo, quindi è scritto qui.

Base: `https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/v1.13.5/sherpa-onnx/kotlin-api/`

| file | impronta SHA-256 |
| --- | --- |
| `KeywordSpotter.kt` | `6d8387534b942a979424a1d6721fd285f85df8bfca0ea392860f11fe06f31d06` |
| `OnlineRecognizer.kt` | `3204ff816361d99d94dda1e8c26681f6d4a5ad749a68d8fee93b4e8bb2b21d17` |
| `OnlineStream.kt` | `6b9f8de317e6a0bb51f0f29d940617b781cb31b190e1c725dd438231836c06ab` |
| `FeatureConfig.kt` | `829c7adc4db1324f21b9a9cbf5bf10eacf759714fe50956f48317c1ffef044f6` |
| `HomophoneReplacerConfig.kt` | `fe926b6413f4d87e67c41feb21b8363923a67cbd3a5eb687b76390a5f1f7db60` |
| `QnnConfig.kt` | `86c963f27677f690eb0d6639735052eba5e60d9f81ccd4c1df0aa831fd680d6f` |

`KeywordSpotter.kt` da solo non basta: tira dentro `OnlineModelConfig` (che vive
in `OnlineRecognizer.kt`), `FeatureConfig` e `OnlineStream`; le altre due
completano quelle.

## ⭐ La parola, e perché funziona

Il modello riconosce parole scritte come **token BPE**, non come lettere.
Verificato l'11 agosto col `bpe.model` vero di questo pacchetto:

```
HEY TALOS  ->  ▁HE Y ▁TA LO S      tutti i token esistono in tokens.txt
TALOS      ->  ▁TA LO S            idem
HEY SIRI   ->  ▁HE Y ▁S I RI       l'esempio ufficiale, stessa forma
```

⇒ «hey TALOS» ha **la stessa struttura della parola di riferimento del modello**:
cinque token, nessuno inventato. Non è un caso limite.

⛔ La scomposizione **non si indovina**: una nota precedente diceva `▁T AL OS`
ed era sbagliata. Si chiede a `sentencepiece` col `bpe.model` di QUESTO modello,
perché cambia da modello a modello.

## Licenza

sherpa-onnx è Apache-2.0 (k2-fsa). I modelli KWS sono pubblicati dallo stesso
progetto nella pagina dei rilasci `kws-models`.
