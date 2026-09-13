# PO-14 P-I — Kimi, MiniMax e Qwen diretti

Data di lavoro e consultazione: **12/09/2026**. Astra (Codex), ramo `lane/harness-desktop`.
Rapporto in `harness-ui/.claude/`: la `.claude/` alla radice è fuori dai percorsi scrivibili.
Nessuna operazione di staging, commit o push; nessuna chiamata a pagamento; porta 4174 esclusa.

## Ricerca prima del codice

Lettura locale: registro di 20 record, sonde, destinazioni, traduttore, cache, catalogo models.dev,
test di parità e P-G, pool P-H e selettore. Il selettore contiene **17**, non 18, voci dirette
nel checkout iniziale. Le definizioni delle credenziali, i prefissi chat e i cataloghi derivano
già dal registro. `runtime-owner-adapter.mjs:552` chiama già il traduttore.

Le pagine Moonshot reindirizzano oggi a `platform.kimi.ai`. Fonti ottenute mediante ricerca
web e apertura diretta delle pagine ufficiali; anche GET dei Markdown Kimi/MiniMax e del JSON
pubblico models.dev, senza credenziali. Le pagine senza data editoriale sono datate con la
consultazione, non con una data di pubblicazione inventata.

| Fornitore | Wire, indirizzo e autenticazione | Catalogo e cache | Fonti e date |
|---|---|---|---|
| Kimi (`kimi`) | OpenAI Chat Completions, `https://api.moonshot.ai/v1`, POST `/chat/completions`, `Authorization: Bearer`. `MOONSHOT_API_KEY` convenzionale; `KIMI_API_KEY` alias compatibile con l'inventario Hermes. Cina: `https://api.moonshot.cn/v1`, indirizzo modificabile, nessun secondo record. | GET `/models`; `usage.cached_tokens` al primo livello. Nessuna scrittura cache misurata in assenza del campo. | [Chat](https://platform.moonshot.ai/docs/api/chat), [elenco](https://platform.kimi.ai/docs/api/list-models), [parametri](https://platform.kimi.ai/docs/api/models-overview), [models.dev](https://models.dev/api.json). Consultazione 12/09/2026; data editoriale non esposta. |
| MiniMax (`minimax`) | OpenAI supportato: `https://api.minimax.io/v1`, POST `/chat/completions`, Bearer; `MINIMAX_API_KEY`. Anthropic resta il percorso raccomandato upstream, `https://api.minimax.io/anthropic`; non è obbligatorio. Cina: `https://api.minimaxi.com/v1` come variante modificabile, derivata dalla corrispondenza dei domini nel profilo Hermes; non provata dal vivo. | GET `/models` documentato; `usage.prompt_tokens_details.cached_tokens`. Sul wire OpenAI non si importa il contatore di scrittura dell'altro wire. | [OpenAI SDK](https://platform.minimax.io/docs/api-reference/text-openai-api), [modelli](https://platform.minimax.io/docs/api-reference/models/openai/list-models), [cache](https://platform.minimax.io/docs/api-reference/text-prompt-caching), [Anthropic](https://platform.minimax.io/docs/api-reference/text-anthropic-api). Consultazione 12/09/2026; data editoriale non esposta. |
| Qwen (`qwen`) | OpenAI Chat Completions, `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, Bearer; `DASHSCOPE_API_KEY`. Cina: `https://dashscope.aliyuncs.com/compatible-mode/v1`. Domini dedicati al workspace raccomandati, il dominio internazionale precedente resta supportato. | **Non** GET `{base}/models`: GET nativo `/api/v1/models` sulla stessa origine, `output.models`, `output.total`, `page_no`. Cache OpenAI: `usage.prompt_tokens_details.cached_tokens`; scrittura `prompt_tokens_details.cache_creation_input_tokens`. Marcatori `cache_control` nei contenuti conservati. | [Chat](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions), [elenco](https://www.alibabacloud.com/help/en/model-studio/list-models), [assenza elenco OpenAI](https://www.alibabacloud.com/help/en/model-studio/deepseek-harness), [cache](https://www.alibabacloud.com/help/en/model-studio/context-cache). Elenco e Chat aggiornati 11/09/2026; consultazione 12/09/2026. |

