# Consegna Fase 8C — probe runtime locale e fit — 2026-08-31

## Esito

Fase 4 completata. TALOS desktop possiede ora il contratto che decide, prima
della qualifica, se un modello GGUF è leggibile, se entra in disco/RAM, quale
contesto effettivo espone e se il template osservato è adatto al profilo agente.
Nessun modello viene avviato automaticamente e nessun dato mancante viene
inventato.

## File prodotti

- `harness-ui/src/local-runtime-probe.mjs`
- `harness-ui/tests/local-runtime-probe.test.mjs`
- `.claude/LEDGER-FASE-8C-LOCAL-RUNTIME-PROBE-2026-08-31.md`
- `.claude/CONSEGNA-FASE-8C-LOCAL-RUNTIME-PROBE-2026-08-31.md`

Aggiornato:

- `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md` — Task 4.

## Cosa è operativo

- Header normalizzato: accetta solo `GGUF`, versione 3 e misure positive.
- Contesto: distingue quello dichiarato dal modello da quello osservato nel
  runtime; l’effettivo è il minore dei due.
- Capability: tools, tool-call e system role sono abilitabili solo quando
  `/props.chat_template_caps` li osserva esplicitamente.
- Fit fail-closed nell’ordine disco, RAM, contesto, capability.
- Profilo agente sotto 65.536 token: `chat-only`; richiesta oltre il contesto:
  `blocked`; misura mancante: `unknown`.
- Qualifica: parte soltanto con consenso esplicito, misura TTFT e legge tok/s
  dalla metrica ufficiale quando presente; altrimenti tok/s resta unknown.
- Il sorgente Jinja, il path assoluto e altri dettagli sensibili non entrano nel
  risultato del probe.

## Verifica

- RED: `rtk node --test tests/local-runtime-probe.test.mjs` → modulo assente.
- GREEN mirato: **8/8**.
- Sintassi: `rtk node --check src/local-runtime-probe.mjs` → pass.
- Suite completa: `rtk node --test tests/*.test.mjs` → **1009/1009**.
- `rtk git diff --check` → pass.

Scenari permanenti: header illeggibile/invalido, template senza tools,
capability sconosciute, contesto sotto 64K, disco/RAM insufficienti,
backend/termica sconosciuti, consenso negato e metrica tok/s osservata.

## Upstream e confronto

- llama.cpp `gguf.h`: magic `GGUF`, versione corrente 3.
- llama.cpp `GET /props`: contesto, template e capability effettive.
- llama.cpp `/metrics`: `llamacpp:predicted_tokens_seconds`.
- Hugging Face documenta `@huggingface/gguf`; non è stato aggiunto ora perché il
  Task 5 deve scegliere e pinare una sola integrazione per import/cache.
- Hermes mantiene semplice la scelta del provider; TALOS aggiunge il vantaggio
  decisivo per uno strumento desktop: provenienza osservata/dichiarata/unknown,
  fit separato e consenso prima della misura attiva.

Pin verificato in sola lettura:
`dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`.

## Limiti dichiarati

- `readHeader` è ancora una dipendenza iniettata: il parser/upstream reale viene
  collegato insieme all’import Hugging Face nel Task 5.
- Backend e termica restano unknown se l’upstream non li espone.
- Il gate con binario llama.cpp e GGUF reali resta nel Task 9.
- Nessuna UI è cambiata, quindi non esiste una verifica visiva onesta per questa
  fase; gli stati saranno renderizzati e verificati nel Task 8.

## Riepilogo semplice per l’owner

Prima TALOS aveva store, supervisor e stream ma non un arbitro affidabile per
dire “questo modello può davvero lavorare qui”. Ora quell’arbitro esiste: se un
dato manca, dice che non lo sa; se il modello entra solo come chat, lo dichiara;
se non entra in RAM/disco, lo blocca; e non esegue la prova attiva senza un sì.
La prossima fase può occuparsi del trasferimento/import verificato da Hugging
Face senza mescolare download e compatibilità.

Nessun commit e nessun push eseguiti.
