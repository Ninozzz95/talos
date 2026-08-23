# Pocket TTS runtime provenance

TALOS integrates the following upstream projects directly and keeps their
wire/model-specific behavior inside this Android library.

- `kyutai-labs/pocket-tts` v2.1.0, commit
  `058886528d0b6f2f2d4022de2e244a5260729e6e`, MIT. It is the semantic
  reference for text preparation, voice conditioning, autoregressive flow and
  Mimi decoding.
- `KevinAHM/pocket-tts-onnx`, revision
  `58a6d00cf13d239b6748cb0769f35c580a8f606c`, code MIT and exported weights
  CC-BY-4.0. Every runtime file, size and SHA-256 is frozen in
  `app/src/main/assets/voice/pocket-model-manifest.json`.
- `google/sentencepiece` v0.2.2, commit
  `e0cce7d37b065b5140349dbe12c6bcf6192fdd78`, Apache-2.0. CMake fetches this
  exact commit and links only `sentencepiece-static` behind a narrow JNI
  adapter. SentencePiece 0.2.2 itself pins Abseil to tag `20260526.0`.
  `patches/sentencepiece-android-no-symlink.patch` changes only its configure
  step: Windows builds without symlink privilege copy the Abseil include tree
  instead of creating a symbolic link. This is a TALOS modification to the
  upstream CMake file; the adjacent idempotent patch driver makes repeated
  Gradle configuration fail closed if the source is neither pristine nor the
  expected patched form. Tokenizer source and behavior are not modified.
- `libsndfile/libsamplerate` v0.2.2, commit
  `c96f5e3de9c4488f4e6c97f59f5245f22fda22f7`, BSD-2-Clause. CMake fetches
  this exact commit and statically links its supported `samplerate` target.
  TALOS exposes only mono whole-buffer conversion through JNI and selects
  upstream `SRC_SINC_BEST_QUALITY` for the bounded (maximum 20 second) voice
  reference path. The converter source and filter implementation are not
  modified.
- `VolgaGerm/PocketTTS.cpp`, commit
  `e801e7d6c2692121a39e80ae525cb5265174a495`, MIT, was inspected as a mature
  streaming reference. Its binary/runtime is deliberately not linked: it does
  not consume the v2 bundle manifest or Italian BOS, and it would package a
  second ONNX Runtime. TALOS adapts only the bounded generator/decoder pattern.
- `com.microsoft.onnxruntime:onnxruntime-android:1.29.0` is the sole ONNX
  Runtime dependency and shared object in the application.

No upstream server, CLI, plaintext voice cache, or model weight is compiled
into this library. Model activation is external, hash-verified and reversible.
The official Kyutai Hugging Face repository remains gated; official PyTorch
conformance must stay `BLOCKED_AUTH` until owner-authenticated access exists.
