# BRIEF — BC-79.2 · un motore locale che rifiuta gli attrezzi: si riprova UNA volta senza, e lo si dice

> Approvato dall'owner il 17/09/2026 («si ovviamente»). Corsia backend, DOPO la chiusura di BC-76 sullo stesso filone.
> Base: la lane dopo la fusione di `fase-a-bc76`. Ramo tuo con `git.exe checkout -b fase-a-bc79-2 <sha>`; niente checkout fra rami dopo.

## Cosa esiste già (misurato, non ricordato)
- Misura dell'agente di BC-76 (17/09): motore finto che risponde `HTTP 400 {"error":{"message":"tools param requires --jinja flag"}}`
  ⇒ eventi `RunStarted, RunError`, `code: internal-error`, messaggio «HTTP 400 dopo 4 tentativi: {…grezzo…}».
- Misura MIA nella stessa sera (sonda con 401): «HTTP 401 dopo 4 tentativi» ⇒ il ritento sui 4xx NON riguarda solo il 400.
- Il ritento vive in `chiamaConRitenta` (`src/kernel/talosHarness.mjs`); l'instradamento verso i motori in `src/runtime-owner-adapter.mjs`
  (`creaFetchInstradata` / `chiamaLocale`). Il supervisore llama-server lancia già con `--jinja`: col NOSTRO motore il caso non dovrebbe
  capitare; il caso vero è Ollama / LM Studio.
- ⛔ RIACCERTA tutto questo nel codice prima di scrivere: righe e nomi possono essere cambiati con la fusione di BC-76.

## Ricerca (17/09/2026) — i VINCOLI che dal codice non si vedevano
- Ollama risponde 400 «… does not support tools» quando il modello non ha il template (openhuman #2787, browser-use #814, openclaw #9636):
  la cura adottata altrove è TOGLIERE `tools` per quel modello, con prove unitarie.
- ⛔ Un 400 con `tools` nel corpo ha ALTRE cause che non sono «il modello non sa»: una regex PCRE negli schemi che llama.cpp non compila in
  GBNF (rowboat #740), un template che lancia sull'ordine dei messaggi (Ornith-1.0-35B discussione #10), il formato dell'esito di un attrezzo
  (llama.cpp #23542). ⇒ NON si riconosce il caso dal TESTO dell'errore (è il filtro che riconosce la menzione invece della cosa):
  si riconosce dal COMPORTAMENTO — la stessa richiesta SENZA `tools` riesce.
- Ollama espone `capabilities` in `/api/show` (contiene `tools` quando il modello li regge): è un dato LETTO, preferibile alla sonda dove
  esiste. Valuta se usarlo come scorciatoia per `ollama:`; non è obbligatorio in questa riga, ma dillo nella consegna.

## La cura, coi suoi confini
1. **Un 4xx non si ritenta quattro volte.** 400/401/403/404/422 sono risposte, non guasti di trasporto: un solo tentativo. Restano ritentabili
   408, 409 (se già lo era), 425, 429 e i 5xx. ⛔ Misura PRIMA quali codici ritenta oggi e su quali fornitori: se cambiare la regola per il
   cloud sposta prove esistenti, dimmelo e limita il cambio ai motori locali.
2. **Solo per le fonti locali** (`local:`, `ollama:`, `lmstudio:` — derivate dal registro, non un elenco scritto a mano): davanti a un 400
   su una richiesta che portava `tools`, UNA sola riprova identica senza `tools` né `tool_choice`.
   - riesce ⇒ il giro prosegue come chat; si emette UNA volta per sessione un avviso umano («Questo modello non usa gli attrezzi: qui
     resta una chat. Può rispondere, non può leggere file né eseguire comandi.») e per il resto della sessione `tools` non si manda più
     (niente 400 a ogni giro). Il canale dell'avviso: quello che esiste già per gli avvisi di giro — cercalo, non inventarne uno.
   - fallisce anche senza ⇒ si riporta l'errore ORIGINALE, con un codice suo (non `internal-error`) e una frase umana; il grezzo al più come
     dettaglio secondario. Nessun nome tecnico a schermo (`--jinja`, `tools`, HTTP).
3. ⛔ **Mai sul cloud.** Se la sessione è cloud, niente riprova senza attrezzi: un fornitore cloud che rifiuta `tools` è un errore da dire.
4. ⛔ Niente modello «consigliato», niente elenco di modelli che reggono gli attrezzi, niente template forzato (owner 11/09).
5. ⛔ Il kernel è dell'owner: tocca SOLO la funzione del ritento e, se serve, il punto in cui si compone il corpo. Nessun secondo esecutore.
   Se la cura sta meglio tutta in `runtime-owner-adapter.mjs` (la `fetch` instradata può fare la riprova da sola, e il kernel non cambia),
   è la forma PREFERITA: dillo con la misura.

## Prove (RED prima, poi GREEN, poi al contrario)
Dalla strada vera come `tests/bc76-sessione-locale-agente.test.mjs` (registro, kernel, adattatore veri; motore finto HTTP su 127.0.0.1;
spia di `fetch` che lascia passare solo 127.0.0.1):
- motore che dà 400 CON `tools` e 200 SENZA ⇒ esattamente 2 richieste al primo giro, risposta a schermo, avviso una volta sola, al giro dopo
  `tools` assente e nessun 400;
- motore che dà 400 sempre ⇒ 2 richieste e non 4+, `RunError` con codice dedicato e frase senza nomi tecnici;
- motore che dà 400 per un ALTRO motivo ma regge senza `tools` (testo d'errore diverso da quello di Ollama) ⇒ stesso esito del primo caso:
  la prova che non si legge il testo;
- sessione CLOUD con 400 ⇒ nessuna riprova senza attrezzi;
- 401 ⇒ un tentativo solo; 429 e 503 ⇒ ritentati come oggi.
Rotture attese: riprova tolta · riprova estesa al cloud · memoria di sessione tolta (torna il 400 a ogni giro) · ritento dei 4xx rimesso.

## Consegna
Root cause, file toccati, RED/GREEN/contrario con le uscite, conteggi interi (`tests/*.test.mjs labs/electron-shell/*.test.mjs` a
`--test-concurrency=2`, più `npm run test:kernel`), misurato contro letto, non verificato per nome. Commit in inglese da file, senza
trailer, `git.exe`. ⛔ Non toccare `tests/research-orchestrator.test.mjs` né `tests/ricerca-deposito-strutturato.test.mjs`.