### Particolarità verificate

- Kimi K2.6 e K2.7 Code: temperatura non inviata; `reasoning_effort` non supportato,
  controllo binario `thinking`. K2.7 Code conserva il ragionamento e non lo disattiva;
  `tool_choice: required` rifiutato su entrambi, funzione forzata incompatibile con thinking.
  K3 invece supporta `low/high/max`: nessuna estensione delle regole K2 a K3.
  [Parametri](https://platform.kimi.ai/docs/api/models-overview),
  [scelta strumenti](https://platform.kimi.ai/docs/guide/use-tool-choice), consultati 12/09.
- MiniMax M3: thinking `adaptive/disabled`; M2.7 non può disattivarlo.
  Il formato separato richiede la conservazione integrale di `reasoning_details`;
  nessuna attivazione automatica di `reasoning_split` senza qualifica del ciclo completo.
  [SDK OpenAI](https://platform.minimax.io/docs/api-reference/text-openai-api), 12/09.
- Qwen: `enable_thinking` è un booleano al primo livello HTTP. Lo streaming è obbligatorio
  per il thinking di alcuni vecchi modelli aperti (es. Qwen3 32B), **non per tutti** i commerciali.
  Non rinominare automaticamente `max_tokens`: nei modelli thinking il limite può escludere
  il ragionamento, mentre `max_completion_tokens` lo include.
  [Thinking](https://www.alibabacloud.com/help/en/model-studio/deep-thinking), aggiornato 11/09;
  [Chat](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions), 12/09.
- Tutti e tre documentano `stream_options.include_usage`; si conserva quando richiesto.
  Nessun valore predefinito di `max_tokens`, durata, costo o cache viene inventato.

### Modelli pubblicati e prezzi

GET `https://models.dev/api.json` del 12/09/2026, SHA-256 integrale
`741add06396feae1e65041984505273e9192fc095b6ac13df5c3471d9ff2ffc9`.
Presenti `moonshotai`, `minimax`, `alibaba`; si usa `alibaba`, non un id `qwen` inventato.
La revisione dello schema già adottata dal progetto resta
`e7a74d6dc7ce56d1a9dda94c18fcf185248d77b4`.
La fixture P-I sarà una proiezione indipendente del GET, con prezzi e date di rilascio.

| Record | Riserve con strumenti | Ausiliario dichiarato | Prezzi pubblicati, USD per milione ingresso/uscita |
|---|---|---|---|
| `kimi` → `moonshotai` | `kimi-k2.6` (21/04/2026), `kimi-k2.7-code` (12/06/2026) | `kimi-k2.6` | Entrambi 0,95 / 4; K2.6 ha lettura cache 0,16 contro 0,19. |
| `minimax` → `minimax` | `MiniMax-M3` (01/06/2026), `MiniMax-M2.5` (12/02/2026) | `MiniMax-M2.5` | Entrambi 0,30 / 1,20 al primo scaglione; M2.5 legge cache a 0,03 contro 0,06 di M3. M3 costa di più oltre 512k. M2.5 è il candidato economico, a pari prezzo con M2.1. |
| `qwen` → `alibaba` | `qwen-flash` (28/07/2025), `qwen3.8-flash` (26/08/2026) | `qwen-flash` | 0,05 / 0,40 e 0,15 / 0,47. Turbo pubblica 0,05 / 0,20 ma ha fonti discordanti sul tool calling: escluso dalle riserve qualificate. |

Fonti strumenti: [Kimi K2.6](https://platform.kimi.ai/docs/guide/kimi-k2-6-quickstart),
[MiniMax OpenAI](https://platform.minimax.io/docs/api-reference/text-openai-api),
[Qwen Function Calling](https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling)
(aggiornato 04/09), [Qwen3.8 Flash](https://www.alibabacloud.com/help/en/model-studio/qwen3-8-flash)
(aggiornato 11/09). Tutte consultate 12/09.
Discordanza Turbo: [scheda specifica](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen-turbo)
dice strumenti non supportati, mentre guida generale e models.dev li dichiarano.
Gli ausiliari sono candidati di catalogo: nessuna qualifica di compattazione dal vivo.

### Decisione upstream

**Adattare dietro il registro e il traduttore AVM esistenti** le API HTTP ufficiali v1;
nessun SDK o protocollo nuovo, nessun pacchetto installato. Per MiniMax si adotta il percorso
OpenAI ufficialmente supportato; il percorso Anthropic è rinviabile a P-J senza duplicare il
fornitore. Riferimento maturo ispezionato: Hermes v0.21.0, pin `365e2835` dell'inventario,
file `plugins/model-providers/kimi-coding/__init__.py`, `minimax/__init__.py`, `alibaba/__init__.py`.
Pin integrale verificato in lettura: `365e2835d490a053d076daa3b429371d6f35210f`.
Non si copia codice Hermes né se ne importa il ciclo agente; nessuna nuova distribuzione o
licenza di codice upstream. I contratti datati e la fixture pubblica fissano il gate di aggiornamento.

## Ledger prima delle modifiche di prodotto

Sottosistema posseduto: integrazione provider e sicurezza del confine HTTP nell'harness desktop;
frontend limitato all'elenco esplicitamente autorizzato. Nessun agente delegato.

| File esatto | Azione e simboli |
|---|---|
| `src/provider-registry.mjs` | Modificare `REGISTRO_FORNITORI`, `verificaRegistro`: record `kimi/minimax/qwen`, profili modello documentati, forma catalogo `dashscope-output`, percorso relativo all'origine. Esportazioni e WIRE stabili. |
| `src/provider-probe.mjs` | Modificare `SONDE_PROVIDER`, `urlDellaSonda`, `createProviderProbe.prova`, `.elencaModelli`; helper privato per validare la pagina DashScope e gestire paginazione finita. Conservare `ESITI_SONDA`, `CATALOGHI_DIRETTI`, `ProviderProbeError`. |
| `src/openai-compatible-runtime.mjs` | Modificare `preparaProfiloCompatibile`; aggiungere helper privato `preparaControlloThinking`. API `preparaRichiestaCompatibile`, classe errore e codice `RUNTIME_INVALID` stabili. |
| `frontend/src/components/fonti-modelli.js` | Solo tre voci in `PROVIDER_DIRETTI`: Kimi, MiniMax, Qwen; ordine precedente stabile. |
| `tests/provider-pi.test.mjs` | Creare scenari PI-01…PI-10 e PI-PUB; record, assenza chiave, server HTTP, traduzione positiva/negativa, cache, riserve P-H, router e rotte reali isolate, catalogo pubblico. |
| `tests/fixtures/provider-pi-models-dev-2026-09-12.json` | Creare proiezione del GET pubblico, non del registro. |
| `tests/provider-registry-parita.test.mjs` | Ampliare `RISERVE_PUBBLICHE` con la fixture; nessun allentamento delle asserzioni. |
| `tests/provider-pg.test.mjs` | Solo PG-01 righe iniziali 46–47: venti → ventitré e 20 → 23, perché conta l'intero registro; gli undici percorsi P-G restano undici. |
| `frontend/tests/unit/fonti-modelli.test.mjs` | Creare PI-UI-01: etichette umane, visibilità solo dopo collegamento, conteggi e assenza di duplicati. |
| `.claude/RAPPORTO-PI-KIMI-MINIMAX-QWEN-2026-09-12.md` | Questo dossier, ledger e rapporto conclusivo. |

Nessuna cancellazione. `provider-credential-store`, `model-destination`, `usage-cache`, `config`
e `model-catalog-models-dev` già derivano dal registro: non modificarli senza emendamento motivato.
File vietati integralmente esclusi.

RED: PI-01 record assenti; PI-02 chiave assente; PI-03 sonda e catalogo finti per tutti e tre;
PI-04 particolarità Kimi, PI-05 MiniMax, PI-06 Qwen; PI-07 cache; PI-08 fallback con strumenti;
PI-09 HTTP/router reale; PI-10 catalogo e fixture; PI-UI-01 nuove etichette.
Errori attesi prima dell'implementazione: record mancanti e parametri non tradotti.
Regressioni nominate: PI-REG-PAGINA (200 malformato/paginazione incompleta non vale collegamento),
PI-REG-CONFLITTI (opzioni discordanti rifiutate), PI-REG-ISOLAMENTO (nessuna modifica ad altri modelli).

GREEN mirato: `node --test tests/provider-pi.test.mjs tests/provider-registry-parita.test.mjs tests/provider-pg.test.mjs`;
poi `tests/provider-credential-pool.test.mjs`, `tests/http-routes-providers.test.mjs`,
`tests/provider-zai.test.mjs`, `tests/model-catalog-models-dev.test.mjs`, i test esistenti di sonda,
runtime compatibile e destinazione, più `frontend/tests/unit/fonti-modelli.test.mjs`.
Gate pubblico: PI-PUB contro il JSON integrale scaricato. Nessuna inferenza upstream: tutte le
quattro variabili chiave controllate sono assenti. Prova umana automatizzata: rotte HTTP di
sonda/catalogo, etichette e messaggi; chat con strumenti su server finto. UI completa e reload
del composer non verificati dal vivo, da dichiarare senza promettere un E2E che non esiste.
Rollback: rimuovere esclusivamente i tre record, le nuove opzioni e i file P-I tramite patch
selettiva revisionata; non usare reset/revert del worktree né toccare artefatti dell'owner.

### Emendamento del ledger dopo il primo GREEN parziale

RED iniziale eseguito: 28 test, 14 verdi preesistenti, 13 fallimenti P-I attesi, 1 gate pubblico
saltato. Primo GREEN: 59 test, 54 verdi, 2 fallimenti, 3 saltati.
PI-10 usava una dipendenza di catalogo con nome errato e ometteva `cartellaStore`: corretto il banco,
senza cambiamenti al codice del catalogo. Aggiunto PI-REG-PROFILO per le nuove forme dichiarative.

**PI-REG-TEMPLATE / PAR-06:** l'ispezione completa del cancello rivela un ulteriore elenco statico
nel file esplicitamente vietato `frontend/index.template.html`. I tre record fanno fallire quel
test esistente. Non si modifica il file vietato né si indebolisce il test: preparare nel rapporto
il diff non applicato. La parità completa resta un gate aperto per l'owner. Il ledger non autorizza
la modifica del template e nessun build deve riscriverlo indirettamente.

Secondo emendamento: PE-10 mantiene una mappa attesa esplicita dei `modelsDevId` e fallisce
correttamente sui tre nuovi record. Aggiungere **`tests/model-catalog-models-dev.test.mjs`**
al ledger, modificando solo quell'attesa con `kimi: moonshotai`, `minimax: minimax`, `qwen: alibaba`.
Non è un aggiornamento di conteggio e non cambia il codice di catalogo.
Creare inoltre **`.claude/PI-template-non-applicato.patch`**, diff esatto revisionabile del
template vietato, senza applicarlo. Nessuna modifica richiesta a `runtime-owner-adapter.mjs`:
l'aggancio già presente è esercitato da PI-09.

Revisione di sicurezza e prezzi, prima dell'ultima modifica: PI-REG-ORIGINE estende il test
del percorso sonda anche alle barre inverse (un URL non deve poter cambiare origine).
Il candidato ausiliario MiniMax diventa M2.5: stesso minimo ingresso/uscita di M3, cache letta
a metà prezzo; riserve M3 e M2.5, mantenendo la particolarità M2.7 già testata nel traduttore.
La fixture viene ri-estratta dallo stesso GET fissato, non ricostruita dal registro.
Aggiungere PI-REG-AVVISI per il blocco prima della rete quando manca il canale degli avvisi;
rafforzare PI-09 sul corpo effettivamente trasmesso. Creare
**`.claude/PI-verifica-2026-09-12.json`** con gli esiti dell'ultima esecuzione per file.

## Esito e consegna

**Implementazione nei file autorizzati pronta; P-I non chiudibile come parità completa.**
Risultato fresco: **212 test, 211 superati, 1 fallito, 0 saltati**. Il fallimento è PAR-06:
il template statico vietato manca delle tre opzioni. Non è stato nascosto o trasformato in skip.
PG-01 è verde. Anche tutti i confronti con il GET pubblico integrale sono stati eseguiti.

### Record risultanti

23 record unici, 22 credenziali, 23 destinazioni chat, **20 voci Diretti** (17 iniziali più 3).
Nessun record separato Cina, Coding Plan, Moonshot o Alibaba. Gli id `kimi`, `minimax`, `qwen`
sono interni; le etichette mostrate sono **Kimi**, **MiniMax**, **Qwen**.
Tutti e tre dichiarano `destinazioneChat: true`, `credenziale: true`,
`chiaveObbligatoria: true`, `esecuzione: 'collegato'`, streaming e strumenti `dichiarato`.
Qui “collegato” descrive l'instradamento implementato, non una credenziale provata dal vivo.
I record completi sono in `src/provider-registry.mjs:198`, `:235`, `:275`.

Le riserve includono soltanto modelli pubblicati con `toolCalling: true`; `validaFallbackProviders`
respinge modelli non qualificati quando la sessione usa strumenti. Nessun nuovo provider resta
senza una riserva. I candidati ausiliari sono Kimi K2.6, MiniMax M2.5 e Qwen Flash.
Le variabili di indirizzo `MOONSHOT_BASE_URL`, `MINIMAX_BASE_URL`, `DASHSCOPE_BASE_URL` sono opzioni
del registro AVM, non dichiarazioni che gli SDK upstream le leggano automaticamente.

### File modificati o creati da Astra

Tutti i percorsi seguenti sono relativi a `harness-ui/`; non comprendono artefatti preesistenti.

| File | Riga di riferimento | Contenuto |
|---|---:|---|
| `src/provider-registry.mjs` | 198, 235, 275, 1173 | Tre record e validazione dei profili thinking/percorso sonda. |
| `src/provider-probe.mjs` | 51, 94, 104, 202, 240 | Proiezione sonda, origine modificabile, schema e paginazione DashScope. |
| `src/openai-compatible-runtime.mjs` | 73, 122 | Traduzione del thinking solo per modelli documentati, conflitti e avvisi. |
| `frontend/src/components/fonti-modelli.js` | 137 | Solo le tre nuove voci Diretti. |
| `frontend/tests/unit/fonti-modelli.test.mjs` | 16 | PI-UI-01, nomi umani e visibilità coerente. |
| `tests/provider-pi.test.mjs` | 1, 39, 229, 301, 353 | 15 test P-I, inclusi catalogo pubblico, sicurezza e confine HTTP. |
| `tests/fixtures/provider-pi-models-dev-2026-09-12.json` | 1 | Proiezione indipendente dei sei modelli, con provenienza, prezzi e date. |
| `tests/provider-registry-parita.test.mjs` | 57 | Riserve pubbliche estese con la fixture; PAR-06 resta intatto. |
| `tests/provider-pg.test.mjs` | 46–47 | Unico conteggio numerico modificato: 20 → 23 perché conta tutto il registro; gli undici P-G restano undici. |
| `tests/model-catalog-models-dev.test.mjs` | 279 | Tre coppie nella mappa esplicita PE-10; nessun conteggio cambiato. |
| `.claude/RAPPORTO-PI-KIMI-MINIMAX-QWEN-2026-09-12.md` | 1 | Dossier, ledger, emendamenti e consegna. |
| `.claude/PI-template-non-applicato.patch` | 1 | Diff esatto per l'owner, non applicato. |
| `.claude/PI-verifica-2026-09-12.json` | 1 | Esiti dell'ultima esecuzione per file. |

`provider-credential-store.mjs`, `model-destination.mjs`, `usage-cache.mjs`, `config.mjs` e
`model-catalog-models-dev.mjs` **non modificati**: le proiezioni già esistenti ricevono i record.
Nessuna installazione, build, migrazione, staging, commit o push.
`git diff --check`: uscita 0. `git diff --numstat` su tutti i percorsi vietati: vuoto.
Durante il lavoro è comparso anche un cambiamento concorrente nella coda debiti alla radice,
poi non più presente nel diff finale: non è stato modificato o ripristinato da Astra.

### Diff non applicati e contratto ancora aperto

Diff completo: [PI-template-non-applicato.patch](PI-template-non-applicato.patch).
Riguarda esclusivamente `frontend/index.template.html:1401`, nel `<select id="providerLab">`.
La riga HTML originale è lunga; la parte significativa del diff è:

```diff
 <option value="huggingface">Hugging Face</option>
+<option value="kimi">Kimi</option>
+<option value="minimax">MiniMax</option>
+<option value="qwen">Qwen</option>
 </select>
```

Il file `.patch` contiene la riga esatta, non questo estratto formattato.
Controllo di applicabilità eseguito dalla radice, uscita 0:

```powershell
rtk proxy git apply --check --unidiff-zero harness-ui/.claude/PI-template-non-applicato.patch
```

La stessa comparazione di insiemi usata da PAR-06 è verde sulla stringa proposta in memoria;
il template su disco è rimasto identico. **Il cancello sul checkout reale resta rosso.**
Il divieto dell'owner su questo file prevale sulla possibilità tecnica di scriverlo.
`src/runtime-owner-adapter.mjs`: diff applicato **vuoto**, diff proposto **nessuno**:
l'aggancio al traduttore esiste già a riga 552; PI-09 lo esercita con server HTTP finto.

### Verifiche fresche

Evidenza strutturata: [PI-verifica-2026-09-12.json](PI-verifica-2026-09-12.json).
Ogni file è stato eseguito con `rtk proxy node --test <file>`, in sequenza, da un solo runner.
Per il frontend è stato eseguito anche `rtk proxy node --test tests/unit/fonti-modelli.test.mjs`
con cartella corrente `harness-ui/frontend`: 15/15. Questa ripetizione non è sommata ai 212.

| File di test | Superati / totali | Saltati | Esito |
|---|---:|---:|---|
| `tests/provider-pi.test.mjs` | 15/15 | 0 | Verde, incluso PI-PUB. |
| `tests/provider-registry-parita.test.mjs` | 16/17 | 0 | Rosso solo PAR-06; PF-PAR-05 pubblico verde. |
| `tests/provider-pg.test.mjs` | 14/14 | 0 | Verde, inclusi PG-01 e PG-PUB. |
| `tests/provider-credential-pool.test.mjs` | 13/13 | 0 | Verde. |
| `tests/http-routes-providers.test.mjs` | 9/9 | 0 | Verde. |
| `tests/provider-zai.test.mjs` | 11/11 | 0 | Verde. |
| `tests/model-catalog-models-dev.test.mjs` | 27/27 | 0 | Verde. |
| `tests/provider-probe.test.mjs` | 12/12 | 0 | Verde. |
| `tests/provider-credential-store.test.mjs` | 9/9 | 0 | Verde. |
| `tests/openai-compatible-runtime.test.mjs` | 11/11 | 0 | Verde. |
| `tests/model-destination.test.mjs` | 15/15 | 0 | Verde. |
| `tests/usage-cache.test.mjs` | 9/9 | 0 | Verde. |
| `tests/runtime-owner-adapter.test.mjs` | 16/16 | 0 | Verde. |
| `tests/runtime-owner-adapter-fallback.test.mjs` | 19/19 | 0 | Verde. |
| `frontend/tests/unit/fonti-modelli.test.mjs` | 15/15 | 0 | Verde. |

I gate pubblici hanno ricevuto i JSON integrali tramite `TALOS_PI_CATALOGO_PUBBLICO`,
`TALOS_PG_CATALOGO_PUBBLICO`, `TALOS_PF_CATALOGO_PUBBLICO` e `TALOS_PF_OPENROUTER_PUBBLICO`,
solo nell'ambiente dei processi di test. Nessuna configurazione utente modificata.
Anche [OpenRouter modelli](https://openrouter.ai/api/v1/models) è stato letto senza credenziali
per il gate P-F: HTTP 200, 445 modelli, SHA-256
`f2dc1cfe875dde43322623e22587c9f842df378d39e37a56e758e82170dd0567`.

### Prova reale o simulata

**Server finti dichiarati, nessuna inferenza reale.** Controllate solo presenza/assenza delle
quattro variabili chiave: tutte assenti; nessun valore stampato, nessuna lettura del portachiavi
di sistema. Le chiamate esterne effettuate sono letture pubbliche della documentazione e dei
cataloghi, senza generazione di token.
PI-03 effettua 25 richieste HTTP locali complessive: tutti i provider, 200/401/404, corpi malformati
e paginazione Qwen; PI-09 effettua 6 richieste chat locali, due per provider, con tool call,
ritorno dello strumento e conservazione del messaggio assistant. Le porte sono effimere e il
banco controlla che non siano 4174. Il server dell'owner non è stato interrogato.
PI-10 attraversa le rotte prodotto isolate; PI-REG-AVVISI prova il blocco prima della rete quando
il chiamante non può rendere visibile una modifica richiesta dal traduttore.

### Cosa non è stato verificato

- Autenticazione reale dei tre account, disponibilità per regione/credito, generazione e tool
  calling upstream, conteggi cache realmente restituiti, latenza, spesa e qualità degli ausiliari.
- Percorso completo dal composer finale con retry, URL naturali, reload e persistenza; viewport,
  tastiera, reduced motion e stato d'errore nel browser. Il test a due turni prova il confine
  HTTP, non sostituisce questa accettazione umana.
- Storico MiniMax con thinking inline o `reasoning_details` attraverso l'intero kernel,
  specialmente con `reasoning_split: true`; nessuna attivazione implicita di quel parametro.
- Compatibilità Anthropic di MiniMax nella lane P-J, endpoint Cina e domini workspace dal vivo.
- Modelli nuovi non elencati nel profilo: i loro parametri passano invariati, senza applicare
  restrizioni dedotte dal nome. K3 non eredita le limitazioni K2.
- Build frontend e suite globali fuori dal sottosistema: non eseguite. La superficie statica
  resta incompleta finché il template vietato non viene aggiornato dall'owner.

### Pin documentali riproducibili

SHA-256 dei Markdown ufficiali ottenuti il 12/09; sono impronte delle letture, non versioni
contrattuali promesse dai fornitori:

| Fonte | SHA-256 |
|---|---|
| `platform.kimi.ai/docs/api/chat.md` | `6ba3e5887e4a4d697217876300dd2d3a784f7406744086a94e393e1ad91e96a0` |
| `platform.kimi.ai/docs/api/models-overview.md` | `2de5c70fee5a1ecdb10c07b4cf858eb0a878bcc36917166c53b08801bf9b15fd` |
| `platform.kimi.ai/docs/api/list-models.md` | `9a74a2cf84eebbdfdf2793ed81e167b0df326051d48819d2d00a4a522180da7f` |
| `platform.minimax.io/docs/api-reference/text-openai-api.md` | `843901ed9bb23eaf3cbedff886db9b37cb0838e360dd6c8375cd11a92005c41c` |
| `platform.minimax.io/docs/api-reference/text-prompt-caching.md` | `13cb8a9fbae285e14b40e791eb3f2c31b254224b75be489941a4a2d58e64ee21` |
| `platform.minimax.io/docs/api-reference/text-chat-openai.md` | `5a59281c6171f6356e1bf5214a176623dfb52b6faaf69e31a65edd172712dffd` |

### Proposta di testo di commit

Solo testo da valutare dopo la chiusura del template, non eseguito:

```text
feat(provider): aggiunge Kimi, MiniMax e Qwen diretti

Registra gli endpoint internazionali, le credenziali e le riserve documentate.
Adatta il thinking per modello e integra il catalogo nativo paginato DashScope.
Verifica cache, sonde, isolamento e fallback con server locali e fonti pubbliche.
```

### Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

**Cosa deve fare l'owner:** valutare e applicare il diff del template nel proprio perimetro;
poi rieseguire PAR-06 e la parità completa. Configurare una chiave internazionale quando vorrà
qualificare l'integrazione reale, mantenendo separata ogni eventuale autorizzazione di spesa.

**Cosa faccio io:** consegno i 13 file elencati, i test e il diff non applicato. Nessun commit,
nessuna chiamata a pagamento, nessuna modifica ai file vietati.

**Cosa rimane:** PAR-06 sul template reale e la qualifica dal composer attraverso upstream reale.
P-I non viene dichiarato completamente chiuso finché quei gate non sono soddisfatti.
