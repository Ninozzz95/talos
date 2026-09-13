# PO-14 P-K — Azure AI Foundry, Amazon Bedrock, Google Vertex AI

Data di ricerca e lavoro: 12/09/2026. Astra, worktree `lane/harness-desktop`, partenza `81e27a3b49f14a5019cefcc2e991e0243b071e3d`. Nessun commit, staging, push, account cloud o inferenza remota autorizzata. Porta 4174 esclusa.

**Esito: trasporto e configurazione P-K implementati e provati localmente; integrazione prodotto completa ancora aperta.** Il controllo finale conta **200 test: 197 riusciti, 1 fallito, 2 saltati**. Il fallimento è PAR-06, che rileva i tre nomi mancanti nel template HTML vietato. Sono inoltre necessari gli agganci del catalogo nel server e la selezione delle distribuzioni/modelli configurati, descritti nei diff non applicati. Nessuna qualificazione cloud reale dichiarata.

## Ricerca prima del codice e decisioni

| Fornitore | Fonti ufficiali consultate il 12/09/2026 | Decisione e contratto fissato |
|---|---|---|
| Azure AI Foundry | [Evoluzione API](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle), [endpoint](https://learn.microsoft.com/en-za/azure/ai-foundry/foundry-models/concepts/endpoints?view=foundry), [modelli e distribuzioni](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/working-with-models), [cache](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/prompt-caching) | Adattare REST OpenAI Chat Completions v1: risorsa `.openai.azure.com` oppure `.services.ai.azure.com`, base `/openai/v1`, `api-key`; token Entra già ottenuto accettato come Bearer esplicito. `model` indica il nome della distribuzione scelto dall'owner. v1 non richiede una versione datata. Compatibilità pre-v1 limitata al contratto `2024-10-21`: distribuzione nel percorso e `api-version` nella query. Nessun SDK aggiunto. |
| Amazon Bedrock | [Chat Completions](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions-mantle.html), [chiavi](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html), [TokenUsage](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_TokenUsage.html) | Adattare REST OpenAI v1 su `bedrock-runtime.{regione}.amazonaws.com/openai/v1`, raccomandato dalla pagina attuale; Mantle `/v1` resta un endpoint ufficiale alternativo. Entrambi ammettono chiave Bedrock Bearer e catalogo `/models`. Chiavi lunghe documentate per esplorazione; brevi per produzione. SigV4 è alternativa documentata (regione, servizio `bedrock` per Runtime), quindi non implementata, come richiesto. |
| Google Vertex AI | [Esempio OpenAI e ADC](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/generativeaionvertexai-gemini-chat-completions-non-streaming), [ADC](https://docs.cloud.google.com/docs/authentication/application-default-credentials), [endpoint globale e regionale](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/maas/call-open-model-apis?authuser=00) | Adattare REST v1 `/projects/{progetto}/locations/{regione}/endpoints/openapi/chat/completions`, Bearer con token già ottenuto tramite strumenti ufficiali. Nome modello completo `google/...` o altro editore, senza indovinarlo. Nessuna lettura di file ADC, account di servizio o metadata server; nessun rinnovo automatico. `@ai-sdk/google-vertex` non è nel lock e non viene aggiunto. |

`Converse` espone un contratto messaggi uniforme; `InvokeModel` usa il corpo del singolo modello. Non sono il contratto scelto per P-K. I nomi `cacheReadInputTokens` e `cacheWriteInputTokens` appartengono a TokenUsage Bedrock: leggerli solo quando presenti, senza promettere che il percorso OpenAI li restituisca. Il campo OpenAI resta `prompt_tokens_details.cached_tokens`; assenza = non misurato. Nessuna durata della cache dedotta.

Hermes locale verificato: `%LOCALAPPDATA%/Temp/talos-competitor/hermes-agent-v21`, commit `365e2835d490a053d076daa3b429371d6f35210f`. Sì, sono presenti i tre `ProviderConfig`: `hermes_cli/auth.py:545` Bedrock, `:553` Vertex, `:564` Azure Foundry. Non sono tre moduli in `providers/` (lì ci sono solo base e inizializzazione). `hermes_cli/runtime_provider.py:1634` risoluzione Azure, `:2077` Vertex con `agent.vertex_adapter`, `:2452` Bedrock: Converse/boto3, AnthropicBedrock oppure percorso OpenAI secondo modello e accesso. Si adattano i contratti ufficiali, non si copia codice Hermes né si introduce la sua catena di dipendenze.

Inventario trovato nel padre del worktree, `../.claude/INVENTARIO-PROVIDER-2026-09-12.md:482`, non nella `.claude` dell'harness: confermata la voce enterprise e la precedente mancata autorizzazione. L'istruzione corrente dell'owner autorizza P-K e prevale sulla nota storica a riga 485. L'inventario non è stato modificato.

Dipendenze esistenti conservate: `ai@7.0.93`, `@ai-sdk/openai@4.0.61`, `@ai-sdk/anthropic@4.0.49`, `@ai-sdk/google@4.0.64`; HTTP usa `fetch` di Node già presente. Documentazione come provenienza; nessuna libreria o codice di terzi vendorizzato. Gli endpoint SaaS non fissano una revisione server: pin del contratto v1 e fixture indipendenti, non un pin fittizio del servizio.

## Registro di esecuzione prima delle modifiche al prodotto

Sottosistema posseduto: integrazione fornitori dell'harness, sicurezza delle credenziali e soli campi UI autorizzati. Nessun subagente; P-J e P-L restano worktree separati. Blocchi additivi delimitati `// P-K`.

File previsti, senza cancellazioni:

- Creare `src/provider-auth-cloud.mjs`: `normalizzaRuntimeCloud`, `destinazioneCloud`, `intestazioniCloud`, `ProviderCloudError`; parsing e convalida del solo contratto ufficiale, segreti mai in preferenze o errori.
- Modificare `src/provider-registry.mjs`: record `azure`, `bedrock`, `vertex`; `verificaRegistro` ammette l'assenza esplicita e motivata di riserve universali per un catalogo che dipende dalla configurazione cloud. `AUTH` e `WIRE` restano compatibili.
- Modificare `src/provider-credential-store.mjs`: `normalizeProviderEndpoint`, `getRuntime`, `setRuntime`, `listPublic`; regione/progetto/risorsa/versione derivati dall'indirizzo ufficiale salvato con il formato v1 esistente. Le chiavi semplici restano valide; eventuale involucro JSON di token e scadenza resta una sola stringa nel pool.
- Modificare `src/model-destination.mjs`: `risolviDestinazioneModello`, con controllo cloud prima della rete.
- Modificare `src/runtime-owner-adapter.mjs`: `creaFetchInstradata`, `creaFetchMultiProvider`; redirect vietati per cloud, errori pubblici senza corpo upstream, panchine esistenti.
- Modificare `src/provider-probe.mjs`: `createProviderProbe`, `prova`, `elencaModelli`; 200/401/403/404 distinti, catalogo Azure diverso dalle distribuzioni, Vertex senza falsa sonda `/models` compatibile.
- Modificare `src/openai-compatible-runtime.mjs`: `preparaRichiestaCompatibile`, traduzione delle sole opzioni documentate.
- Modificare `src/usage-cache.mjs`: normalizzazione cache cloud senza duplicare il totale né inventare conteggi.
- Modificare `frontend/src/components/fonti-modelli.js`: soltanto `PROVIDER_DIRETTI`.
- Modificare `frontend/src/components/provider-card.js`: soltanto campi non segreti di `creaProviderCard`, helper per comporre l'indirizzo letto dal salvataggio esistente.
- Creare `tests/provider-pk.test.mjs`; modificare `tests/provider-pg.test.mjs` (PG-01: 23 record) e `tests/provider-registry-parita.test.mjs` (riserve cloud motivate e destinazioni che richiedono configurazione).
- Creare/aggiornare questo rapporto e prove locali in `.claude/`.

Scenari permanenti RED: PK-01 tre record assenti; PK-02 configurazione prima della rete; PK-03 intestazioni e URL reali contro server finto; PK-04 errori e nessun segreto; PK-05 pool/panchine; PK-06 cache assente/zero/presente; PK-07 persistenza e campi non segreti; PK-08 token scaduto; PK-09 protezione redirect; PK-10 trasporto HTTP delle preferenze; PK-11 compatibilità conversazione/strumenti. GREEN: `rtk proxy node --test tests/provider-pk.test.mjs`.

Regressioni obbligatorie: `tests/provider-registry-parita.test.mjs`, `tests/provider-pg.test.mjs`, `tests/provider-credential-pool.test.mjs`, `tests/provider-credential-store.test.mjs`, `tests/http-routes-providers.test.mjs`, `tests/runtime-owner-adapter-fallback.test.mjs`. Aggiungere sonda, destinazione, runtime compatibile e cache già esistenti; `git diff --check`. Test UI focalizzati dove disponibili. Non eseguire build che modifica file vietati.

Gate upstream reale: rinviato esplicitamente, perché l'owner vieta account cloud e chiamate pagabili. Prova locale: HTTP su loopback con porta assegnata dal sistema, configurazione persistente, messaggi e strumenti, errori e output senza chiave. Non sostituisce la qualificazione remota né il percorso finale del compositore.

Vincoli scoperti prima del codice: `src/http-app.mjs:3344` accetta solo `endpoint` e `timeoutSeconds`; i campi UI compongono quindi l'URL ufficiale, senza un protocollo nascosto nella query. `frontend/index.template.html` contiene un elenco statico: PAR-06 resterà rosso finché la lane proprietaria non applica il diff proposto. `src/http-app.mjs:2392` dà precedenza a `catalogoFornitoriFn` di `server.mjs`, entrambi vietati: registrare l'aggancio cloud necessario come diff non applicato, senza spacciare il catalogo pubblico dei modelli per le distribuzioni dell'owner.

Rollback: rimuovere soltanto i blocchi P-K e i file nuovi elencati, dopo confronto con eventuali modifiche concorrenti. Nessuna migrazione, dipendenza, credenziale reale o stato cloud da annullare.

## Esito e consegna

Amendamento UI prima del codice: helper pubblico `componiIndirizzoCloud` in `provider-card.js`, prova RED in `frontend/tests/unit/provider-pk.test.mjs`. I campi Regione, Progetto e Versione del collegamento aggiornano l'input `providerEndpoint` già letto dal salvataggio: nessun campo extra nella rotta vietata. Scenario PK-UI-01: cambia regione/progetto, l'indirizzo salvato cambia davvero; valori non validi non salvano quello precedente.

Banco visivo aggiunto al perimetro: `frontend/tests/unit/provider-pk-browser.test.mjs`, soli componenti reali impacchettati in memoria con esbuild già installato, API delle preferenze reale su loopback e store finto. Scenari PK-UI-02: desktop 1440 e mobile 390, moto ridotto, tastiera, salvataggio/ricarica, errore e bozza preservata; PK-UI-03: digitazione carattere per carattere della versione Azure senza perdere la risorsa. Prove PNG in `.claude/PK-UI-1440.png` e `.claude/PK-UI-390.png`.

RED PK-UI-03 riprodotto: digitare la versione Azure carattere per carattere cancellava l'indirizzo prima di completarla. Correzione: l'input conserva l'ultima risorsa pubblica nella propria bozza; il valore salvabile resta invalido finché i campi non sono completi. La prova usa digitazione reale da tastiera e resta permanente.

Amendamento di compatibilità prima della correzione: lo [schema Microsoft `2024-10-21`](https://raw.githubusercontent.com/Azure/azure-rest-api-specs/main/specification/cognitiveservices/data-plane/AzureOpenAI/inference/stable/2024-10-21/inference.json) conferma Chat Completions con distribuzione nel percorso. La sonda catalogo Azure deve usare il separato [contratto Models v1](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/models), anche quando la chat usa la versione precedente: non estendere la versione di inferenza all'API di authoring. Scenario permanente PK-12. Ulteriori prove: PK-13 streaming canonico, PK-14 rotazione di due credenziali cloud, PK-15 credenziali SDK non scambiate per token, PK-16 catalogo Bedrock reale su HTTP finto e rifiuto esplicito dei cataloghi di distribuzioni non disponibili.

Regressioni permanenti emerse: PK-CACHE-SCRITTURA, scrittura Bedrock senza lettura non deve sparire (`PK-06`); PK-SONDA-VERTEX, l'assunto storico «tutti sondabili» ora è falso e `SONDA-01` viene aggiornato alla dichiarazione esplicita Vertex mantenendo la prova nei due versi. Primo giro dei cancelli obbligatori: 81 test, 77 riusciti, 2 falliti (PAR-06 e SONDA-01), 2 saltati per fixture pubbliche opzionali non fornite. Le altre sei suite adiacenti: 74/74 riusciti.

Amendamento del banco prima del prodotto: il primo RED non ha caricato i test: `context-engine/src/contracts.mjs`, fratello dell'harness, non risolve `zod`. Aggiunto `.claude/pk-dipendenze-test.mjs` con `registerHooks.resolve`: risolve soltanto `zod` dal `node_modules` esistente dell'harness, senza installazione o modifica del lock. Comandi di verifica con `--import ./.claude/pk-dipendenze-test.mjs`.

### Comportamento consegnato

I record sono `azure`, `bedrock`, `vertex`; le etichette pubbliche sono esattamente quelle richieste. `AUTH` non richiede nuovi valori: `header` per la chiave Azure, `bearer` per Bedrock e Vertex. `effimera` non viene riutilizzata impropriamente: nel registro esistente significa una credenziale che non può stare nel portachiavi. La scadenza opzionale è un attributo del segreto Bearer, non un nuovo tipo di autenticazione.

| Fornitore | Preferenza non segreta accettata | Credenziale nel pool |
|---|---|---|
| Azure AI Foundry | Indirizzo della risorsa, normalizzato a `/openai/v1`; per compatibilità precedente `/openai?api-version=2024-10-21`. `getRuntime()` espone `endpointRisorsa` e `versioneApi`. | Chiave semplice da portachiavi, `AZURE_OPENAI_API_KEY` o `AZURE_FOUNDRY_API_KEY`; Entra tramite involucro Bearer esplicito. |
| Amazon Bedrock | `https://bedrock-runtime.eu-west-1.amazonaws.com/openai/v1`; alternativa Mantle `https://bedrock-mantle.eu-west-1.api.aws/v1`. Il pannello cambia la regione e ricompone l'indirizzo. | Chiave Bedrock semplice, anche da `AWS_BEARER_TOKEN_BEDROCK`. Non è la coppia access key/secret key AWS. |
| Google Vertex AI | `https://europe-west1-aiplatform.googleapis.com/v1/projects/PROGETTO/locations/europe-west1/endpoints/openapi`; `global` usa `aiplatform.googleapis.com`. Progetto e regione sono modificabili. | Token già ottenuto da Google, anche da `VERTEX_ACCESS_TOKEN`; stringa semplice oppure involucro con scadenza. |

Gli indirizzi ambientali accettati sono `AZURE_OPENAI_ENDPOINT`/`AZURE_FOUNDRY_BASE_URL`, `BEDROCK_OPENAI_BASE_URL`, `VERTEX_OPENAI_BASE_URL`. Non è imposta una regione predefinita e non vengono cercati account o file sul computer. Il formato delle preferenze resta `version: 1`: regione e progetto vivono nel percorso/host ufficiali, non in metadati nascosti. Le nuove proprietà pubbliche di `getRuntime()` sono derivate anche dopo un riavvio; i campi del pannello alimentano `setRuntime()` attraverso la rotta esistente con i soli `endpoint` e `timeoutSeconds`.

Formato additivo di una credenziale, da fornire al campo segreto o alla custodia (esempio con segnaposto, non un comando):

```json
{"versione":1,"tipo":"bearer","valore":"TOKEN_DA_CUSTODIRE","scadeAlle":"2026-09-12T23:00:00Z"}
```

È sempre **una stringa** del pool P-H, inclusi token e scadenza. Nessuna migrazione, nessun segreto nelle preferenze. `scadeAlle` è facoltativa: se manca non si indovina una durata, e l'eventuale rifiuto viene classificato dal codice HTTP. Se presente e scaduta, o se il JSON è malformato, nessuna rete e sola credenziale interessata in panchina. Un documento di account di servizio non viene interpretato come un token. Il limite esistente di 4096 caratteri per voce resta invariato.

Sonde: Azure e Bedrock fanno soltanto GET del catalogo; 200 valido, 401, 403 e 404 restano distinti tramite `httpStatus` e motivo. 403 indica anche la possibile mancanza di permessi, senza dichiarare una chiave errata. Un 200 malformato non certifica accesso. Vertex restituisce `non-sondabile`, senza rete e con tempo `null`: non è stata trovata una GET `/models` documentata sul percorso OpenAI consultato. Non è stata aggiunta una sonda a pagamento o una sonda di un altro servizio che faccia credere verificata l'inferenza.

Il catalogo Bedrock passa gli id restituiti dal servizio. Azure non trasforma i modelli base in nomi di distribuzione; Vertex non inventa un catalogo. Le riserve e l'ausiliario dei tre record sono vuoti/null con motivazione esplicita: non attestano strumenti o abilitazioni mai verificati nell'account dell'owner. Per questo P-K non compare come riserva automatica di sessioni con strumenti. L'adattatore accetta la destinazione esplicita `azure:NOME_DISTRIBUZIONE`, `bedrock:ID_MODELLO`, `vertex:EDITORE/MODELLO`.

JSON di consumo: nomi OpenAI e, se presenti, `cacheReadInputTokens`/`cacheWriteInputTokens` Bedrock. Zero è un dato; assenza è `null`. Il totale non viene sommato di nuovo. Lo streaming OpenAI canonico passa intatto, compreso `usage` finale; non viene introdotto un traduttore Converse/Invoke in streaming. I timeout sono preferenze applicative, non durate misurate del servizio o della cache.

### File su disco e punti di modifica

Tutti i percorsi seguenti sono relativi a `harness-ui/`. Nessun file vietato modificato.

| File | Righe rilevanti | Modifica |
|---|---|---|
| `src/provider-registry.mjs` | 1000, 1167 | Tre record P-K e vincolo esplicito sulle riserve dipendenti dalla configurazione. |
| `src/provider-auth-cloud.mjs` (nuovo) | 5, 12, 53, 73 | Errore tipizzato, runtime ufficiale, intestazioni, scadenza, destinazione. |
| `src/provider-credential-store.mjs` | 15, 143, 382, 432 | Validazione cloud, proprietà runtime pubbliche e schema dei campi. |
| `src/model-destination.mjs` | 39, 171 | Delegazione cloud dopo i controlli sulle credenziali. |
| `src/runtime-owner-adapter.mjs` | 573, 587, 706 | Redirect bloccati, errori oscurati anche senza pool, panchina dei token invalidi/scaduti. |
| `src/provider-probe.mjs` | 36, 147, 188, 229 | Autenticazione condivisa, 403 preciso, cataloghi senza false distribuzioni. |
| `src/openai-compatible-runtime.mjs` | 33, 76 | Traduzione di `reasoning.effort`, conflitti respinti, opzioni ulteriori dichiarate. |
| `src/usage-cache.mjs` | 202 | Scrittura di cache senza lettura conservata, senza inventare zero. |
| `frontend/src/components/fonti-modelli.js` | 137 | Soltanto elenco Diretti, tre etichette. |
| `frontend/src/components/provider-card.js` | 35, 50, 143 | Soltanto configurazione non segreta e composizione dell'indirizzo. |
| `tests/provider-pk.test.mjs` (nuovo) | 1 | 23 prove backend P-K. |
| `tests/provider-pg.test.mjs` | 46 | PG-01 conta 23 record; da riconciliare con le altre lane. |
| `tests/provider-registry-parita.test.mjs` | 82, 245, 380 | Eccezione cloud motivata, runtime esplicito, sonda Vertex; PAR-06 conservato attivo. |
| `frontend/tests/unit/provider-pk.test.mjs` (nuovo) | 1 | Composizione degli indirizzi nei due versi. |
| `frontend/tests/unit/provider-pk-browser.test.mjs` (nuovo) | 1 | Componenti reali, HTTP delle preferenze, due viewport, tastiera e riapertura. |
| `.claude/pk-dipendenze-test.mjs` (nuovo) | 1 | Risolutore di prova per il `zod` già installato. |
| `.claude/RAPPORTO-PK-AZURE-BEDROCK-VERTEX-2026-09-12.md` (nuovo) | 1 | Questo rapporto, dossier, ledger e handoff. |

Prove generate: `.claude/PK-TEST-FINALI.tap`, `.claude/PK-UI-1440.png`, `.claude/PK-UI-390.png`; il test preesistente P-H ha generato anche `.claude/PH-UI-1440.png` e `.claude/PH-UI-390.png`. Sono output di prova, non modifiche P-H al prodotto. Schermate P-K esaminate visivamente: campi leggibili, nessuna sovrapposizione o fuoriuscita orizzontale. Il banco usa il componente e gli stili reali; il menu ospite e la regia di pagina sono fixture esplicite.

### Verifica finale riproducibile

```powershell
rtk proxy node --import ./.claude/pk-dipendenze-test.mjs --test --test-reporter=tap tests/provider-pk.test.mjs tests/provider-registry-parita.test.mjs tests/provider-pg.test.mjs tests/provider-credential-pool.test.mjs tests/provider-credential-store.test.mjs tests/http-routes-providers.test.mjs tests/runtime-owner-adapter-fallback.test.mjs tests/provider-probe.test.mjs tests/model-destination.test.mjs tests/openai-compatible-runtime.test.mjs tests/usage-cache.test.mjs tests/runtime-owner-adapter.test.mjs tests/provider-zai.test.mjs frontend/tests/unit/provider-pk.test.mjs frontend/tests/unit/provider-pk-browser.test.mjs frontend/tests/unit/provider-card.test.mjs frontend/tests/unit/fonti-modelli.test.mjs frontend/tests/unit/provider-pool-browser.test.mjs frontend/tests/unit/provider-pool-fallback.test.mjs
rtk proxy git diff --check
```

| Gruppo | Totale | Riusciti | Falliti | Saltati |
|---|---:|---:|---:|---:|
| P-K backend | 23 | 23 | 0 | 0 |
| Sei file obbligatori di regressione | 81 | 78 | 1 | 2 |
| Sei suite adiacenti backend | 74 | 74 | 0 | 0 |
| Sei file frontend, inclusi browser P-K e P-H | 22 | 22 | 0 | 0 |
| **Esecuzione finale unica** | **200** | **197** | **1** | **2** |

`git diff --check`: riuscito. Processo test: uscita 1, correttamente, perché PAR-06 resta fallito. I due skip sono `PG-PUB` e `PF-PAR-05`: richiedono snapshot pubblici integrali indicati tramite variabili non fornite; le fixture già nel repository passano. Bundle JS/CSS dei componenti costruiti in memoria con esbuild esistente; nessuna installazione, build completa o scrittura del template vietato. `rg` non è nel PATH del banco: ricerca locale con lettura Node dei file pertinenti. Git segnala accesso negato al file globale di esclusione del profilo Windows; status e diff del worktree restano leggibili.

### Diff non applicati e limiti dell'integrazione

1. **`frontend/index.template.html` — vietato.** Nel `<select id="providerLab">` aggiungere le tre opzioni qui sotto. Finché manca questo diff, PAR-06 deve fallire: il test non è stato disattivato o filtrato.

```diff
+<option value="azure">Azure AI Foundry</option>
+<option value="bedrock">Amazon Bedrock</option>
+<option value="vertex">Google Vertex AI</option>
```

2. **`server.mjs:647` — vietato.** Oggi `catalogoFornitoriFn` dà sempre precedenza a models.dev; per i cloud `modelsDevId: null` restituisce non disponibile, prima che la sonda possa leggere Bedrock. Il minimo aggancio coerente è:

```diff
-    catalogoFornitoriFn: (id, opts) => providerModelCatalog.ottieni(id, opts),
+    // P-K — i cataloghi cloud dipendono dal collegamento dell'owner.
+    catalogoFornitoriFn: (id, opts) => ['azure', 'bedrock', 'vertex'].includes(id)
+      ? providerProbe.elencaModelli(id)
+      : providerModelCatalog.ottieni(id, opts),
+    // P-K — fine
```

Questo aggancio abilita il catalogo Bedrock e rende esplicita l'indisponibilità di Azure/Vertex. **Da solo non completa la scelta di Azure/Vertex nel compositore.** Serve il passaggio successivo.

3. **Contratto dei modelli configurati — non applicato.** Azure richiede nomi di distribuzione dell'owner e Vertex modelli abilitati nel progetto. La lane di integrazione deve aggiungere una lista esplicita di tali nomi alle preferenze e al selettore, senza attribuire strumenti o prezzi non verificati. Ciò richiede estendere la whitelist in `src/http-app.mjs:3344` e la regia in `frontend/src/legacy/app.js:3045` (entrambi vietati), poi consumare questi valori dal catalogo cloud. Non si propone una lista universale di distribuzioni o una modifica nascosta al significato di `model`. Il formato HTTP attuale per regione/progetto/versione è già interamente funzionante e non richiede questo cambiamento.

4. **Dipendenze — nessun diff applicato.** Non aggiunti `@ai-sdk/google-vertex`, `google-auth-library`, `@azure/identity`, `@aws-sdk/*` o `aws-sdk`; nessun aggiornamento di `ai` o degli SDK nel lock. Rinnovo ADC/Entra, account di servizio e profili AWS richiedono una slice separata con versione da verificare e fissare, provenienza/licenza e gate reali. In P-K basta il token/chiave ufficiale già ottenuto. SigV4 e il relativo vettore AWS non sono applicabili alla via scelta: l'alternativa Bearer è documentata, quindi implementarli violerebbe la preferenza esplicita dell'owner.

### Cosa non è stato verificato

Nessun accesso a un account cloud e nessuna chiamata di inferenza remota, pagabile o gratuita. Non verificati dal vivo: permessi di risorsa/progetto, disponibilità dei modelli per regione, chiavi lunghe/brevi reali, rinnovo di token, compatibilità di ogni modello con strumenti/ragionamento, misure di cache o costi. Nessuna promessa su Converse, InvokeModel, ADC, account di servizio, profili AWS, accesso interattivo o rinnovo automatico.

Il percorso dal compositore finale ai tre cloud, con cataloghi, follow-up e persistenza di sessione, non è qualificato: rimangono i due file vietati e il contratto della lista modelli descritti sopra, oltre al divieto di usare account. I test provano invece messaggi e risultati strumenti al confine HTTP, streaming, errori/panchine, configurazione tramite API, custodia finta e ricarica del componente. Il campo di stato delle sonde preesistente mostra un'etichetta generica per `non-sondabile`; la nota cloud ne spiega il limite. Non modificato perché l'autorizzazione di `provider-card.js` riguarda soltanto i campi di configurazione.

### Testo di commit proposto, non eseguito

```text
feat(fornitori): aggiunge i trasporti cloud Azure, Bedrock e Vertex

Aggiunge configurazione regionale e di progetto, credenziali cloud nel pool
esistente, autenticazione REST ufficiale, controlli prima della rete e sonde
senza inferenza. Conserva scadenze dichiarate, panchine e cache non misurata.

Prove: 23 test P-K backend; verifica complessiva 197 riusciti, 1 fallito,
2 saltati. PAR-06 e agganci del catalogo richiedono riconciliazione nella
lane proprietaria prima di dichiarare completa l'integrazione prodotto.
```

### Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

**Cosa deve fare l'owner:** riconciliare i blocchi P-K con P-J/P-L, applicare i diff nei file di propria competenza e definire la selezione dei nomi configurati; successivamente qualificare i collegamenti nei propri account senza inserire segreti in log o comandi.

**Cosa faccio io:** consegno su disco i 15 file di prodotto/test elencati, il risolutore del banco, questo rapporto, il TAP e le schermate; nessun `git add`, commit o push. Tutte le operazioni di prova sono concluse, browser e server temporanei chiusi.

**Cosa rimane:** PAR-06 e cataloghi/selezione nel prodotto, prova reale multi-turno dal compositore e gate cloud. ADC/Entra automatici, profili AWS e altri wire Bedrock restano fuori dalla via ufficiale minima scelta per P-K.
