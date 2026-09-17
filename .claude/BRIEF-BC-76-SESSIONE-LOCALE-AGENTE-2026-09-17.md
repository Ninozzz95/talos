# Brief — BC-76: una sessione col modello LOCALE deve essere un AGENTE (oggi disegna le chiamate agli attrezzi e non ne esegue nessuna)

> Ordine dell'owner del 17/09/2026: BC-76 viene PRIMA del lavoro sulla velocità del motore locale («approvo il tuo consiglio»).
> Parte DOPO la fusione di PO-27 (tocca `src/session-registry.mjs`, in mano a quel ramo). Un agente Opus 5 **xhigh**; la
> review la faccio IO (regola del 17/09: massimo due subagenti, nessun revisore delegato). Scheda: `.claude/CODA-BUG-CRITICI-2026-09-08.md`, `BC-76`.

## Il difetto (letto da me riga per riga il 17/09, non eseguito con un modello vero)
`src/session-registry.mjs`: `avviaESegui` instrada OGNI sessione con `provider === 'local'` a `eseguiRuntimeLocale` (cerca
`const esecuzione = providerEffettivo === 'local'`). Quella funzione fa UNA `runtime.generateStream({messages, reasoning, …})` —
senza `tools` né `tool_choice` — e su `event.type === 'tool_call'` emette `ToolCallStart` + `ToolCallArgs` e BASTA: nessun
attrezzo eseguito, nessun `ToolCallResult`, nessun messaggio `tool`, nessuna continuazione. ⇒ La chat mostra un'attività mai
avvenuta, e il modello locale non può leggere un file. Trovato dal rapporto della PR bozza #28 dell'owner, che avverte: NON
scrivere un secondo esecutore che scavalchi permessi e hook.

## Cosa esiste GIÀ, ed è metà della cura (verificato il 17/09 col grep e leggendo)
- Il TRASPORTO sa già parlare col motore locale dentro il giro del kernel: `src/model-destination.mjs` (`fonte === 'local'`)
  risolve `local:<modelId>` in `{locale: true, percorso}` — e pretende il motore acceso (`LOCAL_RUNTIME_NOT_READY`);
  `src/runtime-owner-adapter.mjs` (~655-660) spedisce con `dipendenze.chiamaLocale`, che `server.mjs` (~196) cabla su
  `supervisoreLocale.request(...)`: è lì che vive la chiave `--api-key` del llama-server (la destinazione NON la copia: leggi
  il commento, «HTTP 401 in 4 ms» misurato).
- La compattazione di una sessione locale passa già di lì come `local:<modelId>` (`modelloDiSessionePerRete`, fuso in `ba420a95`).
- `tests/kernel-loop-locale-e-stop.test.mjs` prova `talosLavora` e `chiamaConRitenta` con un motore finto.
- L'adattatore `src/local-runtime-llama-server.mjs` (patch della PR #28 applicata in `93650914`) assembla le chiamate native.
⇒ L'ipotesi di lavoro: una sessione locale entra in `avviaSessioneFn` (cioè `talosLavora`) con `modello: 'local:<modelId>'`,
come tutte le altre, e `eseguiRuntimeLocale` smette di essere la strada degli AGENTI. ⛔ È un'ipotesi: VERIFICALA prima.

## Ricerca fatta per questo brief (17/09/2026) — estendila
- llama.cpp `docs/function-calling.md` (https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md) e
  `tools/server/README.md`: le chiamate agli attrezzi in forma OpenAI funzionano SOLO con `--jinja` (usa il template dentro il
  GGUF); senza un template «tool_use» ufficiale può servire `--chat-template-file` o, nel caso peggiore, `--chat-template chatml`;
  modelli dati per funzionanti: Qwen2.5-7B-Instruct, Mistral-Nemo-Instruct-2407, Llama-3.3-70B-Instruct, Granite; l'autoparser
  legge il template per capire se il modello chiama in JSON nativo o a tag.
