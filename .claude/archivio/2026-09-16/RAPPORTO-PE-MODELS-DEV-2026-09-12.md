# PO-14 P-E — models.dev, 12 settembre 2026

Rapporto e registro di esecuzione di Astra. Sottosistemi: integrazione cataloghi del server desktop e TALOS UI. Nessun commit e nessuna modifica ai file degli altri agenti. La cartella `.claude/` alla radice è fuori dal perimetro scrivibile: consegna in `harness-ui/.claude/`.

## Ricerca prima del codice — fonti consultate il 12/09/2026

1. **Hermes per primo.** [agent/models_dev.py, revisione b7b35a84b7fbe1aa2e223a6ce726a2471300d0a4](https://github.com/NousResearch/hermes-agent/blob/b7b35a84b7fbe1aa2e223a6ce726a2471300d0a4/agent/models_dev.py): memoria, disco, rete; TTL applicativo di quattro ore; tentativi dopo cinque minuti in caso di guasto; aggiornamento condizionale solo con una copia utilizzabile; rifiuto/quarantena di copie vuote o corrotte; URL configurabile. I valori predefiniti zero/false della sua struttura ModelInfo **non** vengono adottati: qui l'assenza resta `null` e a schermo «non disponibile». Si adatta il comportamento, senza incorporare codice Python.
2. **Fonte adottata direttamente:** [models.dev, README alla revisione e7a74d6dc7ce56d1a9dda94c18fcf185248d77b4](https://github.com/anomalyco/models.dev/blob/e7a74d6dc7ce56d1a9dda94c18fcf185248d77b4/README.md). `sst/models.dev` reindirizza ora ad `anomalyco/models.dev`. L'API pubblica completa è `https://models.dev/api.json`; `models.json` descrive il modello indipendentemente dal servizio e non basta per i prezzi dei singoli fornitori.
3. **Contratto fissato:** [schema.ts alla stessa revisione](https://github.com/anomalyco/models.dev/blob/e7a74d6dc7ce56d1a9dda94c18fcf185248d77b4/packages/core/src/schema.ts). Oggetto indicizzato per id del fornitore; ogni record contiene `id`, `name`, `env`, `npm`, `doc`, eventualmente `api`, e `models`, a sua volta oggetto indicizzato per id modello. Campi modello: `id`, `name`, `limit.context/input/output`, `cost`, `tool_call`, `reasoning`, `modalities.input/output`, `release_date`, `last_updated`. Prezzi `cost.input/output/cache_read/cache_write/reasoning/input_audio/output_audio`: **USD per milione di token**. Sono presenti anche fasce `cost.tiers` con soglia di contesto e il campo compatibile `context_over_200k`; non vanno appiattite fingendo un prezzo unico.
4. **Aggiornamenti:** [sync-models.yml](https://github.com/anomalyco/models.dev/blob/e7a74d6dc7ce56d1a9dda94c18fcf185248d77b4/.github/workflows/sync-models.yml) pianifica la sincronizzazione al minuto 17 di ogni ora, con PR e validazione; [deploy.yml](https://github.com/anomalyco/models.dev/blob/e7a74d6dc7ce56d1a9dda94c18fcf185248d77b4/.github/workflows/deploy.yml) pubblica sui push a `dev`. Questo non è una garanzia che ogni prezzo cambi ogni ora. Nessuna SLA osservata. Il TTL del client è una scelta di cache applicativa, non la frequenza garantita della fonte.
5. **Licenza:** [LICENSE](https://github.com/anomalyco/models.dev/blob/e7a74d6dc7ce56d1a9dda94c18fcf185248d77b4/LICENSE), MIT, copyright 2025 models.dev. Il repository dei dati non dichiara una licenza separata per il dataset; si conserva il testo della licenza nella copia persistita. La licenza dei dati non sostituisce quella dei pesi dei singoli modelli.
6. **HTTP:** [RFC 9110, If-None-Match](https://www.rfc-editor.org/rfc/rfc9110.html#name-if-none-match): ETag opaco, confronto debole consentito per GET, 304 privo di rappresentazione da riscaricare. Prova pubblica già eseguita: 200 con ETag debole, secondo GET condizionale 304 e zero byte di corpo. `Cache-Control: public, max-age=0, must-revalidate`.
7. **Alternativa esaminata:** [SDK ufficiale client.ts](https://github.com/anomalyco/models.dev/blob/e7a74d6dc7ce56d1a9dda94c18fcf185248d77b4/packages/sdk/src/client.ts), pacchetto `@opencode-ai/models`. Restituisce JSON, non espone le intestazioni nella risposta, considera 304 errore e lascia esplicitamente la cache al chiamante. Non adottato per questo confine: occorre gestire risposta HTTP, validatore e persistenza. Si adotta invece direttamente l'API supportata, dietro adattatore AVM, con `fetch` nativo e Zod già fissato a 4.5.4 nel progetto. Nessuna dipendenza nuova.

Il pin identifica lo **schema esaminato**, non pretende di immobilizzare il servizio pubblico. Ogni rappresentazione osservata avrà ETag, data di acquisizione e impronta SHA-256; variazioni incompatibili del contratto saranno rifiutate.

## Registro di esecuzione — scritto prima delle modifiche di comportamento

File di proprietà esclusiva di questo lotto:

- **Creare** `src/model-catalog-models-dev.mjs`: `ModelsDevCatalogError`, `MODELS_DEV_SCHEMA_REVISION`, `createModelsDevCatalog`, relativo metodo `ottieni`, proprietà `percorsoCache`; `createProviderModelCatalog`, relativo metodo `ottieni`. Schemi interni Zod per rappresentazione, modello, prezzi, fasce e busta persistita versione 1. Campi numerici/booleani mancanti restituiti come `null`; identificatori di scelta diretta con prefisso del nostro registro. Nessun endpoint o header del dataset comanda chiamate ai fornitori.
- **Modificare** `src/config.mjs`: soltanto `TALOS_HARNESS_UI_MODELS_DEV_URL`, proprietà `modelsDevUrl` di `loadConfig` e validazione del relativo URL HTTP(S) senza credenziali. Cartella cache sotto `config.cartellaStore` (`TALOS_HARNESS_UI_SESSIONS_DIR`, default `.sessions-store/`).
- **Modificare** `src/provider-registry.mjs`: soltanto campo additivo `modelsDevId` nei dieci record e `deepseek.catalogo.inUI` per rendere raggiungibile la sua scheda. Nessuna rimozione dei record P-D o modifica dei simboli pubblici.
- **Modificare** `frontend/src/components/fonti-modelli.js`: voce DeepSeek condizionata alla presenza della chiave, `descrizioneModelloSelettore` e `aggiornaTestoModelloSelettore` per nomi e dettagli umani, prezzi col formatter italiano già presente in `catalogo-modelli.js`, data ed età misurata. Restano stabili tutti gli export esistenti.
- **Creare** `tests/model-catalog-models-dev.test.mjs`: fixture minima incorporata, fetch/clock/disco iniettabili; scenari PE elencati sotto; prova anche configurazione e compatibilità con il catalogo OpenRouter esistente.
- **Modificare** `frontend/tests/unit/fonti-modelli.test.mjs`: scheda DeepSeek e prove di formattazione/rendering senza rete.
- **Creare/aggiornare** questo rapporto: ricerca, registro, risultati, diff non applicati e consegna.

Nessun file cancellato. `src/model-catalog.mjs` resta intatto: la sua normalizzazione OpenRouter e i prezzi per token hanno un contratto diverso dal dataset per milione. Il nuovo modulo conserva campi compatibili per token e aggiunge prezzi espliciti per milione; il costo effettivo del giro continua a dipendere da usage/credito.

### RED e GREEN previsti

- PE-01 normalizzazione/ordinamento/mappa, PE-02 assenze e zeri espliciti, PE-03 fasce prezzo.
- PE-04 ETag/304 senza leggere il corpo; PE-05 riavvio/ETag persistito; PE-06 rete assente con età della copia; PE-07 cache corrotta rifiutata; PE-08 recupero senza ETag dalla copia rifiutata; PE-09 risposta malformata non sostituisce copia valida; PE-10 fornitore non mappato e registro stabile.
- PE-11 richieste concorrenti con un solo download; PE-12 cambio URL isola ETag e copia; PE-13 chiave presente/assente senza passare segreti al fetch; PE-14 configurazione; PE-15 compatibilità OpenRouter; PE-16 errori disco e risposta 304 senza copia; PE-17 nessuna capacità inventata e nessuna lista locale spacciata per installata.
- PE-UI nomi umani, prezzo italiano, zero dichiarato distinto da assenza, contesto, data/età, testo DOM sicuro e id di selezione immutato.
- RED: i nuovi import/funzioni/record sono assenti; i test devono fallire prima del prodotto.
- GREEN: `rtk proxy node --test tests/model-catalog-models-dev.test.mjs frontend/tests/unit/fonti-modelli.test.mjs tests/provider-registry-parita.test.mjs tests/http-routes-providers.test.mjs`.
- Regressioni interessate: catalogo OpenRouter, schede BC-12/P-C/P-D, parità registro, rotte provider. Si eseguono **solo** i file richiesti/toccati, senza suite completa o build condivisa, come chiesto dall'owner.
- Cancello reale: GET pubblico senza chiavi, GET condizionale e uso dell'adattatore reale con cartella temporanea; conteggi e prezzi datati nel rapporto.
- Prova umana: rendering del frammento del selettore verificato nei test. Il percorso completo in app dipende dai collegamenti ai file vietati, da consegnare come diff e dichiarare non verificato.
- Ripristino: rimuovere soltanto i nuovi file di questo lotto e le sue aggiunte identificate dal diff; la cache ha un proprio nome/versione e può essere ignorata. Nessun ripristino globale del worktree.

### Confini di collegamento già verificati

La rotta sorella **esiste già**, `/api/v1/providers/:id/models`, ed è quella usata da `caricaDiretti`. Si propone quella, lasciando `/api/v1/models` OpenRouter. La funzione di collegamento riceve solo un controllo booleano della presenza di credenziale: nessuna chiave entra nel catalogo pubblico.

L'ispezione ha inoltre mostrato che `fonti-modelli.js` gestisce fonti/stati, mentre la riga DOM è costruita da `rigaModello` in `frontend/src/legacy/app.js:6011`. Il divieto su quel file impedisce di collegare in questo lotto il nuovo renderer italiano. Servono diff non applicati anche per quel punto e per l'iniezione in `server.mjs`, che non appartiene alla lista scrivibile. Nessuna modifica laterale o mutazione implicita del DOM per aggirare il confine.

## Risultati e consegna

Prima verifica RED: 2 file falliti per import/export assenti, 0 passati. Dopo la prima implementazione: 49 test, 48 passati e 1 fallito. PE-UI-02 ha rilevato che l'Intl della versione Node in uso non raggruppa automaticamente le quattro cifre italiane: si imposta `useGrouping: true` e lo scenario resta permanente. Revisione locale: aggiunto PE-20, rinvio dei tentativi anche quando la rete cade senza alcuna copia; la prima implementazione rinviava soltanto con copia presente. Questi aggiornamenti non ampliano i file di proprietà.

Seconda revisione, prima della consegna: il codice `PROVIDER_KEY_MISSING` già usato dalla vecchia sonda non è registrato in HTTP e diventerebbe 500. PE-21 esercita l'adattatore attraverso la **rotta reale invariata**, usando l'iniezione `providerProbe.elencaModelli` e richieste/risposte in memoria, senza socket: deve dare 422 con chiave assente, 200 con prezzi e 503 con catalogo assente. La nuova porta userà i codici HTTP già registrati `PROVIDER_KEY_REQUIRED` e `CATALOG_UPSTREAM_ERROR`; nessuna modifica al codice della vecchia sonda. Si dichiara inoltre `credenzialeVerificata: false`: avere una chiave non ne dimostra la validità.


## Decisione e contratto consegnato

Il nuovo modulo separa le unità e il ciclo di vita dei due cataloghi. OpenRouter conserva `createModelCatalog().ottieni()`, i propri alias e i prezzi per token. `createModelsDevCatalog({ cartellaStore, url, fetchFn, clock })` legge direttamente l'API pubblica e offre `ottieni(idFornitore, { forzaAggiornamento })`.

La risposta espone `disponibile`, `motivo`, `modelli`, `modelsDevId`, `fonte`, `aggiornatoAlle` (acquisizione dei dati), `verificatoAlle` (ultima conferma), `etaCacheMs`, `daCache`, `fallbackRete` e `avvisi`. L'età è calcolata sul clock iniettato, non sul campo `Date` del server esterno; se l'orologio arretra l'età è sconosciuta, non zero. Il 304 aggiorna soltanto la conferma, senza ringiovanire la data di acquisizione.

Ogni modello contiene id di selezione, id upstream, nome umano, contesto/limiti, prezzi compatibili per token e `prezziPerMilione` espliciti (valuta USD, input/output/cache, ragionamento/audio e fasce), capacità booleane nullable, modalità e date della fonte. I metadati di provenienza sono presenti anche su ogni modello: l'attuale caricatore frontend conserva solo `.modelli`. `reasoning` storico resta null: un booleano non descrive i livelli supportati. Il contesto pubblicato non viene dichiarato misurato (`contestoVerificato: false`).

La cache applicativa è `<config.cartellaStore>/cache/models-dev-<impronta URL>.json`, busta versione 1 con URL, revisione dello schema, ETag, due timestamp, SHA-256 della rappresentazione JSON, dati e licenza MIT completa. Il nome impedisce di riutilizzare ETag e contenuti di un altro mirror. Scrittura su temporaneo e rename atomico; una promessa condivisa evita download doppi fra schede. Una copia corrotta resta rifiutata: non viene silenziosamente trasformata in elenco vuoto, non si invia il suo ETag, si tenta il recupero e si espone il rifiuto anche se il recupero riesce. Il fallimento di persistenza è separato dall'indisponibilità della fonte.

Il TTL applicativo di quattro ore, il rinvio di cinque minuti e il timeout di richiesta di 15 secondi sono **parametri di controllo**, non durate osservate o promesse a schermo. Questa prima integrazione attende il tentativo di aggiornamento quando la copia è scaduta; non adotta il thread di aggiornamento in sottofondo di Hermes.

`createProviderModelCatalog({ catalogo, chiaveConfigurata }).ottieni(id)` è la funzione da collegare alla rotta: verifica ogni volta solo la presenza della chiave, senza riceverla o spedirla a models.dev. La rimozione di una chiave impedisce l'accesso al selettore anche se i metadati sono ancora in memoria. Le sonde di credenziale restano separate. Il campo `credenzialeVerificata: false` rende esplicito che il catalogo non è una verifica dell'account.

## Mappa verificata sul GET pubblico

Fonte per tutta la tabella: [api.json](https://models.dev/api.json), acquisizione locale **2026-09-12T12:05:53.719Z**. I conteggi sono voci per servizio; la somma globale non identifica modelli unici.

| Nostro id | Id in models.dev | Voci osservate | Decisione |
|---|---|---:|---|
| openrouter | openrouter | 367 | Corrispondenza esatta; resta il catalogo OpenRouter esistente sulla rotta generale |
| deepseek | deepseek | 4 | Corrispondenza esatta; nuova scheda quando collegato |
| zai | zai | 16 | Corrispondenza esatta per il servizio internazionale Z.AI |
| anthropic | anthropic | 14 | Corrispondenza esatta |
| gemini | google | 39 | L'id letterale gemini **non esiste**; Google AI Studio corrisponde a google |
| openai | openai | 48 | Corrispondenza esatta |
| lmstudio | lmstudio | 3 | Esiste, ma le voci pubbliche non dimostrano quali modelli siano installati: resta la scoperta locale |
| ollama | **non esiste** | — | `ollama-cloud` esiste con 23 voci, ma è un altro servizio; mapping null |
| huggingface | huggingface | 77 | Esiste per Inference Providers; il nostro record conserva catalogo/download e non diventa destinazione chat |
| local | **non esiste** | — | Il supervisore llama.cpp usa il suo runtime; mapping null |

Ulteriori omonimie controllate: `zhipu` **non esiste**, `zhipuai` esiste con 15 voci e `zai-coding-plan` con 7. Non si mescolano con `zai`. Anche `lm-studio` e `hugging-face` non esistono come id letterali.

## File effettivamente toccati

Percorsi relativi a `harness-ui/`; riferimenti alla versione su disco al termine del lotto.

| File | Righe di ingresso | Modifica |
|---|---|---|
| `src/model-catalog-models-dev.mjs` | 1, 12, 39, 124, 248 | Nuovo adattatore, schema fissato, cache e porta per la rotta |
| `src/config.mjs` | 416, 563 | Validazione e valore di TALOS_HARNESS_UI_MODELS_DEV_URL |
| `src/provider-registry.mjs` | 92, 126, 160, 179, 246, 286, 328, 364, 393, 433, 466 | Mapping additivo nei dieci record; DeepSeek nel catalogo UI |
| `frontend/src/components/fonti-modelli.js` | 62, 70, 162, 194 | Scheda DeepSeek e renderer con dettagli italiani |
| `tests/model-catalog-models-dev.test.mjs` | 1, 38, 305 | Fixture, 22 scenari backend/config/HTTP senza rete esterna |
| `frontend/tests/unit/fonti-modelli.test.mjs` | 3, 37, 40 | Parità delle schede, cinque nuovi scenari UI; 10 test complessivi |
| `.claude/RAPPORTO-PE-MODELS-DEV-2026-09-12.md` | 1 | Questo rapporto, ricerca, registro e diff di collegamento |

Letti ma non modificati: `src/model-catalog.mjs`, `src/http-app.mjs`, `server.mjs`, `frontend/src/legacy/app.js`, formatter del catalogo, sonda e portachiavi, inventario, istruzioni, test di parità e test HTTP preesistenti. I modelli/prezzi manuali P-D restano nel record per compatibilità con il percorso esistente; la nuova porta non li consulta. Non sono stati introdotti altri prezzi o elenchi manuali di modelli nel prodotto.

Il percorso temporaneo della prova è `C:/Users/Antonino/AppData/Local/Temp/talos-pe-eCgC9n`: contiene la risposta pubblica `api.json`, `prova.json`, `adattatore.json`, la cache del banco e il diff non applicato. Non contiene chiavi. Questi sono materiali temporanei, non nuovi file del repository.

## Verifica conclusiva

Comando eseguito su Node **v24.18.0**, ramo confermato `lane/harness-desktop`:

```text
rtk proxy node --test tests/model-catalog-models-dev.test.mjs frontend/tests/unit/fonti-modelli.test.mjs tests/provider-registry-parita.test.mjs tests/http-routes-providers.test.mjs
```

| File | Passati | Falliti |
|---|---:|---:|
| tests/model-catalog-models-dev.test.mjs | 22 | 0 |
| frontend/tests/unit/fonti-modelli.test.mjs | 10 | 0 |
| tests/provider-registry-parita.test.mjs | 11 | 0 |
| tests/http-routes-providers.test.mjs | 8 | 0 |
| **Totale** | **51** | **0** |

Nessuno saltato, annullato o TODO. I nuovi test iniettano fetch e clock; PE-21 esegue il vero gestore HTTP con richieste/risposte in memoria. Gli otto test HTTP già presenti usano soltanto loopback su porte effimere e chiudono i server. **Mai usata la porta 4174**, nessun server di sviluppo avviato.

PE-20 è stato osservato RED (2 tentativi anziché 1) e poi GREEN. PE-21 è stato osservato RED (500 anziché 422) e poi GREEN. Il renderer usa `textContent`, non HTML della fonte; PE-UI-05 verifica nome, sottotitolo e immutabilità dell'id. Le prove di formato distinguono prezzi assenti, invalidi e zero pubblicato.

`rtk proxy git diff --check -- <file autorizzati>` passato. La variante breve `rtk git` non trovava la configurazione locale di RTK: ripetuto correttamente con `rtk proxy git`, senza cambiare variabili di sistema. Il diff seguente ha passato `rtk proxy git apply --check`: è stato **solo verificato**, non applicato.

## Prova reale del servizio e dell'adattatore

GET pubblico [https://models.dev/api.json](https://models.dev/api.json), senza Authorization, completato alle **2026-09-12T12:05:53.719Z** secondo il clock locale. Il server riportava separatamente `Date: Sat, 12 Sep 2026 12:06:40 GMT`; non si confondono i due orologi.

- Stato **200**; **4.620.818 byte** del JSON dopo decompressione HTTP, non dimensione compressa del trasferimento.
- `Content-Encoding: br`; Content-Length e Last-Modified non presenti.
- ETag: `W/"4b999771d62f84b9d85fcbbb958487ef"`.
- `Cache-Control: public, max-age=0, must-revalidate`.
- SHA-256 del corpo: `4b999771d62f84b9d85fcbbb958487efdb830be185cdac406565c4a2f51ae1e1`.
- **213 fornitori**, **7.753 voci modello**.
- Secondo GET con lo stesso `If-None-Match`: **304**, **0 byte** di corpo; ETag restituito `"4b999771d62f84b9d85fcbbb958487ef"`.

Esempi dal primo GET, prezzi **USD per milione di token**, data di osservazione **12/09/2026**:

| Servizio | Voci | Modello della fonte | Ingresso | Uscita | Rilettura | Memorizzazione |
|---|---:|---|---:|---:|---:|---:|
| deepseek | 4 | DeepSeek V4 Flash Vision Exp | 0,15 | 0,60 | 0,003 | non disponibile |
| zai | 16 | GLM-4.7 | 0,60 | 2,20 | 0,11 | 0 dichiarato |
| zhipuai | 15 | GLM-5.2 | 1,40 | 4,40 | 0,26 | 0 dichiarato |
| openrouter | 367 | Qwen3.7 Max | 1,475 | 4,425 | 0,295 | 1,84375 |

`last_updated` dei rispettivi record: 2026-09-10, 2025-12-22, 2026-06-13, 2026-05-21. Sono date dei record del catalogo, non la prova che il prezzo sia stato verificato presso il fornitore in quel giorno.

Prova successiva attraverso **il modulo implementato**, acquisizione **2026-09-12T12:16:59.002Z**:

- Una sola risposta 200 alimenta DeepSeek (**4**), Z.AI (**16**) e OpenRouter (**367**); le ultime due letture usano la stessa copia.
- Aggiornamento forzato con ETag: **304**; età misurata della copia alla risposta **204 ms**, senza nuovo download.
- Nuova istanza, stessa cartella, fetch intenzionalmente offline: **16** modelli Z.AI serviti da disco, `fallbackRete: true`, età misurata **293 ms** e avviso della copia salvata.
- Esempio normalizzato DeepSeek V4 Flash: ingresso **0,15**, uscita **0,60**, rilettura **0,003**, memorizzazione **null**. Il test offline con copia vecchia di un giorno usa invece clock sintetico, non viene presentato come durata della prova reale.

Script minimo riproducibile per il GET (nessuna chiave necessaria):

```js
const risposta = await fetch('https://models.dev/api.json', {
  headers: { Accept: 'application/json' },
  signal: AbortSignal.timeout(30000),
});
if (!risposta.ok) throw new Error('Catalogo pubblico non disponibile');
const corpo = Buffer.from(await risposta.arrayBuffer());
const catalogo = JSON.parse(corpo);
console.log({
  osservatoAlle: new Date().toISOString(),
  byteJson: corpo.length,
  etag: risposta.headers.get('etag'),
  fornitori: Object.keys(catalogo).length,
  modelli: Object.values(catalogo).reduce((n, p) => n + Object.keys(p.models).length, 0),
});
```

## Diff di collegamento — NON applicato

Il primo blocco completa la rotta richiesta mantenendo l'API generale OpenRouter e la scoperta locale. Il secondo rende concreta l'iniezione già configurata nel nuovo modulo. Il terzo collega il renderer italiano **solo** alle righe provenienti dalla nuova fonte; pulsante, scelta e persistenza restano nel loro proprietario. Tutti e tre i file sono fuori dall'elenco autorizzato in scrittura. Il test PE-21 dimostra già il contratto con il gestore HTTP esistente, ma non è l'esecuzione di questo nuovo parametro di iniezione.

```diff
diff --git a/harness-ui/src/http-app.mjs b/harness-ui/src/http-app.mjs
--- a/harness-ui/src/http-app.mjs
+++ b/harness-ui/src/http-app.mjs
@@ -1961,6 +1961,7 @@
   providerStore = null,
   /** ⭐ 03/9 — la sonda che chiede al provider se accetta la credenziale. Facoltativa: senza, la rotta di prova risponde «non configurata» invece di fingere un esito. */
   providerProbe = null,
+  catalogoFornitoriFn = null, // P-E: catalogo pubblico dei diretti, con controllo presenza chiave
   // ⛔⛔⛔ 28/8 — iniettabili SOLO per il test del battito SSE sotto: mai un setInterval reale nei test unitari, stesso principio di ogni altra dipendenza di questo file.
   impostaIntervalloFn = setInterval, cancellaIntervalloFn = clearInterval,
   /*
@@ -2338,7 +2339,7 @@
     }
 
     const nativeModelsMatch = url.pathname.match(ROTTA_MODELLI_FORNITORE);
-    if (method === 'GET' && nativeModelsMatch && (providerProbe || localRuntimes)) {
+    if (method === 'GET' && nativeModelsMatch && (providerProbe || localRuntimes || catalogoFornitoriFn)) {
       const fornitoreId = nativeModelsMatch[1];
       try {
         requireNoQuery(url);
@@ -2375,6 +2376,10 @@
           sendJson(res, 200, successEnvelope({ provider: fornitoreId, modelli }, clock), method);
           return;
         }
+        if (catalogoFornitoriFn) {
+          sendJson(res, 200, successEnvelope(await catalogoFornitoriFn(fornitoreId), clock), method);
+          return;
+        }
         if (!providerProbe) { const errore = new Error('Sonda provider non configurata.'); errore.code = 'REPORT_UNAVAILABLE'; throw errore; }
         sendJson(res, 200, successEnvelope(await providerProbe.elencaModelli(fornitoreId), clock), method);
       }
diff --git a/harness-ui/server.mjs b/harness-ui/server.mjs
--- a/harness-ui/server.mjs
+++ b/harness-ui/server.mjs
@@ -15,6 +15,7 @@
 import { createSearchSourceStore } from './src/search-source-store.mjs';
 import { ENDPOINT_SENTINELLA_DUCKDUCKGO, creaTrasportoSenzaChiave } from './src/duckduckgo-search.mjs';
 import { createModelCatalog } from './src/model-catalog.mjs';
+import { createModelsDevCatalog, createProviderModelCatalog } from './src/model-catalog-models-dev.mjs';
 import { creaRegistroTerminali, MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA } from './src/pty-terminal.mjs';
 import { creaRegistroSchedeTerminale } from './src/terminal-registry.mjs'; // ⭐ 05/9, W1-01
 import { creaServizioGit } from './src/git-service.mjs'; // ⭐ 05/9, W1-05
@@ -114,6 +115,12 @@
     leggiRuntime: (provider) => providerStore.getRuntime(provider),
   });
   const modelCatalog = createModelCatalog();
+  const modelsDevCatalog = createModelsDevCatalog({
+    cartellaStore: config.cartellaStore, url: config.modelsDevUrl,
+  });
+  const providerModelCatalog = createProviderModelCatalog({
+    catalogo: modelsDevCatalog, chiaveConfigurata: id => providerStore.hasKey(id),
+  });
   /*
    * ⛔ 03/9 — LEGAME TARDIVO, e non per eleganza: il supervisore di
    * llama-server viene creato più in basso in questo file (serve il catalogo
@@ -638,6 +645,7 @@
     provaRicercaWebFn,
     token: config.token, // ⭐ 04/9, W1-10 — cancello a token per la shell Electron
     catalogoModelliFn: (opts) => modelCatalog.ottieni(opts),
+    catalogoFornitoriFn: (id, opts) => providerModelCatalog.ottieni(id, opts),
     capacitaMacchinaFn: () => misuraCapacitaMacchina({ storagePath: config.publicDir }),
     localRuntimes,
     runtimeBootstrapFn: async () => {
diff --git a/harness-ui/frontend/src/legacy/app.js b/harness-ui/frontend/src/legacy/app.js
--- a/harness-ui/frontend/src/legacy/app.js
+++ b/harness-ui/frontend/src/legacy/app.js
@@ -1,7 +1,7 @@
 import { colonnaConversazione, scorrevoleConversazione } from '../bridge/conversazione-dom.js';
 import {aggiornaProviderList,montaProviderPanel} from '../components/provider-card.js';
 import { POLITICHE, nomeUmanoPolitica, descrizionePolitica, notaPolitica, valoriPolitiche } from '../components/politiche.js';
-import { PROVIDER_DIRETTI, eFonteDiretta, fontiDelSelettore, modelliDellaFonte, fraseVuotoDiretto, senzaChiave } from '../components/fonti-modelli.js'; // BC-12 (11/09): «Diretti» si spezza in una scheda per fornitore // P-C (12/09): un motore locale non ha chiave da collegare
+import { PROVIDER_DIRETTI, eFonteDiretta, fontiDelSelettore, modelliDellaFonte, fraseVuotoDiretto, senzaChiave, aggiornaTestoModelloSelettore } from '../components/fonti-modelli.js'; // BC-12 (11/09): «Diretti» si spezza in una scheda per fornitore // P-C (12/09): un motore locale non ha chiave da collegare
 import { statoAvvioSessione } from '../components/avvio-sessione.js'; // BC-14 (11/09): «Avvia» non mente più sul perché è fermo
 import { nomeLeggibileSessione, identitaSessione, aggiornaSessionItem } from '../components/session-item.js'; // N1 (10/09): la riga della sessione viva cambia sul posto · BC-36/37 (12/09): nome e permesso da UNA fonte sola
 import { collegaScia, aggiornaTutteLeScie } from '../components/range-scia.js';
@@ -6020,6 +6020,9 @@
       iconWrap.className = 'sheet-icon';
       iconWrap.innerHTML = icon('i-brain');
       const textWrap = document.createElement('span');
+      if (modello.catalogo?.fonte === 'models.dev') {
+        aggiornaTestoModelloSelettore(textWrap, modello);
+      } else {
       const dettagli = [];
       if (modello.alias) dettagli.push('ultima versione'); // ⭐ 27/8 — il gruppo è già quello giusto (senza ~), l'informazione "è un alias fluttuante" resta comunque visibile qui
       if (modello.contextLength) dettagli.push(`${Math.round(modello.contextLength / 1000)}k ctx`);
@@ -6028,6 +6031,7 @@
         textElement('strong', '', modello.nome),
         textElement('small', '', dettagli.length ? `${modello.id} · ${dettagli.join(' · ')}` : modello.id),
       );
+      }
       opt.append(iconWrap, textWrap);
       if (modello.id === valoreScelto) {
         const checkSpan = document.createElement('span');
```

## Cosa NON è stato verificato

- Il collegamento in produzione: i tre diff sopra non sono applicati. Oggi i diretti continuano a usare la vecchia sonda e i dettagli italiani nuovi non sono montati nella riga del selettore.
- Build completa, suite complete, Playwright e percorso umano del composer, desktop/mobile, tastiera, riduzione movimento, reload e persistenza della selezione: esclusi dal perimetro richiesto. La persistenza della **cache** è invece provata.
- La correttezza economica dei prezzi presso i singoli fornitori, la validità delle chiavi, i permessi dell'account e l'esecuzione di ogni voce modello. Nessuna inferenza a pagamento, misura di costo effettivo o benchmark AVM ON/OFF.
- La corrispondenza di ogni modello del catalogo al trasporto di chat del runtime: models.dev comprende anche altre modalità; questo lotto espone dati e capacità, non qualifica ogni modello per l'inferenza.
- Mirror privati reali, riavvio dell'intero server, guasti di filesystem reali e concorrenza fra processi diversi. Sono provati i guasti disco iniettati e le richieste concorrenti nella stessa istanza.
- Nessuna garanzia sull'aggiornamento futuro del servizio pubblico; lo schema è fissato e verificato all'ingresso, i dati sono mobili.

## Proposta di testo di commit

`PO-14 P-E: aggiunge adattatore models.dev con cache persistente e metadati italiani per i diretti`

Corpo proposto: «Introduce mapping dei fornitori, prezzi per milione e cache ETag con rifiuto dei dati corrotti e ripiego offline datato. Aggiunge test della porta HTTP e renderer del selettore. I collegamenti a rotta, server e selettore restano come diff nel rapporto P-E. Verifica mirata: 51 test passati.»

Nessun `git add`, `git commit` o `git push` eseguito.

## Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

**Cosa deve fare l'owner:** assegnare/applicare i tre diff non applicati ai proprietari di `http-app.mjs`, `server.mjs` e `legacy/app.js`, poi coordinare build e prova del selettore su porta libera con chiusura del server. Valutare la compatibilità di inferenza delle voci offerte prima della chiusura del percorso completo.

**Cosa faccio io:** consegno i sette file elencati, il contratto normalizzato, la ricerca con pin, le prove reali e 51 test verdi, conservando tutte le modifiche degli altri agenti.

**Cosa rimane:** montaggio dei collegamenti, prova visiva e percorso completo del composer. P-E è verificato come adattatore e frammento UI; **non è dichiarato attivo end to end nell'app**.
