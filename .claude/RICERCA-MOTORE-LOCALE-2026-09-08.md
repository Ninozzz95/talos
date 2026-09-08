# Motore locale — ricognizione tecnica 08/09/2026

Ricerca delegata a ricerca_motore_locale (Astra xhigh, sola lettura), revisione e diagnosi del principale. Non è un benchmark: nessun punteggio competitivo è stato misurato. La capacità del runtime di offrire strumenti non dimostra che ogni modello sappia usarli.

## Incidente verificato sullo storico

Sessione `8407d564-f7a0-4e4c-b737-ca5851046a50`: snapshot iniziale sano; dal secondo snapshot una chiamata elenca contiene soltanto `{`. Rimane nei tre follow-up falliti, senza nuova generazione utile. Il kernel corrente normalizza nuove risposte, mentre session-registry.resume riusa questi snapshot. Il difetto può quindi sopravvivere a una correzione del parser per i turni nuovi.

Il principale ha aperto [llama.cpp #25510](https://github.com/ggml-org/llama.cpp/issues/25510), 10/07/2026: storico con JSON incompleto produce HTTP500 prima della generazione. La riproduzione upstream usa un altro backend/modello; la corrispondenza con TALOS è sostenuta anche dal JSON locale effettivo, non solo dal testo dell'issue. [PR #25583](https://github.com/ggml-org/llama.cpp/pull/25583) resta aperta: cambiare 500 in 400 non recupera il contesto.

## Riferimenti fissati dall'agente

| Componente | Revisione consultata | Limite |
|---|---|---|
| llama.cpp default TALOS | b10517, `dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`, 20/08/2026 | Directory e default non attestano da soli hash del binario attivo. |
| llama.cpp stable | v0.4.0, `5266f24da75dc449bd56cbed7addb9c8e4a6a73e`, 04/09/2026 | Commit del tag, non target_commitish della release. |
| Hermes | v2026.9.7, `2237be355906fbe6065ce1815711eee52b2d646e`, 07/09/2026 | Codice config_defaults indica b10679; esempio della documentazione cita b10362. |
| Ollama | v0.33.3, `b79067b0db7417f20108363bc22adb97f35c966a`, 02/09/2026 | Nessuna prova hardware locale svolta nell'incarico. |

[Release llama.cpp v0.4.0](https://github.com/ggml-org/llama.cpp/releases/tag/v0.4.0): cambiamenti a KV/stato, preserve_reasoning e prefill richiedono qualificazione; il parser dello storico mantiene il caso d'errore. Nessun upgrade scelto come cura automatica.

## Confronto funzionale documentato

- [llama.cpp function calling b10517](https://github.com/ggml-org/llama.cpp/blob/b10517/docs/function-calling.md): template nativi e fallback non sono equivalenti; il supporto dipende dalla famiglia. [Grammatiche](https://github.com/ggml-org/llama.cpp/blob/b10517/grammars/README.md): JSON Schema supportato parzialmente, validazione host comunque necessaria.
- [Server b10517](https://github.com/ggml-org/llama.cpp/blob/b10517/tools/server/README.md): health, metriche, cache_prompt e slot KV sono utili, ma distinti da persistenza conversazionale e successo di un compito. Separare tempi freddi/caldi, caricamento, prefill e generazione.
- [NVIDIA Nemotron Cascade 2](https://huggingface.co/nvidia/Nemotron-Cascade-2-30B-A3B/blob/6327cdbcf907e1c7cec9cb29fb6e6cebdf8feaf7/README.md), aggiornamento 09/07: documenta nano_v3 reasoning e qwen3_coder tool parser per vLLM. Non trasferire automaticamente quei parametri a llama.cpp; identificare template e revisione GGUF reali.
- [Hermes local models](https://github.com/NousResearch/hermes-agent/blob/v2026.9.7/website/docs/user-guide/local-models.md): selezione hardware, stima memoria, modelli curati/community e scaricamento per inattività. Sono riferimenti implementabili, non superiorità misurata.
- [Hermes session storage](https://github.com/NousResearch/hermes-agent/blob/v2026.9.7/website/docs/developer-guide/session-storage.md): persistenza SQLite, lineage e metadati separati dal contenuto API; conserva archivi e identità della sessione. Adattare la separazione evidenza/contesto al JSONL append-only TALOS già presente, senza migrazione SQLite per un bug locale.
- [Hermes compressione](https://github.com/NousResearch/hermes-agent/blob/v2026.9.7/website/docs/developer-guide/context-compression-and-caching.md) e [tool search](https://github.com/NousResearch/hermes-agent/blob/v2026.9.7/website/docs/user-guide/features/tool-search.md): gruppi call/result e controllo del costo del catalogo. Ricerca differita riduce contesto iniziale ma aggiunge decisioni/chiamate e può indebolire la validazione nativa; nessuna scelta automatica.
- Ollama [show](https://docs.ollama.com/api-reference/show-model-details), [tool](https://docs.ollama.com/capabilities/tool-calling), [thinking](https://docs.ollama.com/capabilities/thinking): capability/template per modello; non basta elencare i nomi da /api/tags. Metadati dichiarati vanno distinti dalle prove riuscite.
- LM Studio [matrice API](https://lmstudio.ai/docs/developer/rest), [streaming](https://lmstudio.ai/docs/developer/rest/streaming-events), [tools](https://lmstudio.ai/docs/developer/openai-compat/tools): endpoint differenti per stato/tool; aggregazione delta per indice, id/nome non ripetuti necessariamente. Non esiste un endpoint superset universale.
- [Codex App Server](https://learn.chatgpt.com/docs/app-server) e [Claude Agent SDK sessioni](https://code.claude.com/docs/en/agent-sdk/sessions): sessione, turno, interruzione e stato filesystem sono concetti distinti. Ripresa del transcript non equivale a ripristino delle azioni esterne.

## Lacune statiche TALOS da qualificare

1. Chat principale: runtime-owner-adapter.creaFetchMultiProvider → kernel. Model Lab/probe: local-runtime-llama-server.generateStream. Non attribuire il difetto di un percorso all'altro.
2. local-runtime-probe.qualify usa «Reply with OK.», senza ciclo tool reale. Qualified non prova esecuzione, risultato, follow-up o cancel. TTFT include reasoning.
3. generateStream ausiliario non riceve tools e aggrega id oppure indice; frammenti successivi senza id possono divergere. Conformance esistente simulata, gate Qwen remoto opt-in: non sono test Nemotron locale.
4. Supervisor: loopback e chiave casuale sono basi positive; stop e fine-stream richiedono verifica di processo davvero terminato/esito autorevole.
5. Default contesto GPU 16k e soglia agent-fit 64k sono politiche diverse. 64k non è una legge universale degli agenti. Nessun valore cambiato senza decisione dell'owner.
6. Manifest binario validato dal modulo dedicato ma integrazione produttiva non trovata dall'agente. Prima di benchmark servono hash binario/GGUF/template e backend effettivi.

## Prove da svolgere, non risultati

Stesso GGUF: richiesta diretta vs TALOS per isolare adapter e storico. Stessi compiti/tool TALOS: locale vs API per misurare parità offerta, dichiarando il cambio di modello. Stesso modello/risorse contro Hermes per confrontare host; prompt diversi non isolano il solo motore. AVM ON/OFF mantiene identici prompt, modello, contesto, evaluator e log.

Casi: tool semplici/annidati, delta frammentati, JSON troncato, più chiamate, loop, follow-up naturale, stop/resume/reload, contesto pieno e risultati effettivi su disco. Conservare richieste/delta/esiti, fallimenti e timeout; p50/p95, primo reasoning e primo testo separati. [BFCL](https://gorilla.cs.berkeley.edu/leaderboard.html) è un riferimento più vecchio ancora utile; [Harbor](https://www.harborframework.com/docs/agents) e [Terminal-Bench](https://www.tbench.ai/news/leaderboard-integrity-update) richiedono condizioni e traiettorie ripetibili. Non sono prove già lanciate da TALOS.

**Cosa deve fare l'owner:** recupero nella stessa sessione già deciso; scelte sull'overhaul verranno proposte con evidenze. **Cosa faccio io dopo:** correggere il recupero e verificare il ciclo reale. **Cosa rimane:** qualificazione, benchmark e decisioni dell'engine; nessuna promessa «qualunque modello perfetto».

## Riscontri locali successivi alla ricerca, 08/09

Il recupero JSON è implementato e verificato sul runtime b10517 reale. Una prova controllata dal composer ricorda un nome nello storico e, dopo reload, legge un file mediante tool e ne riporta il codice esatto. Non è un benchmark, né copertura di tutti i modelli o strumenti. Prove e limiti: `.claude/LEDGER-RECUPERO-LOCALE-2026-09-08.md`.

Sul clone della chat owner emerge invece saturazione: 30.821 token contro 16.384. Contiene 397 chiamate `elenca` identiche valide, una incompleta, 398 esiti identici. La riduzione tracciata delle ripetizioni è una possibile strategia da sottoporre all'owner, non una soluzione già approvata o implementata. L'aumento a 32.768 non passa la stima corrente di memoria. Il metodo `compatta` attuale sceglie il modello globale e non persiste la nuova storia: richiede revisione prima di poter servire il recupero locale con garanzie di routing e reload.