- ⛔ Regola dell'owner dell'11/09: NESSUN modello predefinito e nessun «consigliato» come cura — ogni euristica vale per un GGUF
  qualunque, letta dal file e misurata. ⇒ Se un GGUF non ha un template che sa chiamare attrezzi, la sessione resta una chat
  onesta e lo DICE; non si forza `chatml` alla cieca.
- ✅ Misurato da me col grep il 17/09: il supervisore lancia GIÀ il server con `--jinja` (`src/llama-server-supervisor.mjs:512`).
  ⇒ Il server sa già leggere le chiamate agli attrezzi: ciò che manca è che qualcuno gliele MANDI (`tools`) e le ESEGUA.

## Le domande a cui rispondere PRIMA di scrivere (con misure, non a tavolino)
1. Il llama-server avviato dal supervisore accetta `tools`/`tool_choice` su `/v1/chat/completions`? Dipende da `--jinja` e dal
   template del modello: leggi come `llama-server-supervisor.mjs` lo lancia e cerca nella documentazione di llama.cpp (function
   calling, `--jinja`, formati supportati) — fonte e data. Se il server non è lanciato con ciò che serve, dillo: è parte della cura.
2. Cosa manda oggi il kernel al fornitore (`chiamaConRitenta`: corpo, `stream`, `tools`)? È compatibile col server locale? La
   finestra: il preambolo di TALOS è ~2.877 token (misura del 10/09: primo token 33,9 s su LFM2, 3,1 s su gemma, contro i 351 ms
   di PocketPal con 25 token). ⛔ Non è questa riga a curare la velocità, ma NON deve peggiorarla in silenzio: misura il primo
   token prima/dopo su un modello finto E dichiara che col modello vero non l'hai misurato.
3. Un modello locale che NON sa chiamare attrezzi (nessun template, modello piccolo): cosa succede? Deve restare una chat che
   funziona, e DIRLO a schermo («questo modello non usa gli attrezzi»), mai attrezzi finti. Guarda cosa fa già
   `local-runtime-probe.mjs`/la qualificazione (`parseToolCalls: false`).
4. Il ripiego `RuntimeFallback` verso OpenRouter (consenso esplicito) oggi vive nel `.catch` di `eseguiRuntimeLocale`: deve
   sopravvivere identico, col suo consenso.
5. Permessi, hook, approvazioni, ricevute, cancello semantico, `!comando`, compattazione, coda dei messaggi, stop: nel giro del
   kernel valgono già — provane DUE con una sessione locale finta (un attrezzo che chiede approvazione; uno stop a metà).
6. Il mobile: ⛔ NON toccare `mobile/`. Ma leggi (sola lettura) come il mobile fa girare l'agente sul motore locale, se lo fa:
   regola dell'owner «si consulta come fa l'altro prima di decidere».

## Vincoli
File tuoi: `src/session-registry.mjs` (l'instradamento e `eseguiRuntimeLocale`), `src/llama-server-supervisor.mjs` SOLO se la
domanda 1 lo richiede, i test. ⛔ Il kernel (`src/kernel/talosHarness.mjs`) si tocca solo se dimostri che serve, e allora
fermati e scrivimelo prima. Mai un secondo esecutore di attrezzi. RED prima (una sessione locale finta il cui modello chiama
`leggi`: oggi nessun `ToolCallResult`), GREEN, al contrario con ripristino per copia e sha256. Prove dalla STRADA VERA (registro
vero, trasporto vero, motore locale FINTO su 127.0.0.1 che risponde in forma OpenAI con `tool_calls`), mai una finta che decide
da sé l'esito. Nessun modello vero, nessuna GPU, mai 4174/4177/9333, `git.exe`, commit in inglese da file senza trailer, niente
`checkout` fra rami, processi lasciati vivi chiusi per PID. Chiusura: `npm run test:kernel`, backend INTERO da solo, conteggi interi.
**Il giro vero lo faccio IO** col motore locale acceso sul 4174, se l'owner ha un modello caricato: dimmi nel rapporto cosa devo
guardare e cosa mi aspetto di vedere.
