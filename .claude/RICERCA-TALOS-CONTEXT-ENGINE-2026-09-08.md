# Ricerca TCEC — 2026-09-08

Riletture dirette HTTPS 200 il 2026-09-09 (il tool web aveva restituito token_revoked; nessuna credenziale impiegata): Node globals https://nodejs.org/api/globals.html e transazioni SQLite https://www.sqlite.org/lang_transaction.html alle 06:42 UTC; llama.cpp b10517 README fissato https://raw.githubusercontent.com/ggml-org/llama.cpp/dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe/tools/server/README.md alle 06:49 UTC; https://openrouter.ai/docs/guides/features/message-transforms e https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text alle 06:53 UTC. Adozione dei campi/protocolli e SDK esistenti tramite adattatore: riserva risposta esplicita, transforms disattivati nel riassuntore OpenRouter, maxRetries 0 gia presente nel native adapter. Fonti attestano i contratti, non qualifica del prodotto o migliori prestazioni.
Consultazione rinnovata prima della fase 0: 2026-09-08 UTC. Non sono prove di prestazione TALOS.
## Decisioni upstream
- SQLite: adozione node:sqlite in worker; Node 24.18.0, SQLite 3.53.1 e FTS5 verificati in memoria. Transazioni WAL/FULL, backup API. https://www.sqlite.org/atomiccommit.html https://www.sqlite.org/wal.html https://www.sqlite.org/backup.html https://nodejs.org/api/sqlite.html
- Zod 4.5.4: schema unico per confini, API pubblica; https://zod.dev/api
- sqlite-vec 0.1.9, MIT OR Apache, adattatore Node; binario Windows da provare. https://alexgarcia.xyz/sqlite-vec/js.html
  integrity sha512-L7XJWRIBNvR9O5+vh1FQ+IGkh/3D2AzVksW5gdtk28m78Hy8skFD0pqReKH1Yp0/BUKRGcffgKvyO/EON5JXpA==
- Qwen/Qwen3-Embedding-0.6B-GGUF revisione 370f27d7550e0def9b39c1f16d3fbaa13aa67728, Apache2, candidato Q8_0 639150592 byte, SHA256 06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439. https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF
- llama.cpp b10517 dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe: runtime adottato, embedding --pooling last; /v1/chat/completions/input_tokens e /v1/embeddings documentati. https://github.com/ggml-org/llama.cpp/blob/dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe/tools/server/README.md
- RTK 0.44.2, Apache2, 700bdde3343299ea06bbca18dc6670a80c88b289: adottare pipe --filter su stdin catturato, limite10MiB UTF8, exit filtro separato comando, filtri qualificati espliciti. Non usare wrapper che rieseguono. https://github.com/rtk-ai/rtk/blob/700bdde3343299ea06bbca18dc6670a80c88b289/src/cmds/system/pipe_cmd.rs
- SDK già presenti ai7.0.93/openai4.0.61/anthropic4.0.49/google4.0.64: riuso API pubbliche, nessun import privato per contatori.
## Provider e protocolli
- OpenAI Responses input_tokens: https://developers.openai.com/api/docs/guides/token-counting ; compaction opaca/portabilità limitata https://developers.openai.com/api/docs/guides/compaction
- Anthropic count_tokens descritto come stima: https://platform.claude.com/docs/en/build-with-claude/token-counting ; cambi prefisso invalidano thinking in modelli nuovi, nessuna firma inventata https://platform.claude.com/docs/en/build-with-claude/preserved-thinking
- Gemini distinguere generateContent da Interactions: https://ai.google.dev/gemini-api/docs/thinking (aggiornato04Sep2026), https://ai.google.dev/gemini-api/docs/tokens
- OpenRouter plugin context-compression va disabilitato nel percorso TALOS; nessun contatore preflight trovato: https://openrouter.ai/docs/guides/features/message-transforms
- Tool search native SDK disponibili, da qualificare: https://developers.openai.com/api/docs/guides/tools-tool-search ; https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool
## Riferimenti, non dipendenze produttive
- Pi0.85.1 d981de1229ef899957bbe968bc8dcda02a21f477: default riserva inadatto16k, sintesi vuota da validare; banco conservato.
- Hermes v2026.9.7 / LCM8d1b1e6: banco conservato, host16k incompatibile con requisito64k; non importare framework completo.
- Codex f419c3214ab84ce6305c86f5e8f1b34475f1c611: checkpoint e cancellazione come riferimento, taglio oldest su overflow e cap20k user non adatti a questa finestra. https://github.com/openai/codex/blob/f419c3214ab84ce6305c86f5e8f1b34475f1c611/codex-rs/core/src/compact.rs
- The Compaction Cliff 24Aug2026 https://arxiv.org/abs/2608.22752 : spunto per conservazione tipizzata e test, non soluzione produttiva già certificata.
## Osservazioni locali vincolanti
Aggiornamento 2026-09-09: https://openrouter.ai/docs/guides/features/message-transforms riletta tramite web. Contratto corrente plugins:[{id:'context-compression',enabled:false}] per disabilitare rimozione/troncamento dei messaggi. Implementato nell'adapter desktop TCEC e nel corpo di conteggio. transforms:[] storico resta nella sintesi, ma non viene piu trattato come prova sufficiente. Nessuna dipendenza aggiunta; serializzazione nativa dagli SDK pubblici gia fissati, trasformazioni shell/reasoning riusate dal runtime esistente. Verifica su trasporti controllati, gate account reale ancora aperto.

Kernel manca callback asincrona messaggio/checkpoint; String(esito).slice(0,8000) prima del risultato persistito; manuale non persiste versione e usa modello globale; mutazioni in-place possono invalidare prefix. Registro JSONL coda corrotta e append da proteggere.
43 descrizioni strumenti: 29972 caratteri, circa7494 token euristici, NON conteggio runtime. Auto compaction ogni8giri non risolve preflight di una ripresa fuori limite.
