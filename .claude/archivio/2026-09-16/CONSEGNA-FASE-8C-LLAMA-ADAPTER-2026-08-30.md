# Consegna Fase 8C — adapter llama-server e stream desktop

## Stato

**Completata.** L’API llama-server è ora traducibile nel contratto TALOS,
compreso lo streaming separato di testo, reasoning e tool-call.

## Risultato

- Probe proprietà e lista modelli reali tramite `/v1/props` e `/v1/models`.
- Stream SSE robusto anche quando le righe arrivano spezzate.
- Envelope sequenziale con `runId`, `turnId`, `runtimeId`, `seq`, `at`.
- Reasoning e testo rimangono canali diversi.
- Tool-call JSON valida produce un evento strutturato; JSON malformato viene
  rifiutato.
- `<think>` e `<tool_call>` non vengono mostrati come testo.
- Errori HTTP e abort sono controllati.
- Load/unload/cancel delegano ai componenti corretti.

## Verifica

- RED osservato prima del codice.
- Test mirati: **5/5 passati**.
- Suite completa Harness: **1001/1001 passati**.
- Sintassi e `git diff --check`: puliti.
- Nessuna verifica visiva: nessuna UI modificata.

## Limiti dichiarati

Il binario llama.cpp non è stato avviato: il gate reale resta nel Task 9. Questo
adapter non esegue tool e non effettua fallback cloud; quelle decisioni restano
nel kernel TALOS e nel task di integrazione sessioni.

## Riassunto semplice

Abbiamo collegato il linguaggio del motore locale a quello di TALOS. Durante una
risposta, il testo, il ragionamento interno e le richieste di tool viaggiano
separati e ordinati; se il motore manda dati rotti o nascosti, l’adapter li
blocca invece di mostrarli o eseguirli per errore.
