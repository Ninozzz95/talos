# PO-14 P-F — riserve e modello ausiliario, 12/09/2026

Rapporto in `harness-ui/.claude/`: la cartella `.claude/` alla radice è fuori dall'area scrivibile. Nessun commit, staging o push. Sottosistema posseduto: integrazione cataloghi del desktop e modulo del selettore esplicitamente autorizzato. Nessun agente delegato.

## Ricerca svolta prima del codice

Consultazione di tutte le fonti: **12/09/2026**; la data indica la verifica, non la pubblicazione.

1. **Hermes primo.** Clone locale `hermes-agent-v21`, pin `365e2835d490a053d076daa3b429371d6f35210f`. [providers/base.py](https://github.com/NousResearch/hermes-agent/blob/365e2835d490a053d076daa3b429371d6f35210f/providers/base.py), righe 93–129: `fallback_models: tuple = ()`, elenco curato per strumenti quando fallisce la scoperta; `default_aux_model: str`, vuoto significa modello principale; `resolve_aux_model()` può risolvere una scelta aggiornata e deve fallire senza eccezioni. [agent/auxiliary_client.py](https://github.com/NousResearch/hermes-agent/blob/365e2835d490a053d076daa3b429371d6f35210f/agent/auxiliary_client.py), righe 1–46: risoluzione per attività, opzioni `auxiliary.<task>.model/provider`, protezione `free_only`; la modalità automatica testuale parte anche dal modello principale. Il campo da solo **non prova** che ogni ausiliario costi meno. Decisione: adattare i dati dichiarativi dietro il registro AVM; non importare il router Python, il cambio automatico di fornitore o la sua politica di spesa. Nessun sorgente Hermes redistribuito.
2. **Claude Code.** [Configurazione](https://code.claude.com/docs/en/model-config) e [costi](https://code.claude.com/docs/en/costs): `ANTHROPIC_DEFAULT_HAIKU_MODEL` governa Haiku e funzionalità in background; il vecchio `ANTHROPIC_SMALL_FAST_MODEL` è deprecato. La pagina dei costi nomina i riassunti delle conversazioni per `--resume` fra i lavori in background. Questa documentazione non dimostra che ogni titolo e ogni compattazione usino Haiku. Adattare la distinzione di ruolo, non dedurre una qualifica di compattazione.
3. **Codex.** [Configurazione ufficiale](https://learn.chatgpt.com/docs/config-file/config-reference) consultata con OpenAI Docs. Clone locale pin `728cb12fe5794b0c3a8e776fb4994b1650b973a8`, [compact.rs](https://github.com/openai/codex/blob/728cb12fe5794b0c3a8e776fb4994b1650b973a8/codex-rs/core/src/compact.rs), righe 245–300: la compattazione riusa `TurnContext`, informazioni del modello e client della sessione. L'approfondimento conclusivo ha trovato il percorso distinto dei **titoli** in [thread_title.rs](https://github.com/openai/codex/blob/728cb12fe5794b0c3a8e776fb4994b1650b973a8/codex-rs/tui/src/app/thread_title.rs), righe 23 e 43–55: `gpt-5.6-luna`, sforzo basso, soltanto con provider OpenAI, account ChatGPT e modello presente nel catalogo; altrimenti modello corrente. L'estrazione delle memorie in [phase1.rs](https://github.com/openai/codex/blob/728cb12fe5794b0c3a8e776fb4994b1650b973a8/codex-rs/memories/write/src/phase1.rs), righe 194–202, prende `memories.extract_model` oppure la preferenza del provider. È evidenza di ruoli separati, non di autorizzazione a sostituire il modello nella compattazione nativa TALOS. Il modello economico di Codex non viene copiato come default API: P-F sceglie il minimo documentato richiesto dall'owner.
4. **aider.** [Opzioni ufficiali](https://aider.chat/docs/config/options.html), `--weak-model` / `AIDER_WEAK_MODEL`: messaggi di commit e riassunto della cronologia, predefinito dipendente dal principale. Clone pin `5dc9490bb35f9729ef2c95d00a19ccd30c26339c`, `aider/models.py:603–620`, `aider/coders/base_coder.py:511`: override esplicito, altrimenti impostazione del modello; senza scelta distinta si usa il principale; il riassuntore riceve debole e principale. Adattare il lettore puro, senza integrare esecuzione o commit.

## Scelte dei fornitori e fonti ufficiali

Prezzi citati in USD per milione di token testuali, ingresso/uscita standard: servono a motivare il campo, non sono spesa misurata. Nessun prezzo viene inventato nelle righe della riserva.

| Fornitore | Modelli di riserva, id upstream | Ausiliario | Fonti verificate il 12/09/2026 e motivazione |
|---|---|---|---|
| OpenRouter | `liquid/lfm-2.5-2.6b:free`, `openai/gpt-5-nano` | `liquid/lfm-2.5-2.6b:free` | [API pubblica](https://openrouter.ai/api/v1/models), [strumenti](https://openrouter.ai/docs/guides/features/tool-calling), [LFM](https://openrouter.ai/liquid/lfm-2.5-2.6b:free): `tools` presente, prezzo 0/0. Una scelta a pari minimo fra modelli gratuiti, senza promessa di disponibilità o qualità. |
| DeepSeek | `deepseek-flash`, `deepseek-v4-pro` | `deepseek-flash` | [Modelli, strumenti e prezzi](https://api-docs.deepseek.com/quick_start/pricing/): Flash 0,15/0,60 fuori picco e 0,30/1,20 al picco, meno di Pro nelle stesse fasce; nomi V4 Flash precedenti sono alias di modelli ritirati. |
| Z.AI | `glm-4.7-flash`, `glm-4.7` | `glm-4.7-flash` | [GLM 4.7](https://docs.z.ai/guides/llm/glm-4.7), [contratto strumenti](https://docs.z.ai/api-reference/llm/chat-completion), [prezzi](https://docs.z.ai/guides/overview/pricing): Flash gratuito, pari minimo con altre varianti gratuite; GLM 4.7 0,60/2,20. |
| Anthropic | `claude-haiku-4-5-20251001`, `claude-sonnet-5` | `claude-haiku-4-5-20251001` | [Panoramica ufficiale](https://platform.claude.com/docs/en/models/overview): tutti i modelli correnti supportano strumenti; Haiku 1/5, Sonnet 2/10, Opus 5/25, Fable 10/50. Si escludono modelli ritirati. |
| Gemini | `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite` | `gemini-2.5-flash-lite` | [2.5](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite), [3.1](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [prezzi](https://ai.google.dev/gemini-api/docs/pricing): strumenti supportati; 2.5 0,10/0,40 contro 3.1 0,25/1,50. Confronto sul piano pagato standard, non sulle quote gratuite. |
| OpenAI | `gpt-5-nano`, `gpt-5-mini` | `gpt-5-nano` | [Nano](https://developers.openai.com/api/docs/models/gpt-5-nano), [Mini](https://developers.openai.com/api/docs/models/gpt-5-mini): strumenti supportati; Nano 0,05/0,40, Mini 0,25/2. Nano costa meno anche delle opzioni 4o mini, 4.1 nano, 5.4 nano e 5.6 Luna presenti nel catalogo. |
| Ollama | `null` | `null` | Scoperta locale, capacità dipendenti da ciò che è installato. |
| LM Studio | `null` | `null` | Il catalogo pubblico di metadati non equivale ai modelli installati. |
| Motore locale | `null` | `null` | Scoperta del supervisore locale. |
| Hugging Face | `null` | `null` | Il record TALOS abilita download, non inferenza/chat remota. |

**Pin dati e decisione upstream.** Si mantiene l'integrazione diretta models.dev di P-E, schema `e7a74d6dc7ce56d1a9dda94c18fcf185248d77b4`, licenza MIT già conservata nell'adapter. GET pubblico reale `https://models.dev/api.json`: SHA-256 `f8c50427f9a7e5bd44ec1079a3db1899781b486e2b4e4da5f462ac6789ce19ee`; OpenRouter `/api/v1/models`: SHA-256 `331fbfe1642ab2396a1d3b2f55ebe15cf5fb4872ce5659cbb0367a61ad9f0e54`. File grezzi in `%LOCALAPPDATA%/Temp/pf-models-dev-2026-09-12.json` e `pf-openrouter-2026-09-12.json`. Nessuna API di inferenza. Nei test si conserva una proiezione indipendente del primo snapshot; un cancello opzionale legge anche il JSON pubblico completo appena acquisito. Gli endpoint non offrono una versione immutabile del dataset: l'impronta fissa l'evidenza, gli id commerciali restano soggetti a ritiro.

## Registro esecutivo prima delle modifiche di prodotto

File esatti da modificare:

- `src/provider-registry.mjs`: `REGISTRO_FORNITORI`, `verificaRegistro`; nuovi lettori pubblici `modelloAusiliarioPer(fornitoreId)` e `catalogoDiRiservaPer(fornitoreId)`. Campi `modelliDiRiserva` (oggetti congelati con id, nome, fonte, data, strumenti dichiarati) e `modelloAusiliario` (id upstream o null). Restano stabili tutti i derivati pubblici, `fornitore`, `ProviderRegistryError`, wire e destinazioni.
- `src/model-catalog-models-dev.mjs`: `createProviderModelCatalog().ottieni`, errore di acquisizione senza copia → riserva; `createModelsDevCatalog`, `ModelsDevCatalogError`, pin, prezzi e cache persistente restano compatibili. Catalogo letto ma fornitore assente mantiene l'errore esplicito; catalogo valido vuoto non si trasforma in un guasto di rete.
- `src/model-catalog.mjs`: `createModelCatalog().ottieni`; copia in memoria prima della riserva, metadati e motivo espliciti, recupero al successivo fetch riuscito. `ModelCatalogError` resta esportato. Nessuna cache su disco nuova.
- `frontend/src/components/fonti-modelli.js`: `fontiDelSelettore`, `descrizioneModelloSelettore`; etichetta umana della scheda e descrizione di riserva. Restano stabili `modelliDellaFonte`, id di scelta e `aggiornaTestoModelloSelettore`.
- `tests/provider-registry-parita.test.mjs`: PF-PAR-01..05, campi obbligatori, ausiliari/null, confronto con dati pubblici e mutanti assente/non-tool.
- `tests/model-catalog-models-dev.test.mjs`: PF-MD-01..05, interruzione senza copia, recupero, cache prioritaria, HTTP in memoria, chiavi e sanitizzazione.
- `tests/model-catalog.test.mjs`: modifica delle aspettative precedenti sugli errori; PF-OR-01..04, rete/HTTP/JSON, copia prioritaria, recupero, percorso HTTP in memoria.
- `frontend/tests/unit/fonti-modelli.test.mjs`: PF-UI-01..03, etichetta e dettagli, ritorno normale e testo sicuro.
- Questo rapporto, unico file nuovo previsto. Nessuna cancellazione.

**RED:** prove di campi mancanti/riserve e renderer falliscono prima dell'implementazione. **GREEN e regressioni autorizzate:** `rtk proxy node --test tests/provider-registry-parita.test.mjs tests/model-catalog-models-dev.test.mjs tests/model-catalog.test.mjs tests/http-routes-providers.test.mjs frontend/tests/unit/fonti-modelli.test.mjs`. Solo questi file; nessuna suite generale o build. **Cancello upstream reale:** JSON pubblico completo contro tutte le riserve, OpenRouter anche `supported_parameters: tools`. **Prova visibile:** dati HTTP → funzioni della scheda → testo del renderer; eventuale browser completo non si presume verificato. **Ripristino:** rimuovere soltanto gli hunk P-F elencati dal diff finale, preservando qualsiasi modifica concorrente; nessuna operazione Git automatica di ripristino.

**Vincolo scoperto prima del piano:** `frontend/src/legacy/app.js` richiama il renderer dettagliato solo per `catalogo.fonte === 'models.dev'`. La scheda può già mostrare l'etichetta tramite il modulo autorizzato. Il raccordo di una riga per mostrare anche il motivo nei dettagli sarà riportato come diff non applicato, senza falsificare `fonte`.

## Esito e verifiche

Amendamenti del registro esecutivo: PF-OR-05 aggiunto per la rotta pubblica; il primo tentativo del banco usava erroneamente `modelCatalog` invece dell'iniezione già esistente `catalogoModelliFn`, causando 404. Corretto soltanto il test dopo lettura della firma, senza cambiamenti alla rotta. OpenRouter applica inoltre un limite di attesa di 15.000 ms, uguale al valore predefinito dell'adapter models.dev: è una politica di attesa, non una durata prestazionale misurata. PF-PAR-06 copre l'isolamento dei risultati dal registro e i null del lettore di riserva. PF-MD-04 usa infine `catalogoFornitoriFn`, la stessa iniezione di `server.mjs`, invece della porta compatibile `providerProbe` usata dai vecchi test P-E.

RED eseguito prima del codice: fallimenti sulle nuove prove di campi, riserve, recupero e testo, come previsto. Prima esecuzione completa dopo implementazione: 79 test, 77 riusciti, 1 fallito (iniezione errata nel banco PF-OR-05), 1 saltato (JSON pubblico opzionale). Segue il risultato finale.

| File eseguito | Test | Esito finale |
|---|---:|---|
| `tests/provider-registry-parita.test.mjs` | 17 | Tutti superati, compreso PF-PAR-05 con entrambi i JSON pubblici |
| `tests/model-catalog-models-dev.test.mjs` | 27 | Tutti superati |
| `tests/model-catalog.test.mjs` | 15 | Tutti superati |
| `tests/http-routes-providers.test.mjs` (non modificato) | 8 | Tutti superati |
| `frontend/tests/unit/fonti-modelli.test.mjs` | 13 | Tutti superati |
| **Totale** | **80** | **80 riusciti, 0 falliti, 0 saltati, 0 annullati** |

Comando finale, con queste due variabili impostate **solo nell'ambiente del processo di test** sui file acquisiti:

```powershell
# TALOS_PF_CATALOGO_PUBBLICO = %LOCALAPPDATA%/Temp/pf-models-dev-2026-09-12.json
# TALOS_PF_OPENROUTER_PUBBLICO = %LOCALAPPDATA%/Temp/pf-openrouter-2026-09-12.json
rtk proxy node --test --test-reporter=tap tests/provider-registry-parita.test.mjs tests/model-catalog-models-dev.test.mjs tests/model-catalog.test.mjs tests/http-routes-providers.test.mjs frontend/tests/unit/fonti-modelli.test.mjs
rtk proxy git diff --check
```

Log TAP completo: `%LOCALAPPDATA%/Temp/pf-green-2026-09-12.tap`. Senza le variabili la parità sullo snapshot indipendente rimane sempre attiva; solo la rilettura dei JSON completi viene saltata. La rete non è una dipendenza dei test ordinari. `git diff --check` superato; Git segnala soltanto l'impossibilità di leggere l'ignore globale, senza errori di diff.

Il cancello pubblico ha verificato **12 riserve su 6 fornitori**, tutte presenti in models.dev e tutte con `tool_call: true`; le 2 OpenRouter compaiono anche nel suo elenco con `tools`. Le prove contrarie respingono il nome inventato e il modello marcato senza strumenti. I sei ausiliari sono verificati separatamente; i quattro record senza inferenza remota dichiarano entrambi i campi `null`.

## File toccati e righe

Percorsi relativi a `harness-ui/`; righe del risultato finale:

| File | Righe e modifica |
|---|---|
| `src/provider-registry.mjs` | 93, 138, 202, 280, 331, 384: riserve e ausiliari; 431, 463, 506, 542: null; 592: validazione; 666: `modelloAusiliarioPer`; 671: proiezione `catalogoDiRiservaPer` |
| `src/model-catalog-models-dev.mjs` | 10: import; 248: porta dei cataloghi diretti e gestione della riserva |
| `src/model-catalog.mjs` | 17: import; 75: acquisizione, attesa massima, copia e riserva |
| `frontend/src/components/fonti-modelli.js` | 103: etichette delle schede; 164: descrizione umana e data della riserva |
| `tests/provider-registry-parita.test.mjs` | 4: import API; 57: snapshot; 76–158: PF-PAR-01..06 |
| `tests/model-catalog-models-dev.test.mjs` | 32–122: PF-MD-01..05 |
| `tests/model-catalog.test.mjs` | 4: import; 73–156: aspettative aggiornate, copia prioritaria e rotta PF-OR-01..05 |
| `frontend/tests/unit/fonti-modelli.test.mjs` | 40–67: PF-UI-01..03 |
| `.claude/RAPPORTO-PF-FALLBACK-MODELLI-2026-09-12.md` | 1: questo rapporto, ricerca e registro esecutivo |

Nessun file fuori da questi nove è stato scritto nel repository. Le modifiche concorrenti della ricerca, compresi kernel e test della ricerca, rimangono presenti. Nessuna dipendenza o porta condivisa modificata.

## Comportamento consegnato e limiti

La rotta restituisce `modelli` nel contratto esistente, più `modelliDiRiserva` per identificare la riserva, `fonte: 'riserva'` e `motivo: 'catalogo non raggiungibile: elenco di riserva del 12/09/2026'`. Ogni modello conserva provenienza datata e nome umano; prezzi, limiti, data di acquisizione ed età della copia rimangono null perché non misurati per quella riserva. La presenza nel catalogo è una dichiarazione di capacità, non una prova di esecuzione con la chiave dell'utente.

Il ritorno alla rete elimina la riserva; models.dev conserva il rinvio esistente di 5 minuti dopo un guasto, superabile tramite `forzaAggiornamento` nel contratto del catalogo. OpenRouter riprova alla richiesta successiva. La riserva non viene salvata come se fosse un catalogo acquisito. La copia valida ha precedenza; quella corrotta è rifiutata e segnalata. Il controllo delle chiavi dei diretti rimane prima di qualsiasi riserva. Un catalogo raggiunto ma realmente vuoto, o che non pubblica il fornitore, mantiene il significato P-E: **non è un guasto di rete**.

Le schede del selettore mostrano «OpenRouter · elenco di riserva», «DeepSeek · elenco di riserva», ecc.; l'app esistente usa già queste etichette come testo dei pulsanti. Il nome del modello resta umano. Il nuovo testo dettagliato è verificato a livello di modulo; per usarlo anche nelle righe della riserva serve il raccordo sotto.

## Diff non applicati

Un solo raccordo visivo proposto, `frontend/src/legacy/app.js:6023`, file vietato in questo lotto. Serve a mostrare il motivo completo anche **sotto ogni modello**; l'etichetta della scheda è già attiva con i file autorizzati.

```diff
--- a/harness-ui/frontend/src/legacy/app.js
+++ b/harness-ui/frontend/src/legacy/app.js
@@
-      if (modello.catalogo?.fonte === 'models.dev') {
+      if (['models.dev', 'riserva'].includes(modello.catalogo?.fonte)) {
```

Non servono diff a `server.mjs` o `src/http-app.mjs`: i raccordi P-E e OpenRouter esistono già e sono stati letti. Nessun diff a compattazione, kernel, sessioni o «Migliora il prompt» viene proposto come applicabile senza i cancelli seguenti.

## Aggancio futuro degli ausiliari

`modelloAusiliarioPer(fornitoreId)` restituisce l'id upstream o null; non esegue inferenza, non cambia la sessione, non inventa un modello per i locali. Il primo aggancio sarà nella preparazione della richiesta di compattazione, **prima** di chiamare `createNativeCompactionAdapter().compact()` in `src/context-native-compaction.mjs`. Chi prepara il modello deve risolvere credenziale/profilo, capacità, contesto e riserva di uscita per l'ausiliario esatto.

**Una compattazione con un modello diverso da quello qualificato dal vivo è vietata da `CTX_NATIVE_UNQUALIFIED`.** `qualifyNativeCompaction({ model, evidenceId })` richiede corrispondenza esatta di fornitore, modello, pin del protocollo, hash SHA-256 dell'artefatto e trasporto `live`; devono passare `compaction`, `continuation`, `portableRecovery` e `cancellation`. L'evidenza del modello grosso non qualifica Nano/Haiku/Flash. Occorreranno un RED sullo scambio di identità, una qualifica viva specifica e le regressioni del ciclo di contesto prima di collegare il campo.

Per i titoli, l'eventuale nuovo servizio di denominazione potrà leggere lo stesso campo quando sarà autorizzato; oggi il titolo viene dal primo messaggio, quindi aggiungere inferenza **introdurrebbe un costo**. Serviranno prove di persistenza dopo ricaricamento, rinomina manuale preservata, errori e contabilizzazione. BC-15 resta vincolante: «Migliora il prompt» usa il modello della chat e non deve consumare questo lettore.

## Cosa non è stato verificato

- Nessuna inferenza, nessuna chiamata a pagamento, nessuna verifica di credenziali reali o disponibilità commerciale sul singolo account; nemmeno i modelli gratuiti sono stati chiamati.
- Nessuna qualifica viva della compattazione; nessun risparmio effettivo misurato. **Il costo corrente degli ausiliari non cambia in P-F**, perché il lettore è preparato ma non collegato, come richiesto.
- Nessuna build, suite completa, Playwright, sessione Electron o verifica visiva desktop/mobile, tastiera e movimento ridotto. Provati i moduli UI e le risposte HTTP; il browser completo resta da verificare, in particolare la larghezza delle schede con etichetta più lunga.
- Nessun avvio dell'applicazione sulla porta 4174. Le nuove prove HTTP P-F sono in memoria; gli 8 test provider esistenti aprono porte effimere con `listen(0)` e le chiudono tramite `t.after`. Il processo di test è terminato; nessun server proprio lasciato attivo.
- models.dev e documentazione ufficiale non sono sempre allineati sui prezzi: ad esempio GLM 5.3 Flash nel JSON riporta 0,075/0,25, mentre la pagina ufficiale riporta 0,15/0,50. P-F non modifica i prezzi P-E e non usa quel modello per motivare l'ausiliario; una correzione del catalogo è fuori lotto.

## Proposta di testo di commit

```text
PO-14 P-F: aggiungi riserve datate e ausiliari nel registro fornitori

Mantieni disponibili i modelli remoti durante un guasto del catalogo senza copia,
con provenienza esplicita e ritorno automatico al catalogo recuperato.
Aggiungi il lettore puro degli ausiliari, senza collegare la compattazione.
Verifica parità pubblica, percorsi HTTP e testo del selettore: 80 test superati.
```

È soltanto una proposta testuale: nessun `git add`, `git commit` o `git push` eseguito.

## Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

**Cosa deve fare l'owner:** revisionare i nove file su disco; far applicare il singolo raccordo visivo nel file della propria corsia e verificare il selettore nell'app completa; decidere separatamente quando avviare la qualifica viva degli ausiliari.

**Cosa faccio io:** consegno registro, riserve, ritorno al catalogo, lettore ausiliario, prove nei due versi e rapporto; nessuna operazione Git di scrittura, nessuna chiamata a pagamento, nessun cambio ai file vietati.

**Cosa rimane:** raccordo dei dettagli della riserva e prova visiva completa; integrazione futura di titoli/compattazione con i cancelli indicati; manutenzione periodica delle fonti datate. P-F prepara il risparmio futuro, non lo dichiara già ottenuto.
