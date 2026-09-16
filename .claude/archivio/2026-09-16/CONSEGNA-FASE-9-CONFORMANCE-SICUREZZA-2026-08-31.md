# Consegna fase 9 — conformance, performance e sicurezza

## Risultato

La parte automatizzabile della fase 9 è stata chiusa. I tre percorsi di
runtime locali usano lo stesso contratto di stream: ragionamento, risposta,
tool call, errore e fine sono eventi distinti. Un output corrotto non diventa
testo normale e il cancel non attiva fallback cloud.

Sono stati aggiunti anche i controlli di sicurezza: server loopback-only,
manifest con traversal rifiutati, nessuna API key o path assoluto nel payload
esposto al browser e stop del processo senza orfani.

## File creati/modificati

- `harness-ui/tests/local-runtime-conformance.test.mjs`
- `harness-ui/scripts/qa-visual-pipeline.mjs`
- `.claude/LEDGER-FASE-9-CONFORMANCE-SICUREZZA-2026-08-31.md`
- questo documento

## Verifiche eseguite

- Conformance + sicurezza: **11/11 pass**.
- Adapter/supervisor regressioni: **20/20 pass**.
- Suite desktop completa: **1048/1048 pass**.
- Porte reali Ollama `11434` e LM Studio `1234`: non installate o non
  raggiungibili; registrato come `not installed`, senza simulare un pass.
- Scenario CDP `qa-model-lab-runtime-security` eseguito a 1440×900 e
  1024×800, con quattro screenshot completi, zero eccezioni JavaScript e
  zero richieste HTTP fallite; segreti/path verificati assenti.

La matrice CDP non è ancora stata eseguita in questa fase: richiede il gate
visivo dedicato e l'ispezione manuale di ogni screenshot. Anche il benchmark
di cold start, warm start, TTFT, tok/s, RAM/VRAM resta sospeso finché non è
disponibile il binario llama.cpp pinato.

## Decisione upstream

Sono stati confrontati i contratti ufficiali: llama.cpp espone `/health`,
`/v1/models` e chat completions SSE; LM Studio raccomanda REST v1 con lifecycle
load/unload; Ollama usa `/api/tags` e NDJSON `/api/chat`. TALOS li adatta dietro
adapter propri, mantenendo provider/runtime/model identificati e fallback
esplicito. Per la sicurezza sono state applicate le raccomandazioni OWASP su
loopback, URL/path normalizzati e segreti server-side.

Fonti: [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), [LM Studio REST API](https://lmstudio.ai/docs/developer/rest), [LM Studio load](https://lmstudio.ai/docs/developer/rest/load), [OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

## Confronto competitivo

Hermes è più forte nel routing provider centralizzato; Ollama nella semplicità
operativa; LM Studio nel lifecycle esplicito; Claude/Codex nella separazione
tra reasoning e risposta. Il vantaggio TALOS è il gate osservabile: nessun
runtime viene dichiarato pronto senza dati, e ogni errore/cancel rimane
tipizzato e verificabile.

## Stato e rollback

- Operativo: fixture, adapter contract, cancel, error handling e security gates.
- Gated: runtime reale, import Hugging Face e misure performance.
- Chiuso: CDP visuale e screenshot 1440×900/1024×800 per lo stato gated.
- Aperto: prova visuale con runtime realmente installato e misure performance.
- Nessun commit e nessun push eseguiti.

Rollback atomico: rimuovere `harness-ui/tests/local-runtime-conformance.test.mjs`
e lo scenario `qa-model-lab-runtime-security`; i moduli runtime delle fasi
precedenti restano intatti.
