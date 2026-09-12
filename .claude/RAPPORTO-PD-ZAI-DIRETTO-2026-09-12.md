# PO-14 P-D — Z.AI diretto

Data di ricerca e lavoro: **12/09/2026**. Sottosistema: integrazione dei fornitori del desktop e componente del selettore esplicitamente assegnato. Rapporto in `harness-ui/.claude/`: la radice del repository è fuori dalle directory scrivibili della sessione. Nessun commit, staging o push. Nessun agente delegato.

## Ricerca prima del codice

Fonti primarie consultate il 12/09/2026:

- [API Chat Completion](https://docs.z.ai/api-reference/llm/chat-completion): POST `/api/paas/v4/chat/completions`, Bearer; `thinking` e `reasoning_effort` nel JSON di primo livello. `extra_body` è l'involucro del client Python, non un campo da inviare nel JSON HTTP. `max_tokens` fino a 131072; temperatura 0–1, top_p 0,01–1; `tool_stream` distinto da `stream`. La pagina non documenta `stream_options`.
- [Compatibilità OpenAI](https://docs.z.ai/guides/develop/openai/python): API ufficiale direttamente utilizzabile dal trasporto HTTP esistente; non richiede un nuovo SDK Python nel processo Node.
- [GLM-5.3-Flash](https://docs.z.ai/guides/vlm/glm-5.3-flash), [GLM-5.3](https://docs.z.ai/guides/llm/glm-5.3), [GLM-5.2](https://docs.z.ai/guides/llm/glm-5.2), [GLM-5](https://docs.z.ai/guides/llm/glm-5), [GLM-4.6](https://docs.z.ai/guides/llm/glm-4.6): contesti dichiarati rispettivamente 1M, 1M, 1M, 200K, 200K; uscita 128K. Il registro conserva anche la notazione originale: conversione decimale conservativa del contesto, non conteggio esatto verificato. Flash dichiara ingresso testo, immagini, video e file; questo lotto non qualifica i percorsi multimodali.
- [Prezzi Z.AI](https://docs.z.ai/guides/overview/pricing): USD per milione di token. GLM-5.3-Flash ingresso 0,15 / cache 0,03 / uscita 0,50; GLM-5.3 e GLM-5.2 1,40 / 0,26 / 4,40; GLM-5 1 / 0,20 / 3,20; GLM-4.6 0,60 / 0,11 / 2,20. Archiviazione cache temporaneamente gratuita: non fissata a zero permanente nel record.
- [Cache](https://docs.z.ai/guides/capabilities/cache): oggi documenta la cache automatica e `usage.prompt_tokens_details.cached_tokens`. L'assenza del campo resta **non misurato**, anche se gli esempi Python della pagina usano zero come ripiego. Questo aggiorna quanto riportava l'inventario precedente.
- [Streaming](https://docs.z.ai/guides/capabilities/streaming): SSE `data:`, contenuto incrementale, uso dei token nel messaggio finale, `[DONE]`. [Function calling](https://docs.z.ai/guides/capabilities/function-calling): ciclo messaggio assistente con `tool_calls`, risposta `tool` con `tool_call_id`, prosecuzione della conversazione.
- [Limiti](https://docs.z.ai/api-reference/rate-limit): reindirizza al pannello dell'account; nessuna quota numerica pubblica verificata. [Errori](https://docs.z.ai/api-reference/api-code): distingue autenticazione, risorsa assente, frequenza e guasto. Il timeout locale di 60 secondi è una scelta AVM già esistente, non un limite Z.AI misurato.
- [Indice ufficiale](https://docs.z.ai/llms.txt): non elenca un'API GET `/models`. La sonda su quel percorso è una verifica di compatibilità; un 404 non certifica né rifiuta la chiave. Il catalogo di ripiego documentato deve dichiararsi tale e non intervenire su 401/403 o errori di rete.
- [Hermes: profilo Z.AI al commit fissato](https://github.com/NousResearch/hermes-agent/blob/48da3172114c0e3749c16b881bfdda3baea7e1cc/plugins/model-providers/zai/__init__.py): ultimo commit del file restituito dall'API GitHub, datato 03/09/2026. SHA-256 del file letto: `6b90b7f44b17a51e5eb779eb70eeecab2832f41326c0e445688e89e9e3c64441`. Tre variabili GLM_API_KEY, ZAI_API_KEY, Z_AI_API_KEY; stesso endpoint; traduzione del ragionamento. Non copiato codice Hermes, né installato Hermes.
- [GLM-5.3-Flash su OpenRouter](https://openrouter.ai/z-ai/glm-5.3-flash): `z-ai/` identifica la famiglia, non obbliga il server Z.AI. Prezzi e capacità dipendono dall'endpoint scelto. Oggi la pagina mostra Z.AI 0,15/0,50 USD per milione ingresso/uscita, e DeepInfra in promozione 0,075/0,25; rimuovere l'intermediario **non dimostra un risparmio**. [Instradamento OpenRouter](https://openrouter.ai/docs/guides/routing/provider-selection): bilanciamento e ripiego fra fornitori, selezione esplicita con `provider`. Nessuna latenza pubblicata da terzi viene presentata come nostra misura.

**Differenza dalle premesse, verificata alla fonte:** GLM-5.3 e Flash accettano oggi `low/high/max` e non consentono di disabilitare il ragionamento. GLM-5.2 accetta ulteriori alias di compatibilità. Il lotto richiesto mantiene deliberatamente solo `high/max`: `low` viene omesso con avviso come vincolo del profilo P-D, senza attribuire falsamente il rifiuto al fornitore. Su 5.3/Flash una richiesta di spegnimento produce `enabled` e un avviso. Su 4.6/5/5.2 è ammesso `disabled`.

**Decisione upstream:** adozione diretta dell'API ufficiale Z.AI, contratto `/api/paas/v4` fissato e adattato nel modulo AVM già esistente. Nessun nuovo pacchetto: SDK Python/Java estranei al runtime, SDK nativi già presenti destinati ad altri wire. Hermes è un riferimento a commit fissato, non una dipendenza. Il protocollo Anthropic `/api/anthropic` resta dichiarato ma inattivo, P-J. Modelli e listino sono uno snapshot documentale del 12/09/2026; Z.AI non offre un pin immutabile di quelle pagine.

## Registro operativo prima delle modifiche

File da modificare, proprietà esclusiva di questa attività:

1. `src/provider-registry.mjs`: record `REGISTRO_FORNITORI.zai`, metadati di modelli, prezzi, ragionamento e secondo profilo inattivo; validazione dei nuovi campi in `verificaRegistro`. Stabili `WIRE`, `AUTH`, `STATI_CAPACITA`, `ProviderRegistryError`, `fornitore`, `idFornitori`, `idPerWire` e tutte le proiezioni `ID_*`.
2. `src/provider-probe.mjs`: `createProviderProbe().prova/elencaModelli`, nomi umani, HTTP 200/401/404 distinguibili, catalogo documentato esplicito su 404; nessuna chiamata senza chiave. Stabili `SONDE_PROVIDER`, `ESITI_SONDA`, `CATALOGHI_DIRETTI`, `ProviderProbeError`.
3. `src/model-destination.mjs`: messaggi con `record.etichetta` in `risolviDestinazioneModello`; prefisso e Bearer derivati dal record. Stabili `ModelDestinationError`, `FONTI_MODELLO`, `separaFonteModello`.
4. `src/openai-compatible-runtime.mjs`: nuova funzione pura `preparaRichiestaCompatibile(provider, corpo)` che restituisce `{ corpo, avvisi }`; traduzione del ragionamento senza mutare la richiesta. Stabili `OpenAiCompatibleRuntimeError`, `createOpenAiCompatibleRuntime` e il runtime locale.
5. `src/usage-cache.mjs`: `conteggio` rifiuta null, booleani e valori vuoti: un null JSON non deve diventare zero. Stabili tutti gli export, in particolare `tokenDaCache` e `normalizzaUsage`.
6. `frontend/src/components/fonti-modelli.js`: `PROVIDER_DIRETTI` aggiunge «Z.AI»; i fornitori con chiave obbligatoria possono dichiarare `soloSeCollegato` per evitare una scheda disponibile prima del caricamento della chiave. Stabili tutti gli export esistenti.
7. `tests/provider-zai.test.mjs` (nuovo): scenari permanenti PD-01..PD-10: registro, alias credenziali, sonda/status/404, catalogo, ragionamento ammesso/omesso, ciclo tool e streaming su server finto, controllo del percorso effettivo del router.
8. `tests/usage-cache.test.mjs`: scenario PD-CACHE — campo assente/null non misurato; zero esplicito resta zero; fixture Z.AI documentale.
9. `frontend/tests/unit/fonti-modelli.test.mjs`: scenari PD-UI, sette schede solo se Z.AI collegato, elenco e messaggi con nome umano. Il vecchio tetto sei era una scelta precedente, superata dall'esplicita richiesta di aggiungere Z.AI; resta da verificare il layout reale.
10. `.claude/RAPPORTO-PD-ZAI-DIRETTO-2026-09-12.md` (questo file): ricerca, registro operativo, risultati, diff non applicati e consegna.

`src/provider-credential-store.mjs` e `src/config.mjs` non richiedono modifiche: alias ambiente e prefissi sono già derivati dal registro. Nessuna migrazione, classe o schema pubblico aggiuntivo oltre ai metadati dichiarati sopra.

**RED atteso:** record Z.AI assente; catalogo respinto; traduttore assente; `null` cache letto come zero; selettore senza Z.AI. Prova permanente PD-10 del router vero: deve omettere `low`, ma resterà rossa senza l'aggancio in `src/runtime-owner-adapter.mjs`, fuori elenco autorizzato.

**GREEN mirato e regressione autorizzata:** `rtk proxy node --test tests/provider-zai.test.mjs tests/usage-cache.test.mjs frontend/tests/unit/fonti-modelli.test.mjs tests/provider-registry-parita.test.mjs tests/http-routes-providers.test.mjs`. Dopo l'ispezione si aggiungeranno solo test dei file effettivamente toccati se necessari. Nessuna suite completa, build condivisa o Playwright completo. `git diff --check` sui soli file assegnati.

**Vincoli già emersi:** PAR-06 legge gli `<option>` reali di `frontend/index.template.html`, vietato. Il verde di quella parità è impossibile entro questo perimetro senza indebolire il cancello. Si conserva il controllo e si consegna il diff. Il router delle richieste sta in `src/runtime-owner-adapter.mjs`, anch'esso non autorizzato: si consegna l'aggancio al traduttore come diff, non si simula un'integrazione che il chiamante non usa. `legacy/app.js:caricaDiretti` itera già `PROVIDER_DIRETTI`, quindi non serve un aggancio per caricare il catalogo.

**Prova upstream:** ambiente controllato senza stampare valori: nessuna delle tre variabili Z.AI presente; `@napi-rs/keyring` 1.3.0 disponibile, voce servizio `talos-harness-provider`/account `zai` letta e assente. OpenRouter presente nell'ambiente. Z.AI sarà provato con un server finto su porta assegnata dal sistema (`listen(0)`), sempre chiuso. Per OpenRouter una chiamata minima reale dal router esistente; non costituirà un confronto A/B col diretto assente.

**Prova umana:** funzioni del selettore e risposte HTTP sul banco isolato; nessun via libera alla UI completa finché template e aggancio runtime non sono applicati e verificati.

**Rollback:** rimuovere esclusivamente gli hunk P-D elencati nel rapporto, previa verifica delle modifiche concorrenti; nessun reset, checkout, revert o cancellazione delle modifiche altrui. Upgrade: rileggere le fonti ufficiali, aggiornare snapshot e fixture, rieseguire i cancelli mirati e la chiamata reale.

## Risultati

### Emendamento del registro operativo

Durante la verifica del selettore è emerso che `legacy/app.js:effortCompatibilePerModello` legge il contratto già esistente `reasoning.supportedEfforts/defaultEffort/defaultEnabled/mandatory`, non `ragionamento`. La proiezione `metadatiNoti` in `src/provider-probe.mjs` deve quindi fornire anche quel contratto, derivandolo dagli stessi dati. Nessun file aggiuntivo. Il test PD-05 lo verifica prima della modifica. PD-11 rende permanente il rifiuto di un controllo `thinking` malformato, senza errore TypeError. Il traduttore non assume che una qualunque stringa voglia dire «disabilitato».

RED iniziale: **24 test, 11 passati, 13 falliti**, 438,3901 ms. Prima verifica dopo l'implementazione: **43 test, 41 passati, 2 falliti**, 551,43 ms; restano PAR-06 e PD-10 per i diff fuori perimetro. Risultato finale più sotto.


### Misura OpenRouter reale

```json
{
  "tipo": "OpenRouter reale; nessun diretto reale disponibile",
  "data": "2026-09-12T11:47:08.528Z",
  "modello": "z-ai/glm-5.3-flash",
  "prompt": "Rispondi solo: uno.",
  "httpStatus": 401,
  "primoTokenMs": null,
  "primoTestoMs": null,
  "totaleMs": 401.39,
  "usage": null,
  "cache": "non misurato",
  "esito": "Risposta HTTP senza generazione"
}
```

## Record aggiunto e comportamento consegnato

Un solo nuovo record: `REGISTRO_FORNITORI.zai`, nome principale **Z.AI**, wire `openai-chat`, base `https://api.z.ai/api/paas/v4`, chat `/chat/completions`, auth Bearer, chiave obbligatoria. Il registro passa da 9 a **10** record; il portachiavi da 8 a **9** fornitori. Le tre variabili sono derivate dal record, senza copie in config o portachiavi.

| Modello | Contesto dichiarato | Uscita massima API | Ingresso USD/M | Cache USD/M | Uscita USD/M | Livelli P-D | Spegnimento |
|---|---|---:|---:|---:|---:|---|---|
| GLM-5.3-Flash | 1M | 131072 | 0,15 | 0,03 | 0,50 | high, max | No |
| GLM-5.3 | 1M | 131072 | 1,40 | 0,26 | 4,40 | high, max | No |
| GLM-5.2 | 1M | 131072 | 1,40 | 0,26 | 4,40 | high, max | Sì |
| GLM-5 | 200K | 131072 | 1 | 0,20 | 3,20 | Nessun effort inviato | Sì |
| GLM-4.6 | 200K | 131072 | 0,60 | 0,11 | 2,20 | Nessun effort inviato | Sì |

Le cinque righe sono un sottoinsieme noto, non l’intero catalogo Z.AI. Fonti ufficiali del 12/09/2026 elencate sopra. I contesti numerici sono conversioni decimali conservative di 1M e 200K; il valore esatto di 1M non è specificato dalle pagine dei modelli. Nessun prezzo OpenRouter è stato ricopiato nel record diretto.

Streaming e tool calling restano **dichiarati**, non osservati su Z.AI reale. Il secondo profilo `anthropic-messages` è presente con `stato: 'in preparazione'` e `lotto: 'P-J'`, senza rotta attiva.

Il catalogo effettua GET `/models` con chiave; arricchisce i modelli noti con nome umano, limiti e prezzi datati, oltre al contratto `reasoning` già letto dal selettore. Un modello sconosciuto nel catalogo remoto non riceve prezzi o capacità inventati. Solo HTTP 404 consente il ripiego ai modelli documentati, ciascuno con «catalogo documentato» nel nome visibile e `credenzialeVerificata: false`; 401, errori di rete e JSON malformato restano errori. La sonda su 404 resta `errore`, non diventa collegata grazie al ripiego. Su 200 con un catalogo valido dice che il catalogo è raggiunto e che la generazione non è stata provata.

La fonte Z.AI del selettore si mostra solo dopo il caricamento con una chiave presente. Il portachiavi continua invece a elencare anche i fornitori non configurati, perché serve a configurarli. Senza chiave, il sottoinsieme disponibile non contiene Z.AI, e sonda/catalogo non eseguono richieste. Nome principale «Z.AI»; `zai` resta l’identificatore del contratto e del prefisso.

`preparaRichiestaCompatibile` restituisce il corpo adattato e gli avvisi in italiano; il suo aggancio nel router di produzione **non è applicato**. Di conseguenza P-D non è ancora completo nel percorso del composer. Non è corretto dichiarare che il `low` proveniente oggi dal router venga già omesso: PD-10 prova esattamente il contrario.

La correzione cache conserva `null` per campo assente, `null` JSON, valore vuoto, booleani e contenitori; lo zero numerico esplicito rimane zero. Il lettore unico resta `tokenDaCache`.

## File effettivamente toccati

Percorsi relativi a `harness-ui/`; righe rilevate sulla copia finale:

| File | Righe | Modifica |
|---|---|---|
| `src/provider-registry.mjs` | 175, 504 | Record Z.AI, cinque modelli, listino datato e verifica dei nuovi metadati |
| `src/provider-probe.mjs` | 116, 201, 253 | Diagnosi umana, stato HTTP, ripiego documentato e proiezione `metadatiNoti` |
| `src/model-destination.mjs` | 131 | Etichetta umana negli errori; instradamento Z.AI già derivato dal registro |
| `src/openai-compatible-runtime.mjs` | 31 | Traduttore puro `preparaRichiestaCompatibile`, da collegare al router |
| `src/usage-cache.mjs` | 113 | Null e altri valori non numerici non diventano zero |
| `frontend/src/components/fonti-modelli.js` | 62, 108 | Fonte Z.AI e disponibilità dopo configurazione |
| `tests/provider-zai.test.mjs` | 18, 41, 56, 68, 87, 105, 114, 140, 154, 168, 216 | Nuovo, undici scenari permanenti; PD-10 resta rosso |
| `tests/usage-cache.test.mjs` | 14 | PD-CACHE, con fixture della documentazione ufficiale |
| `frontend/tests/unit/fonti-modelli.test.mjs` | 36, 39 | Parità della lista e PD-UI |
| `.claude/RAPPORTO-PD-ZAI-DIRETTO-2026-09-12.md` | 1 | Nuovo, ricerca, registro operativo e consegna |

**10 file**. `src/provider-credential-store.mjs`, `src/config.mjs`, `tests/provider-registry-parita.test.mjs` e `tests/http-routes-providers.test.mjs` sono rimasti invariati. Nessun file proibito scritto. Nessuna modifica al lockfile o dipendenza installata.

## Test finali

Comando eseguito:

```powershell
rtk proxy node --test --test-reporter=spec tests/provider-zai.test.mjs tests/usage-cache.test.mjs frontend/tests/unit/fonti-modelli.test.mjs tests/provider-registry-parita.test.mjs tests/http-routes-providers.test.mjs
```

| File | Test | Passati | Falliti |
|---|---:|---:|---:|
| `tests/provider-zai.test.mjs` | 11 | 10 | 1 |
| `tests/usage-cache.test.mjs` | 9 | 9 | 0 |
| `frontend/tests/unit/fonti-modelli.test.mjs` | 5 | 5 | 0 |
| `tests/provider-registry-parita.test.mjs` | 11 | 10 | 1 |
| `tests/http-routes-providers.test.mjs` | 8 | 8 | 0 |
| **Totale** | **44** | **42** | **2** |

Durata totale misurata da Node: **473,7256 ms**. Saltati 0, annullati 0, TODO 0. Uscita del processo 1. Non si dichiara la suite verde.

- **PAR-06**, `provider-registry-parita.test.mjs:187`: al template manca `zai`; attesi 9 fornitori con credenziale, presenti 8. Il test non è stato modificato o aggirato.
- **PD-10**, `provider-zai.test.mjs:216`: il router vero invia ancora `reasoning_effort: low` perché non chiama il traduttore. Fallimento osservato: `'low' !== undefined`. È un caso permanente, senza skip.
- Emendamento TDD PD-05/PD-11: prima **2 falliti su 2**, poi **2 passati su 2** dopo la correzione; ultima esecuzione mirata 430,2356 ms.
- `rtk proxy git diff --check` sui file assegnati: nessun errore. Le righe dei due file nuovi sono controllate separatamente.

Il nome reale del solo file `usage-cache*.test.mjs` trovato è `tests/usage-cache.test.mjs`. Non sono state eseguite altre suite, build o installazioni.

## Prova dichiaratamente finta del diretto

PD-09 usa un server HTTP di loopback su porta assegnata dal sistema, con una credenziale **finta**. Un secondo server isolato espone `createHttpApp` con lo stesso negozio credenziali e la sonda reale. Entrambi vengono chiusi tramite `t.after`; non viene avviato `server.mjs`.

Percorso verificato: GET `/api/v1/providers/zai/models` → sonda → GET `/api/paas/v4/models`; due POST `/api/paas/v4/chat/completions` con corpo adattato esplicitamente, primo turno con `tool_calls`, secondo con messaggio `tool` e `tool_call_id`, risposta SSE «uno.». Catalogo, sonda e due generazioni del banco sono HTTP 200. Le intestazioni Bearer, il modello remoto senza prefisso e il corpo privo di `extra_body` sono verificati con asserzioni. Ogni risposta finta porta `usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }`, senza campo cache: `tokenDaCache(..., 'zai') === null`, cioè **non misurato**.

Il tempo al primo token del banco finto **non è stato misurato**; 39,4463 ms è la durata totale del test PD-09, non una latenza del modello. Il banco dimostra il contratto del componente, non la disponibilità di Z.AI né la qualità del modello.

La sola generazione reale tentata è OpenRouter, riportata nel JSON precedente: **HTTP 401, 401,39 ms**, nessun primo token e nessun uso dichiarato. Non sono state fatte ritentate né rigenerate credenziali. Non è stata registrata alcuna spesa stimata come costo reale. Il confronto diretto/OpenRouter resta **non misurato**.

## Diff non applicati

Questi sono i due agganci necessari individuati. Il template è esplicitamente vietato; `runtime-owner-adapter.mjs` non compare nell’elenco autorizzato. I diff sono consegnati per l’owner, non applicati al worktree.

### 1. Collegare il traduttore al router

Il diff aggiunge un callback opzionale `onAvviso`. Quando il chiamante lo fornisce, riceve gli avvisi e la richiesta parte con il campo non ammesso omesso. Quando manca un canale per dichiarare l’omissione, il diff proposto interrompe la richiesta con un errore italiano prima della rete: scelta esplicita fail-closed. La gestione visibile e persistente degli avvisi non è implementata in questo lotto; per proseguire automaticamente mostrando un avviso in chat serve un successivo aggancio al canale degli eventi, da progettare e verificare nella lane competente. I livelli ammessi non generano avvisi e seguono la normale richiesta.

```diff
--- a/harness-ui/src/runtime-owner-adapter.mjs
+++ b/harness-ui/src/runtime-owner-adapter.mjs
@@ -19,1 +19,2 @@
-import { nativeProviderResponse, stripNativeMetadata } from './native-provider-adapter.mjs';
+import { nativeProviderResponse, stripNativeMetadata } from './native-provider-adapter.mjs';
+import { preparaRichiestaCompatibile, OpenAiCompatibleRuntimeError } from './openai-compatible-runtime.mjs';
@@ -489,1 +490,1 @@
-export function creaFetchMultiProvider(fetchDiRete = fetch, { risolvi = risolviDestinazioneModello, dipendenze = null } = {}) {
+export function creaFetchMultiProvider(fetchDiRete = fetch, { risolvi = risolviDestinazioneModello, dipendenze = null, onAvviso = null } = {}) {
@@ -545,1 +546,6 @@
-    const corpoRiscritto = JSON.stringify({ ...corpo, model: destinazione.modelloRemoto });
+    const adattata = preparaRichiestaCompatibile(destinazione.fonte, { ...corpo, model: destinazione.modelloRemoto });
+    for (const avviso of adattata.avvisi) {
+      if (typeof onAvviso !== 'function') throw new OpenAiCompatibleRuntimeError(avviso, 'PROVIDER_REASONING_UNSUPPORTED');
+      await onAvviso(avviso);
+    }
+    const corpoRiscritto = JSON.stringify(adattata.corpo);
```

### 2. Opzione Z.AI nel template

La riga è lunga perché il template contiene la sezione intera su una riga. L’unica aggiunta funzionale è l’opzione Z.AI dopo DeepSeek.

```diff
--- a/harness-ui/frontend/index.template.html
+++ b/harness-ui/frontend/index.template.html
@@ -1401,1 +1401,1 @@
-<div class="overlay-layer overlay-layer--modal" id="veloFornitori" data-c="OverlayLayer" hidden><div class="talos-dialog talos-dialog--medium" data-c="Dialog" role="dialog" aria-modal="true" aria-labelledby="titoloveloFornitori"><button type="button" class="talos-resizer talos-resizer--dialog talos-resizer--dialog-width" data-c="Resizer" data-dialog-resize="width" aria-label="Ridimensiona larghezza della finestra" title="Trascina o usa le frecce · doppio clic per la misura normale"></button><button type="button" class="talos-resizer talos-resizer--dialog talos-resizer--dialog-height" data-c="Resizer" data-dialog-resize="height" aria-label="Ridimensiona altezza della finestra" title="Trascina o usa le frecce · doppio clic per la misura normale"></button><button type="button" class="talos-resizer talos-resizer--dialog talos-resizer--dialog-both" data-c="Resizer" data-dialog-resize="both" aria-label="Ridimensiona larghezza e altezza della finestra" title="Trascina o usa le frecce · doppio clic per la misura normale"></button><div class="talos-dialog__header"><div class="talos-grow"><span class="talos-eyebrow">TALOS</span><h2 class="talos-dialog__title" id="titoloveloFornitori">Fornitori e accessi</h2></div><button class="talos-button talos-button--secondary talos-icon-button" data-chiudi="veloFornitori" aria-label="Chiudi Fornitori e accessi"><svg class="i" aria-hidden="true"><use href="#i-x"/></svg></button></div><div class="talos-dialog__body"><div class="talos-stack"><label class="talos-stack">Fornitore<select class="talos-select" id="providerLab"><option value="openrouter">OpenRouter</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="deepseek">DeepSeek</option><option value="gemini">Gemini</option><option value="ollama">Ollama</option><option value="lmstudio">LM Studio</option><option value="huggingface">Hugging Face</option></select></label><article class="talos-card talos-provider" data-c="ProviderCard" data-provider-id="openrouter" aria-busy="false"><button class="talos-provider__head" type="button" data-provider-toggle="openrouter" aria-expanded="true" aria-controls="provider-body-openrouter"><strong class="talos-provider__name">OpenRouter</strong><span class="talos-cluster"><span class="talos-badge talos-badge--sm talos-badge--success" data-c="Badge">Chiave salvata</span><span class="talos-badge talos-badge--sm" data-c="Badge">Indirizzo predefinito</span><span class="talos-badge talos-badge--sm talos-badge--warning" data-c="Badge">Mai provato</span></span></button><div class="talos-provider__body" id="provider-body-openrouter"><label class="talos-stack talos-provider__field"><span class="talos-muted">Sostituisci la chiave</span><input class="talos-field__input" type="password" data-provider-key="openrouter" autocomplete="off" spellcheck="false" placeholder="Incolla una nuova chiave" id="providerChiave"></label><label class="talos-stack talos-provider__field"><span class="talos-muted">Indirizzo del servizio</span><input class="talos-field__input" type="url" data-provider-endpoint="openrouter" autocomplete="off" id="providerIndirizzo" value="https://openrouter.ai/api/v1"></label><label class="talos-stack talos-provider__field"><span class="talos-muted">Tempo massimo (secondi)</span><input class="talos-field__input" type="number" data-provider-timeout="openrouter" autocomplete="off" min="5" max="300" step="1" id="providerTimeout" value="60"></label><div class="talos-cluster"><button class="talos-button talos-button--primary talos-button--sm" type="button" data-c="Button" data-provider-action="salva">Salva chiave</button><button class="talos-button talos-button--secondary talos-button--sm" type="button" data-c="Button" data-provider-action="test">Prova collegamento</button><button class="talos-button talos-button--secondary talos-button--sm" type="button" data-c="Button" data-provider-action="save-runtime">Salva collegamento</button><button class="talos-button talos-button--ghost talos-button--danger talos-button--sm" type="button" data-c="Button" data-provider-action="rimuovi">Rimuovi chiave</button></div><p class="talos-muted" data-provider-feedback="openrouter" role="status" hidden=""></p></div></article><button class="talos-button talos-button--secondary talos-button--sm" data-c="Button" data-provider-action="tutti">Prova tutti</button><p class="talos-muted" role="status" id="providerStato">Seleziona un fornitore per verificare il suo accesso.</p></div></div><div class="talos-dialog__footer"><span class="talos-dialog__footer-note">Le chiavi sono riservate: non vengono mostrate nelle conversazioni.</span></div></div></div>
+<div class="overlay-layer overlay-layer--modal" id="veloFornitori" data-c="OverlayLayer" hidden><div class="talos-dialog talos-dialog--medium" data-c="Dialog" role="dialog" aria-modal="true" aria-labelledby="titoloveloFornitori"><button type="button" class="talos-resizer talos-resizer--dialog talos-resizer--dialog-width" data-c="Resizer" data-dialog-resize="width" aria-label="Ridimensiona larghezza della finestra" title="Trascina o usa le frecce · doppio clic per la misura normale"></button><button type="button" class="talos-resizer talos-resizer--dialog talos-resizer--dialog-height" data-c="Resizer" data-dialog-resize="height" aria-label="Ridimensiona altezza della finestra" title="Trascina o usa le frecce · doppio clic per la misura normale"></button><button type="button" class="talos-resizer talos-resizer--dialog talos-resizer--dialog-both" data-c="Resizer" data-dialog-resize="both" aria-label="Ridimensiona larghezza e altezza della finestra" title="Trascina o usa le frecce · doppio clic per la misura normale"></button><div class="talos-dialog__header"><div class="talos-grow"><span class="talos-eyebrow">TALOS</span><h2 class="talos-dialog__title" id="titoloveloFornitori">Fornitori e accessi</h2></div><button class="talos-button talos-button--secondary talos-icon-button" data-chiudi="veloFornitori" aria-label="Chiudi Fornitori e accessi"><svg class="i" aria-hidden="true"><use href="#i-x"/></svg></button></div><div class="talos-dialog__body"><div class="talos-stack"><label class="talos-stack">Fornitore<select class="talos-select" id="providerLab"><option value="openrouter">OpenRouter</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="deepseek">DeepSeek</option><option value="zai">Z.AI</option><option value="gemini">Gemini</option><option value="ollama">Ollama</option><option value="lmstudio">LM Studio</option><option value="huggingface">Hugging Face</option></select></label><article class="talos-card talos-provider" data-c="ProviderCard" data-provider-id="openrouter" aria-busy="false"><button class="talos-provider__head" type="button" data-provider-toggle="openrouter" aria-expanded="true" aria-controls="provider-body-openrouter"><strong class="talos-provider__name">OpenRouter</strong><span class="talos-cluster"><span class="talos-badge talos-badge--sm talos-badge--success" data-c="Badge">Chiave salvata</span><span class="talos-badge talos-badge--sm" data-c="Badge">Indirizzo predefinito</span><span class="talos-badge talos-badge--sm talos-badge--warning" data-c="Badge">Mai provato</span></span></button><div class="talos-provider__body" id="provider-body-openrouter"><label class="talos-stack talos-provider__field"><span class="talos-muted">Sostituisci la chiave</span><input class="talos-field__input" type="password" data-provider-key="openrouter" autocomplete="off" spellcheck="false" placeholder="Incolla una nuova chiave" id="providerChiave"></label><label class="talos-stack talos-provider__field"><span class="talos-muted">Indirizzo del servizio</span><input class="talos-field__input" type="url" data-provider-endpoint="openrouter" autocomplete="off" id="providerIndirizzo" value="https://openrouter.ai/api/v1"></label><label class="talos-stack talos-provider__field"><span class="talos-muted">Tempo massimo (secondi)</span><input class="talos-field__input" type="number" data-provider-timeout="openrouter" autocomplete="off" min="5" max="300" step="1" id="providerTimeout" value="60"></label><div class="talos-cluster"><button class="talos-button talos-button--primary talos-button--sm" type="button" data-c="Button" data-provider-action="salva">Salva chiave</button><button class="talos-button talos-button--secondary talos-button--sm" type="button" data-c="Button" data-provider-action="test">Prova collegamento</button><button class="talos-button talos-button--secondary talos-button--sm" type="button" data-c="Button" data-provider-action="save-runtime">Salva collegamento</button><button class="talos-button talos-button--ghost talos-button--danger talos-button--sm" type="button" data-c="Button" data-provider-action="rimuovi">Rimuovi chiave</button></div><p class="talos-muted" data-provider-feedback="openrouter" role="status" hidden=""></p></div></article><button class="talos-button talos-button--secondary talos-button--sm" data-c="Button" data-provider-action="tutti">Prova tutti</button><p class="talos-muted" role="status" id="providerStato">Seleziona un fornitore per verificare il suo accesso.</p></div></div><div class="talos-dialog__footer"><span class="talos-dialog__footer-note">Le chiavi sono riservate: non vengono mostrate nelle conversazioni.</span></div></div></div>
```

**Verifica dei candidati solo in memoria:** il modulo runtime è stato trasformato e importato da una data URL, conservando la risoluzione dei suoi import; il template è stato trasformato come stringa. Cinque controlli passati: invio `high`, invio `max`, omissione `low` con avviso al callback, rifiuto `low` senza callback prima della rete, parità esatta delle opzioni del template. Nessuna copia modificata dei due file è stata scritta su disco. Questa prova non rende verdi i cancelli sul worktree attuale.

**Nessun diff necessario per caricare il catalogo in `frontend/src/legacy/app.js`**: `caricaDiretti` itera già `PROVIDER_DIRETTI` e usa le rotte derivate dal registro. `effortCompatibilePerModello` legge già la proiezione `reasoning` ora restituita dalla sonda. Nessun diff a `src/http-app.mjs` necessario per il catalogo.

## Cosa NON è verificato

- Generazione Z.AI reale, tool calling remoto, streaming remoto, credito, rate limit e disponibilità dei cinque modelli per un account Z.AI.
- TTFT diretto/OpenRouter, costo effettivo, risparmio e cache hit positivo: mancano una chiave Z.AI e una credenziale OpenRouter accettata nella prova.
- GET `/models` Z.AI con una chiave reale: il percorso non è nell’indice documentale; 404 e ripiego sono stati verificati solo con risposte finte.
- Percorso completo dal composer, più turni in linguaggio naturale, refusi, URL naturali, ricarica e persistenza; gli agganci descritti restano fuori perimetro.
- UI reale a sette fonti su desktop/mobile, tastiera, moto ridotto e stati di errore: unit test presenti, nessuna verifica visiva o build condivisa.
- Visualizzazione persistente dell’avviso del ragionamento e di «non misurato» nella chat finale: dati e lettore corretti, superfici di sessione/kernel escluse dal lotto.
- Profilo Anthropic P-J, ingressi multimodali, ragionamento preservato fra turni e aggiornamenti futuri delle pagine non versionate.

## Proposta di testo di commit

Da usare solo dopo aver risolto i due cancelli rossi e coordinato gli agganci:

```text
feat(fornitori): aggiunge Z.AI diretto con catalogo datato e controllo del ragionamento

Aggiunge il record unico Z.AI, gli alias delle credenziali e il catalogo GLM.
Distingue gli esiti della sonda e mantiene non misurata la cache assente.
Collega il selettore e il traduttore del ragionamento ai contratti esistenti.
```

Non eseguito: nessun `git add`, `git commit` o `git push`.

## Cosa deve fare l’owner · Cosa faccio io · Cosa rimane

**Cosa deve fare l’owner:** far applicare nella lane proprietaria i diff del template e del router, decidere il canale visibile degli avvisi, rendere disponibile una chiave Z.AI e verificare l’accesso OpenRouter che qui ha risposto 401. Le chiavi vanno nel portachiavi o nell’ambiente del server, mai nel rapporto.

**Cosa faccio io:** consegno i dieci file indicati, il test permanente che segnala l’aggancio mancante e i diff verificati in memoria. Tutto il lavoro eseguibile nel perimetro è su disco; nessun server del banco resta aperto e la porta 4174 non è stata usata.

**Cosa rimane:** rendere verdi PAR-06 e PD-10 sul codice effettivo, completare avvisi e verifica del composer/UI, poi provare Z.AI e OpenRouter con accessi funzionanti. **P-D non è dichiarato concluso end to end.**
