# Dossier ricerca — resilienza OpenRouter e cambio modello nella stessa sessione

Data: 2026-09-01  
Perimetro: Harness desktop; runtime owner esterno consultato in sola lettura.

## Evidenza misurata

La sessione `4f23fd51-00e4-46f0-8574-4fbf58a8b07e` conserva due guasti distinti
nel JSONL reale:

1. Qwen 3.8 Flash termina con `The operation was aborted due to timeout`.
   Il catalogo provider desktop espone `timeoutSeconds: 60`, ma il runtime
   effettivo applica un `AbortSignal.timeout(180_000)` fisso all'intera
   richiesta. Il valore configurato non arriva al trasporto.
2. Dopo il cambio a Gemini 3.7 Flash, sessione e cronologia vengono conservate,
   ma la preferenza `reasoning.effort: "none"` viene trascinata nel turno
   successivo. OpenRouter risponde 400 perché per quell'endpoint il
   ragionamento è obbligatorio.

Quindi il problema non si risolve aumentando un numero: occorrono un timeout
di inattività che riconosca attività SSE, una normalizzazione delle capacità
per modello e una traccia per-turno del modello realmente usato.

## Fonti primarie aggiornate

- OpenRouter Streaming: i commenti SSE `: OPENROUTER PROCESSING` mantengono
  viva la connessione e possono alimentare il feedback UI; gli errori dopo il
  `200` arrivano come eventi SSE e possono essere il primo e unico evento.
  https://openrouter.ai/docs/api_reference/streaming
- `eventsource-parser` 4.1.0 (MIT), parser SSE mantenuto raccomandato dalla
  stessa documentazione OpenRouter: gestisce commenti, framing multilinea,
  chunk parziali e limite di buffer senza duplicare il protocollo in TALOS.
  https://github.com/rexxars/eventsource-parser
- OpenRouter Reasoning Tokens: `GET /api/v1/models` può fornire
  `supported_efforts`, `default_effort`, `default_enabled` e `mandatory`; con
  `mandatory: true` il client non deve inviare `effort: "none"`.
  https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
- OpenRouter Errors: `timeout`, `provider_overloaded` e
  `provider_unavailable` sono categorie distinte da errori di richiesta non
  ritentabili.
  https://openrouter.ai/docs/api_reference/errors-and-debugging
- OpenRouter Provider Routing: fallback provider è già attivo per default,
  ma vale solo quando un modello ha più endpoint. Qwen 3.8 Flash espone oggi
  un solo endpoint Alibaba: il routing non può mascherare questo guasto.
  https://openrouter.ai/docs/guides/routing/provider-selection
- Claude Code Model Configuration: `/model` cambia il modello nella sessione;
  un identificatore non riconosciuto viene rifiutato senza corrompere il
  modello corrente. Il modello effettivo è riportato nell'output strutturato.
  https://code.claude.com/docs/en/model-config
- Hermes CLI: `/model` esegue un hot-swap nella sessione corrente; la sessione
  conserva cronologia completa, tool call e risultati. Il cambio invalida la
  prompt cache e il primo turno successivo può essere più lento.
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/sessions.md

## Decisione upstream

**Adattare dietro un confine TALOS-owned.** Il runtime owner esterno resta
immutato. L'adapter desktop:

- interpreta il timeout provider come limite di inattività, non come durata
  massima totale;
- resetta il limite a ogni byte, incluso il keepalive OpenRouter;
- conserva lo stop esplicito dell'utente;
- ritenta solo prima del primo output visibile, mai dopo output o tool call;
- riconosce errori SSE top-level invece di scartarli;
- normalizza il ragionamento usando le capacità del catalogo;
- registra modello e ragionamento effettivi nel `RunStarted` di ogni turno.

Il framing SSE viene **adottato direttamente** da `eventsource-parser@4.1.0`,
versione e licenza fissate nel lockfile; TALOS possiede soltanto timeout,
retry, policy di duplicazione e mapping degli errori.

**Rifiutato:** aumento cieco dei 180 secondi. Non distingue un provider morto
da un modello lento e riproduce il guasto appena la risposta supera la nuova
soglia.

**Rifiutato:** fallback silenzioso a un altro modello. Violerebbe la verità
della pillola e renderebbe la traccia non auditabile. Un cambio deve essere
esplicito e valere dal turno successivo; il turno già in volo resta sul
modello con cui è partito.

## One-up rispetto ai riferimenti

TALOS conserva la fluidità di `/model` di Claude/Hermes, ma rende la transizione
auditabile per turno: selezione richiesta, modello effettivo, ragionamento,
cronologia e tool trace restano insieme nel JSONL e nella ripresa. Il primo
turno dopo lo switch può perdere la cache, ma non perde contesto né attribuisce
retroattivamente i messaggi storici al nuovo modello.
